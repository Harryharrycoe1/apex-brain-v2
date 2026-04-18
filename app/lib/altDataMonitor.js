// APEX BRAIN V5.0 — ALT DATA MONITOR
// Full implementation replacing empty stub. Powers peace signal framework.
//
// Peace signal scoring (max 8 points):
//   Signal 1 (Backchannel):    0-2 pts (Oman, Qatar, Pakistan, Egypt, Turkey, UK mediator activity)
//   Signal 2 (Hormuz AIS):     0-1 pts (tanker transit normalising)
//   Signal 3 (War insurance):  0-2 pts (war-risk premiums dropping)
//   Signal 4 (Trump tone):     0-1 pts (deal-making language in recent news)
//   Signal 5 (Qatar mediator): 0-1 pts (Qatari envoy activity)
//   Signal 6 (Brent silent):   0-1 pts (Brent down >3% on no news, low volume)
//
// Score >= 3 = EXIT SEQUENCE ARMED (per Operating Bible)

// ═══ RSS FEED HELPER ═══
async function fetchRSS(query, maxAgeHours = 24) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+when:1d&hl=en-GB`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 APEX-MACRO/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    const cutoff = Date.now() - maxAgeHours * 3600000;
    while ((m = re.exec(xml)) !== null && items.length < 20) {
      const c = m[1];
      const title = c.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
      const link = c.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
      const pubDate = c.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || "";
      const desc = c.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim().slice(0, 300) || "";
      if (!title || !pubDate) continue;
      const ts = new Date(pubDate).getTime();
      if (ts < cutoff) continue;
      items.push({ title, link, desc, pubDate, age_hours: Math.round((Date.now() - ts) / 3600000) });
    }
    return items;
  } catch (e) {
    return [];
  }
}

// ═══ YAHOO PRICE HELPER (for Brent signal) ═══
async function fetchYahooBars(symbol, range = "5d") {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
    const volumes = result?.indicators?.quote?.[0]?.volume?.filter(v => v != null) || [];
    return { closes, volumes, meta: result?.meta };
  } catch { return null; }
}

// ═══ SIGNAL 1: BACKCHANNEL / MEDIATOR ACTIVITY ═══
// Weight: 2 points
// Keywords indicating third-country intermediary activity
export async function fetchTrumpStatements() {
  // Returns recent Trump-adjacent news used by signal 4 (tone) AND signal 1 (backchannel if messaging Iran)
  const queries = [
    "Trump Iran deal OR negotiation OR talks",
    "Trump Iran ultimatum",
    "Trump Iran ceasefire",
  ];
  const all = [];
  for (const q of queries) {
    const items = await fetchRSS(q, 48);
    all.push(...items);
  }
  // Deduplicate by title prefix
  const seen = new Set();
  return all.filter(i => {
    const k = i.title.toLowerCase().slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 20);
}

export function analyzeTrumpTone(items) {
  if (!items?.length) return { tone: "unknown", score: 0, reason: "No Trump statements found", sample_size: 0 };

  // Deal-making keywords (positive peace signal)
  const dealMaking = /\b(reach(ed)? out|great deal|opportunity|talks|negotiat|ceasefire|peace|diplomacy|envoy|withdrawal|stand.down|open.to.talks)\b/i;
  // Escalation keywords (negative peace signal — but note: ultimatums are ambiguous per userMemories Rule 2)
  const escalation = /\b(strike|attack|destroy|annihilat|war|military action|maximum pressure|bomb)\b/i;
  const ultimatum = /\b(ultimatum|deadline|or else|must|demand)\b/i;

  let dealScore = 0, escalationScore = 0, ultimatumCount = 0;
  for (const item of items) {
    const text = item.title + " " + item.desc;
    if (dealMaking.test(text)) dealScore++;
    if (escalation.test(text)) escalationScore++;
    if (ultimatum.test(text)) ultimatumCount++;
  }

  // Per userMemories Rule 2: ultimatums are AMBIGUOUS not bearish.
  // If deal-making language appears alongside ultimatum, score partial (0.5).
  let toneScore = 0;
  let reason = "";
  if (dealScore >= 2 && dealScore > escalationScore) {
    toneScore = 1;
    reason = `${dealScore} deal-making mentions vs ${escalationScore} escalation`;
  } else if (dealScore >= 1 && ultimatumCount >= 1) {
    // Ambiguous: ultimatum + private deal signals = 0.5 (Rule 2)
    toneScore = 0.5;
    reason = `Ambiguous: ${ultimatumCount} ultimatum(s) + ${dealScore} deal mention(s) — Rule 2 partial credit`;
  } else {
    toneScore = 0;
    reason = `${escalationScore} escalation vs ${dealScore} deal-making — no tone shift`;
  }

  return {
    tone: toneScore >= 0.5 ? "softening" : "firm",
    score: toneScore,
    deal_making_mentions: dealScore,
    escalation_mentions: escalationScore,
    ultimatum_mentions: ultimatumCount,
    reason,
    sample_size: items.length,
    recent_headlines: items.slice(0, 3).map(i => i.title),
  };
}

// ═══ SIGNAL 2: HORMUZ AIS / TANKER ACTIVITY ═══
export async function fetchHormuzActivity() {
  const items = await fetchRSS("hormuz tanker transit OR reopening", 48);
  const normalising = /\b(transit|reopen|resum|return|normal|escort|convoy end|passage restored)\b/i;
  const closed = /\b(closed|block|mined|attack|dark|ais off|suspend)\b/i;

  let normalisingCount = 0, closedCount = 0;
  for (const item of items) {
    const text = item.title + " " + item.desc;
    if (normalising.test(text)) normalisingCount++;
    if (closed.test(text)) closedCount++;
  }

  const score = normalisingCount > closedCount && normalisingCount >= 2 ? 1 : 0;
  return {
    score,
    status: score ? "normalising" : "disrupted",
    normalising_mentions: normalisingCount,
    closed_mentions: closedCount,
    sample_size: items.length,
    recent_headlines: items.slice(0, 3).map(i => i.title),
  };
}

// ═══ SIGNAL 3: WAR-RISK INSURANCE ═══
export async function fetchInsuranceSignal() {
  const items = await fetchRSS("war risk insurance premium tanker OR Lloyd's hormuz", 72);
  const falling = /\b(fall|drop|reduc|lower|cut|ease|cheap|re.quot|normal)\b/i;
  const rising = /\b(surge|spike|rise|elev|climb|hike|tripl|doubl)\b/i;

  let fallingCount = 0, risingCount = 0;
  for (const item of items) {
    const text = item.title + " " + item.desc;
    if (falling.test(text)) fallingCount++;
    if (rising.test(text)) risingCount++;
  }

  // Weight 2 points — either 0 or 2 based on directional signal
  const score = fallingCount > risingCount && fallingCount >= 2 ? 2 : 0;
  return {
    score,
    direction: score ? "re-pricing peace" : "elevated",
    falling_mentions: fallingCount,
    rising_mentions: risingCount,
    sample_size: items.length,
    recent_headlines: items.slice(0, 3).map(i => i.title),
  };
}

// ═══ SIGNAL 5: QATAR MEDIATOR ACTIVITY ═══
async function fetchQatarSignal() {
  const items = await fetchRSS("Qatar envoy Iran OR Qatar Doha Iran talks", 48);
  const active = /\b(envoy|mediator|talks|shuttle|host|broker|mediat|dialogue|meeting)\b/i;

  let activeCount = 0;
  for (const item of items) {
    const text = item.title + " " + item.desc;
    if (active.test(text)) activeCount++;
  }

  const score = activeCount >= 2 ? 1 : 0;
  return {
    score,
    status: score ? "active mediation" : "quiet",
    mediation_mentions: activeCount,
    sample_size: items.length,
    recent_headlines: items.slice(0, 3).map(i => i.title),
  };
}

// ═══ SIGNAL 6: BRENT SILENT DROP ═══
async function fetchBrentSignal() {
  const data = await fetchYahooBars("BZ=F", "5d");
  if (!data || data.closes.length < 2) return { score: 0, status: "no data", reason: "Could not fetch Brent" };

  const yesterday = data.closes[data.closes.length - 2];
  const today = data.closes[data.closes.length - 1];
  const changePct = ((today - yesterday) / yesterday) * 100;

  // Volume check: is today's volume BELOW normal? (silent drop = smart money, not panic)
  const recentAvg = data.volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const olderAvg = data.volumes.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
  const volRatio = olderAvg > 0 ? recentAvg / olderAvg : 1;

  // Silent drop: Brent -3% or worse, on below-average volume
  const score = (changePct <= -3 && volRatio < 1.0) ? 1 : 0;

  return {
    score,
    current: Math.round(today * 100) / 100,
    previous: Math.round(yesterday * 100) / 100,
    change_pct: parseFloat(changePct.toFixed(2)),
    volume_ratio: parseFloat(volRatio.toFixed(2)),
    status: score ? "silent drop detected" : `${changePct.toFixed(1)}% change — not a silent drop`,
    reason: score
      ? `Brent -${Math.abs(changePct).toFixed(1)}% on ${(volRatio * 100).toFixed(0)}% of normal volume`
      : changePct > -3
        ? "Brent not falling significantly"
        : `Brent down but on ${(volRatio * 100).toFixed(0)}% volume — panic, not smart money`,
  };
}

// ═══ OPTIONS FLOW (STUB — not used in peace score, available for future) ═══
export async function fetchOptionsFlow(ticker) {
  // Options flow requires paid data source (Unusual Whales, etc.)
  // Return null so callers can gracefully handle absence.
  return { ticker, available: false, reason: "Options flow requires paid data source" };
}

// ═══ COMPOSITE PEACE SIGNAL ═══
export async function computePeaceSignal() {
  // Fetch all signals in parallel
  const [trumpItems, hormuz, insurance, qatar, brent] = await Promise.all([
    fetchTrumpStatements(),
    fetchHormuzActivity(),
    fetchInsuranceSignal(),
    fetchQatarSignal(),
    fetchBrentSignal(),
  ]);

  const trumpAnalysis = analyzeTrumpTone(trumpItems);

  // Signal 1 (Backchannel): look for third-country mediator activity in Trump news
  const backchannel = /\b(Oman|Qatar|Egypt|Turkey|Pakistan|UK|CIA).*\b(message|envoy|mediator|channel|broker)\b/i;
  let backchannelCount = 0;
  for (const item of trumpItems) {
    if (backchannel.test(item.title + " " + item.desc)) backchannelCount++;
  }
  const signal1Score = backchannelCount >= 2 ? 2 : backchannelCount >= 1 ? 1 : 0;

  // Build score
  const signals = {
    s1_backchannel: { score: signal1Score, weight: 2, name: "Backchannel / mediator", mentions: backchannelCount },
    s2_hormuz:      { score: hormuz.score, weight: 1, name: "Hormuz AIS / transit", ...hormuz },
    s3_insurance:   { score: insurance.score, weight: 1, name: "War-risk insurance", ...insurance }, // already weighted to 2 in score field
    s4_trump_tone:  { score: trumpAnalysis.score, weight: 1, name: "Trump tone shift", ...trumpAnalysis },
    s5_qatar:       { score: qatar.score, weight: 1, name: "Qatar mediator", ...qatar },
    s6_brent:       { score: brent.score, weight: 1, name: "Brent silent drop", ...brent },
  };

  // Note: s3_insurance is pre-weighted (already returns 0 or 2), so we don't multiply again.
  // s1_backchannel score already weighted (0/1/2).
  // s4_trump_tone can be 0/0.5/1.
  // Total max = 2 + 1 + 2 + 1 + 1 + 1 = 8
  const total = signal1Score + hormuz.score + insurance.score + trumpAnalysis.score + qatar.score + brent.score;

  const action = total >= 5 ? "🚨 PEACE DEAL IMMINENT — EXECUTE FULL EXIT SEQUENCE"
               : total >= 3 ? "⚠️ EXIT SEQUENCE ARMED — execute per Operating Bible"
               : total >= 2 ? "📊 Elevated — monitor closely"
               : "✓ No peace signals — thesis intact";

  return {
    score: parseFloat(total.toFixed(1)),
    max_score: 8,
    trigger_threshold: 3,
    armed: total >= 3,
    action,
    signals,
    components: {
      trump: `${trumpAnalysis.score} (${trumpAnalysis.reason})`,
      hormuz: `${hormuz.score} (${hormuz.status})`,
      insurance: `${insurance.score} (${insurance.direction})`,
      backchannel: `${signal1Score} (${backchannelCount} mentions)`,
      qatar: `${qatar.score} (${qatar.status})`,
      brent: `${brent.score} (${brent.status})`,
    },
    timestamp: new Date().toISOString(),
  };
}
