import { NextResponse } from "next/server";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { scanUniverse, SECTOR_MAP, THEME_MAP } from "../../lib/scannerAdvanced.js";

export const maxDuration = 180;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}
async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { const r = await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.ok; } catch { return false; }
}

// ═══ YAHOO DATA FETCH (daily + weekly + earnings) ═══
// V5.0 FIX C1: changePct now computed from last two bars in closes array,
// NOT from meta.chartPreviousClose (which returns YEAR-AGO close on range=1y).
// V5.0 ADD: sanity check — reject any price move >20% as likely bad data.
async function fetchYahooData(symbol) {
  try {
    const [dailyR, weeklyR, metaR] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=2y`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }),
      fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }),
    ]);
    if (!dailyR.ok) return { error: `daily fetch ${dailyR.status}` };
    const daily = await dailyR.json();
    const result = daily?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) return { error: "no price" };
    const isPence = PENCE_SYMBOLS.includes(symbol);
    const adj = isPence ? 100 : 1;
    const price = Number(meta.regularMarketPrice) / adj;
    if (!isFinite(price)) return { error: "bad price" };

    const rc = result?.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
    const rh = result?.indicators?.quote?.[0]?.high?.filter(c => c != null) || [];
    const rl = result?.indicators?.quote?.[0]?.low?.filter(c => c != null) || [];
    const ro = result?.indicators?.quote?.[0]?.open?.filter(c => c != null) || [];
    const rv = result?.indicators?.quote?.[0]?.volume?.filter(v => v != null) || [];
    const closes = rc.map(c => c / adj);
    const highs = rh.map(c => c / adj);
    const lows = rl.map(c => c / adj);
    const opens = ro.map(c => c / adj);

    // V5.0 FIX C1: true prevClose is the SECOND-TO-LAST bar in the closes array,
    // NOT meta.chartPreviousClose (which is ~1 year ago on range=1y endpoint).
    // Fallback to meta fields only if we have no bar history.
    let prev;
    if (closes.length >= 2) {
      prev = closes[closes.length - 2];
    } else {
      prev = (Number(meta.previousClose) || Number(meta.chartPreviousClose) || Number(meta.regularMarketPrice)) / adj;
    }
    let changePct = prev ? ((price - prev) / prev * 100) : 0;

    // V5.0 SANITY CHECK: reject absurd single-day moves as bad data.
    // Real stocks rarely move >20% in a day; a >25% move is almost always a data error
    // (split adjustment lag, weekend/holiday artifact, stale prev close).
    // Flag the ticker as having bad data rather than propagating a phantom signal.
    if (Math.abs(changePct) > 25) {
      return { error: `suspect price data — ${changePct.toFixed(1)}% change flagged as likely bad data`, suspect_data: true };
    }

    // ATR(14)
    let atr = 0;
    if (closes.length >= 15) {
      const trs = [];
      for (let i = 1; i < 15; i++) {
        const idx = closes.length - 15 + i;
        trs.push(Math.max(highs[idx] - lows[idx], Math.abs(highs[idx] - closes[idx - 1]), Math.abs(lows[idx] - closes[idx - 1])));
      }
      atr = trs.reduce((a, b) => a + b, 0) / trs.length;
    }
    const sma = (arr, p) => arr.length < p ? null : arr.slice(-p).reduce((a, b) => a + b, 0) / p;
    const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);

    // Weekly
    let wS20 = null, wS50 = null;
    if (weeklyR.ok) {
      try {
        const w = await weeklyR.json();
        const wc = (w?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null) || []).map(c => c / adj);
        if (wc.length >= 20) wS20 = sma(wc, 20);
        if (wc.length >= 50) wS50 = sma(wc, 50);
      } catch {}
    }

    // Swings
    const last20H = highs.slice(-20), last20L = lows.slice(-20);
    const swingHigh = last20H.length ? Math.max(...last20H) : price;
    const swingLow = last20L.length ? Math.min(...last20L) : price;
    const high50 = highs.slice(-50).length ? Math.max(...highs.slice(-50)) : price * 1.1;
    const low50 = lows.slice(-50).length ? Math.min(...lows.slice(-50)) : price * 0.9;

    // Volume
    const recentVol = rv.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avgVol = rv.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

    // RSI
    let rsi = null;
    if (closes.length >= 15) {
      const ch = [];
      for (let i = closes.length - 14; i < closes.length; i++) ch.push(closes[i] - closes[i - 1]);
      const g = ch.filter(c => c > 0), l = ch.filter(c => c < 0).map(Math.abs);
      const ag = g.length ? g.reduce((a, b) => a + b, 0) / 14 : 0;
      const al = l.length ? l.reduce((a, b) => a + b, 0) / 14 : 0;
      if (al > 0) rsi = 100 - (100 / (1 + ag / al));
      else if (ag > 0) rsi = 100; else rsi = 50;
    }

    // Earnings
    let daysToEarnings = null;
    if (metaR.ok) {
      try {
        const mm = await metaR.json();
        const eraw = mm?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
        if (eraw) {
          const days = Math.floor((eraw * 1000 - Date.now()) / 86400000);
          if (days >= 0 && days <= 60) daysToEarnings = days;
        }
      } catch {}
    }

    return {
      price: parseFloat(price.toFixed(4)),
      prevClose: parseFloat(prev.toFixed(4)),
      changePct: parseFloat(changePct.toFixed(2)),
      currency: isPence ? "GBP" : meta.currency,
      atr: parseFloat(atr.toFixed(4)),
      sma20: sma20 ? parseFloat(sma20.toFixed(4)) : null,
      sma50: sma50 ? parseFloat(sma50.toFixed(4)) : null,
      sma200: sma200 ? parseFloat(sma200.toFixed(4)) : null,
      weeklySMA20: wS20 ? parseFloat(wS20.toFixed(4)) : null,
      weeklySMA50: wS50 ? parseFloat(wS50.toFixed(4)) : null,
      swingHigh: parseFloat(swingHigh.toFixed(4)),
      swingLow: parseFloat(swingLow.toFixed(4)),
      high50: parseFloat(high50.toFixed(4)),
      low50: parseFloat(low50.toFixed(4)),
      volRatio: parseFloat(volRatio.toFixed(2)),
      rsi: rsi ? parseFloat(rsi.toFixed(1)) : null,
      // Latest bar for candle pattern
      open: opens.slice(-1)[0],
      high: highs.slice(-1)[0],
      low: lows.slice(-1)[0],
      close: closes.slice(-1)[0],
      days_to_earnings: daysToEarnings,
    };
  } catch (e) { return { error: e.message }; }
}

// ═══ UNIVERSE (100+) ═══
const SCAN_UNIVERSE = [
  "XOM","CVX","COP","OXY","EOG","MPC","PSX","VLO","HES","DVN","SLB","HAL","BKR","NOV","FTI",
  "EQT","AR","CHK","LNG","GLNG","TELL","NFE",
  "LMT","RTX","GD","NOC","HII","BA","TXT","TDG","AVAV",
  "DAL","UAL","AAL","LUV","ALK","JBLU","SAVE",
  "FCX","COPX","GDX","GDXJ","NEM","AEM","SCCO","HL","AA","CENX","BHP","RIO",
  "NVDA","AMD","AVGO","SMCI","TSM","QCOM","INTC","MU","AMAT","KLAC","LRCX",
  "MSFT","GOOGL","AMZN","META","ORCL","CRM","PLTR","NOW",
  "JPM","BAC","MS","GS","WFC","C","BK","USB","PNC","SCHW","COF","TFC","AXP","BLK",
  "APD","LIN","CAT","DE","HON","GE","ETN","PH",
  "XLU","VNQ","KO","PG","WMT","COST","JNJ","PFE","MRK",
  "TLT","IEF","SHY","GLD","SLV","DBC","USO","UNG",
  "EWJ","FXI","EWU","EWG","EWW","EEM","VXX","SH",
];

// ═══ POSITION SIZE (correlation-adjusted, exposure-capped) ═══
function calcPositionSize(entry, stop, nav, gbpUsd, correlation) {
  if (!entry || !stop || !nav) return null;
  const riskPerShare = Math.abs(entry - stop);
  if (riskPerShare <= 0) return null;

  // Base: 1% NAV per trade (Rule 2 — daily loss cap)
  let riskGbp = nav * 0.01;

  // Correlation adjustment: if theme already at 30-40%, halve the size
  if (correlation?.theme_pct_if_added >= 0.30) riskGbp *= 0.5;
  else if (correlation?.theme_count >= 2) riskGbp *= 0.75;

  const riskUsd = riskGbp * (gbpUsd || 1.28);
  let units = Math.floor((riskUsd / riskPerShare) * 100) / 100;
  let posValUsd = entry * units;
  let navExposure = (posValUsd / (gbpUsd || 1.28)) / nav * 100;

  // ═══ EXPOSURE CAP: max 25% NAV nominal per position ═══
  const MAX_EXPOSURE_PCT = 25;
  let exposureCapped = false;
  if (navExposure > MAX_EXPOSURE_PCT) {
    const maxPosValGbp = nav * (MAX_EXPOSURE_PCT / 100);
    const maxPosValUsd = maxPosValGbp * (gbpUsd || 1.28);
    units = Math.floor((maxPosValUsd / entry) * 100) / 100;
    posValUsd = entry * units;
    navExposure = MAX_EXPOSURE_PCT;
    riskGbp = (units * riskPerShare) / (gbpUsd || 1.28);
    exposureCapped = true;
  }

  return {
    units: parseFloat(units.toFixed(2)),
    risk_gbp: parseFloat(riskGbp.toFixed(2)),
    position_value_usd: parseFloat(posValUsd.toFixed(2)),
    nav_exposure_pct: parseFloat(navExposure.toFixed(1)),
    size_adjustment: exposureCapped ? `capped at ${MAX_EXPOSURE_PCT}% NAV (tight stop)` :
                     correlation?.theme_pct_if_added >= 0.30 ? "half (theme concentration)" :
                     correlation?.theme_count >= 2 ? "three-quarters" : "full",
    exposure_capped: exposureCapped,
  };
}

// ═══ PROFESSIONAL SETUP BUILDER ═══
function buildSetup(ticker, pd, scoreResult) {
  const { price, atr, swingHigh, swingLow, high50, low50, days_to_earnings } = pd;
  const direction = scoreResult.direction;
  if (!price || !direction) return null;

  // Earnings gate
  if (days_to_earnings != null && days_to_earnings <= 7 && days_to_earnings >= 0) {
    return { direction, blocked: true, block_reason: `Earnings in ${days_to_earnings}d — R18`, days_to_earnings };
  }

  const atrSize = atr > 0 ? atr : price * 0.02;
  let entry = price, stop, t1, t2;

  if (direction === "buy") {
    const structStop = swingLow - (atrSize * 0.3);
    const atrStop = entry - (atrSize * 1.5);
    stop = Math.max(structStop, atrStop);
    if (entry - stop < atrSize * 0.8) stop = entry - (atrSize * 0.8);
    const risk = entry - stop;
    const minT1 = entry + risk * 3;
    t1 = high50 > minT1 ? high50 : minT1;
    t2 = entry + risk * 5;
  } else {
    const structStop = swingHigh + (atrSize * 0.3);
    const atrStop = entry + (atrSize * 1.5);
    stop = Math.min(structStop, atrStop);
    if (stop - entry < atrSize * 0.8) stop = entry + (atrSize * 0.8);
    const risk = stop - entry;
    const minT1 = entry - risk * 3;
    t1 = low50 < minT1 ? low50 : minT1;
    t2 = entry - risk * 5;
  }

  const risk = Math.abs(entry - stop);
  const reward = Math.abs(t1 - entry);
  const rr = risk > 0 ? reward / risk : 0;

  return {
    direction,
    entry: parseFloat(entry.toFixed(2)),
    stop: parseFloat(stop.toFixed(2)),
    t1: parseFloat(t1.toFixed(2)),
    t2: parseFloat(t2.toFixed(2)),
    risk: parseFloat(risk.toFixed(2)),
    reward: parseFloat(reward.toFixed(2)),
    rr: parseFloat(rr.toFixed(2)),
    atr_used: parseFloat(atrSize.toFixed(2)),
    passes_rr_filter: rr >= 3.0,
    days_to_earnings,
    blocked: false,
  };
}

// ═══ CLAUDE JUDGE (Haiku 4.5) — AI IN THE LOOP ═══
// Claude can: APPROVE, VETO (with reason), APPROVE_WITH_CAUTION (with note).
async function claudeJudge(opportunity, regime, positions, peaceSignal) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { verdict: "no_ai", reason: "No ANTHROPIC_API_KEY" };

  const s = opportunity.setup;
  const sig = opportunity.signals || {};
  const corr = opportunity.correlation;

  const existing = positions.map(p => `${p.id} (${SECTOR_MAP[p.id] || "?"}, ${p.direction || "buy"}, £${p.entry_price}→?, thesis: ${(p.thesis || "").slice(0, 80)})`).join("; ");

  const prompt = `You are the risk officer at Apex Macro Fund. The scanner has surfaced this opportunity. Judge it quickly.

TICKER: ${opportunity.ticker}
DIRECTION: ${s.direction?.toUpperCase()}
SCORE: ${opportunity.score}/100 (grade ${opportunity.grade})
LIVE PRICE: $${opportunity.price}  |  1d change: ${opportunity.changePct}%  |  RSI: ${opportunity.rsi}
SECTOR: ${opportunity.sector}  |  THEME: ${opportunity.theme}

PROPOSED SETUP:
  Entry: $${s.entry}  |  Stop: $${s.stop}  |  T1: $${s.t1}  |  T2: $${s.t2}
  R:R: ${s.rr}:1  |  ATR basis: $${s.atr_used}  |  Days to earnings: ${s.days_to_earnings ?? "n/a"}

SIGNAL BREAKDOWN:
  Trend: ${sig.trend?.direction} (MTF aligned: ${sig.trend?.mtf_aligned})
  RSI signal: ${sig.rsi?.direction} - ${sig.rsi?.reason || ""}
  Volume: ${sig.volume?.signal}
  Range position: ${(sig.range?.pos * 100).toFixed(0)}% of 20d range
  Candle: ${sig.candle?.pattern || "none"}

CORRELATION:
  ${corr.theme_count} positions already in theme "${corr.theme}" (${(corr.theme_pct_if_added * 100).toFixed(0)}% of book if added)
  Warning: ${corr.warning || "none"}

MACRO CONTEXT:
  Regime: ${regime}
  Peace signal score: ${peaceSignal?.score ?? "unknown"}/8 (3+ triggers exit sequence)

CURRENT BOOK: ${existing || "empty"}

Respond with ONLY a JSON object and nothing else. No markdown code fences. No prose. Just the object:
{"verdict": "APPROVE", "reason": "one sentence max 150 chars", "thesis": "one sentence max 200 chars", "entry_trigger": "specific condition to enter if APPROVE, empty string otherwise"}

Verdict must be exactly one of: APPROVE, VETO, APPROVE_WITH_CAUTION.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => "");
      return { verdict: "error", reason: `HTTP ${r.status}`, raw: errBody.slice(0, 200) };
    }
    const d = await r.json();
    const text = d.content?.[0]?.text || "";

    // V5.0 FIX: Strip markdown code fences that Haiku sometimes adds,
    // then extract JSON object. Original regex would swallow fence chars.
    let cleaned = text.trim();
    // Remove leading code fence
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    // Remove trailing code fence
    cleaned = cleaned.replace(/\s*```\s*$/i, "");
    // Extract first JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*?\}(?=\s*$|\s*[^,\s\]\}])/) || cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { verdict: "error", reason: "No JSON in response", raw: text.slice(0, 200) };
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate: must have a recognized verdict
      if (!parsed.verdict || !["APPROVE", "VETO", "APPROVE_WITH_CAUTION"].includes(parsed.verdict)) {
        return { verdict: "error", reason: `Invalid verdict: ${parsed.verdict}`, raw: text.slice(0, 200) };
      }
      return parsed;
    } catch (e) {
      return { verdict: "error", reason: "Parse failed: " + e.message, raw: text.slice(0, 200) };
    }
  } catch (e) {
    return { verdict: "error", reason: e.message };
  }
}

// ═══ MAIN HANDLER ═══
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const singleTicker = url.searchParams.get("ticker");
    const skipAI = url.searchParams.get("no_ai") === "true";

    const state = await kvGet("apex:state") || DEFAULT_STATE;
    const positions = state.positions || [];
    const account = state.account || { nav: 3000, gbp_usd: 1.28 };
    const heldTickers = new Set(positions.map(p => p.id));
    const dismissed = await kvGet("apex:dismissed") || { tickers: [], until: null };
    const dismissedActive = dismissed.until && new Date(dismissed.until).getTime() > Date.now() ? dismissed.tickers : [];
    const dismissedSet = new Set(dismissedActive);

    // V5.0 FIX C2: regime route stores FLAT, not nested under `current`.
    // Previous code read regimeData?.current?.primary_code (always undefined)
    // and silently defaulted to REFLATION regardless of actual regime.
    const regimeData = await kvGet("apex:regime");
    const regime = regimeData?.primary_regime || regimeData?.current?.primary_regime || "Rising Growth + Rising Inflation";
    const regimeCode = regimeData?.primary_code || regimeData?.current?.primary_code || "REFLATION";
    const peaceSignal = (await kvGet("apex:peace_signal")) || state.signals || null;

    const tickersToScan = singleTicker ? [singleTicker.toUpperCase()] : SCAN_UNIVERSE.filter(t => !heldTickers.has(t) && !dismissedSet.has(t));

    // Fetch in batches with error tracking
    const priceData = {};
    const errors = {};
    const suspectData = [];
    for (let i = 0; i < tickersToScan.length; i += 15) {
      const batch = tickersToScan.slice(i, i + 15);
      await Promise.all(batch.map(t => {
        const sym = WATCHLIST[t]?.yahoo || t;
        return fetchYahooData(sym).then(d => {
          if (d?.error) {
            errors[t] = d.error;
            if (d.suspect_data) suspectData.push(t);
          }
          else if (d) priceData[t] = d;
        });
      }));
    }

    const scoreResults = scanUniverse(Object.keys(priceData), priceData, regimeCode, positions);

    // Track previous scan for "new since last" detection
    const lastScan = await kvGet("apex:last_scan");
    const lastTickers = new Set((lastScan?.top10 || []).map(o => o.ticker));

    // Build setups and attach data — expose ALL fields the UI consumes
    const gbpUsd = account.gbp_usd || 1.28;
    const withSetups = scoreResults.map(r => {
      const pd = priceData[r.ticker];
      const setup = buildSetup(r.ticker, pd, r);
      const sizing = setup && !setup.blocked ? calcPositionSize(setup.entry, setup.stop, account.nav, gbpUsd, r.correlation) : null;
      let enrichedSetup = null;
      if (setup) {
        enrichedSetup = { ...setup, ...sizing };
        enrichedSetup.quality_grade = r.grade;
        enrichedSetup.suggested_units = sizing?.units;
        enrichedSetup.position_value_gbp = sizing?.position_value_usd ? parseFloat((sizing.position_value_usd / gbpUsd).toFixed(2)) : null;
        enrichedSetup.pct_nav_at_risk = sizing?.nav_exposure_pct;
        enrichedSetup.sector = r.sector;
        enrichedSetup.theme = r.theme;
        enrichedSetup.correlation = r.correlation;
        enrichedSetup.sector_concentrated = r.correlation && !r.correlation.passes;
        enrichedSetup.mtf_aligned = r.signals?.trend?.mtf_aligned ?? false;
        enrichedSetup.confidence = r.confidence;
        enrichedSetup.thesis = ""; // populated by Claude judge below
        enrichedSetup.entry_trigger = ""; // populated by Claude judge below
      }
      return {
        ...r,
        price: pd?.price,
        changePct: pd?.changePct,
        rsi: pd?.rsi,
        volRatio: pd?.volRatio,
        setup: enrichedSetup,
        days_to_earnings: pd?.days_to_earnings,
        is_new: !lastTickers.has(r.ticker),
        valid: r.actionable && enrichedSetup?.passes_rr_filter === true && !enrichedSetup?.blocked,
      };
    });

    let validOpps = withSetups.filter(o => o.valid).sort((a, b) => b.score - a.score);

    // ═══ CLAUDE JUDGE for top candidates ═══
    let aiJudgments = 0, aiVetoes = 0, aiCautions = 0, aiErrors = 0;
    // V5.0 FIX S4: preserve VETOed setups separately for transparency.
    // The user needs to see WHY Claude rejected a setup, not have it silently removed.
    const vetoed = [];
    if (!singleTicker && !skipAI && validOpps.length > 0) {
      const toJudge = validOpps.slice(0, 5);
      const judgments = await Promise.all(toJudge.map(o => claudeJudge(o, regime, positions, peaceSignal)));
      for (let i = 0; i < toJudge.length; i++) {
        const j = judgments[i];
        toJudge[i].ai_judgment = j;
        if (toJudge[i].setup) {
          toJudge[i].setup.thesis = j?.thesis || "";
          toJudge[i].setup.entry_trigger = j?.entry_trigger || "";
        }
        aiJudgments++;
        if (j?.verdict === "VETO") {
          aiVetoes++;
          toJudge[i].valid = false;
          toJudge[i].ai_vetoed = true;
          // V5.0: capture a snapshot for the vetoed list
          vetoed.push({
            ticker: toJudge[i].ticker,
            score: toJudge[i].score,
            grade: toJudge[i].grade,
            direction: toJudge[i].setup?.direction,
            entry: toJudge[i].setup?.entry,
            stop: toJudge[i].setup?.stop,
            t1: toJudge[i].setup?.t1,
            rr: toJudge[i].setup?.rr,
            changePct: toJudge[i].changePct,
            rsi: toJudge[i].rsi,
            sector: toJudge[i].sector,
            theme: toJudge[i].theme,
            ai_judgment: j,
          });
        }
        if (j?.verdict === "APPROVE_WITH_CAUTION") aiCautions++;
        if (j?.verdict === "error" || j?.verdict === "no_ai") aiErrors++;
      }
      validOpps = withSetups.filter(o => o.valid).sort((a, b) => b.score - a.score);
    }

    // Self-heal: if 0 valid setups, relax the SCORE threshold
    let healing = null;
    if (validOpps.length === 0 && !singleTicker) {
      const relaxed = withSetups.filter(o =>
        o.score >= 50 &&
        o.confidence >= 0.20 &&
        o.correlation?.passes &&
        o.setup?.passes_rr_filter &&
        !o.setup?.blocked &&
        !o.ai_vetoed
      );
      if (relaxed.length > 0) {
        validOpps = relaxed.sort((a, b) => b.score - a.score);
        healing = `Relaxed to score>=50, confidence>=0.20 — surfaced ${relaxed.length} grade C candidates`;
      }
    }

    const newSinceLast = validOpps.filter(o => o.is_new).map(o => o.ticker);

    const payload = {
      scanned: Object.keys(priceData).length,
      universe_size: SCAN_UNIVERSE.length,
      fetch_errors: Object.keys(errors).length,
      suspect_data_tickers: suspectData, // V5.0: list of tickers flagged for bad data
      error_detail: errors,
      dismissed_count: dismissedActive.length,
      blocked_earnings: withSetups.filter(o => o.setup?.blocked).length,
      // V5.0 FIX C6: rename to match what server.js cron expects.
      // Old field name was `actionable_raw` — cron reads `actionable` — never fired.
      // Publishing BOTH so any existing consumer still works.
      actionable: withSetups.filter(o => o.actionable).length,
      actionable_raw: withSetups.filter(o => o.actionable).length,
      ai_judgments: aiJudgments,
      ai_vetoes: aiVetoes,
      ai_cautions: aiCautions,
      ai_errors: aiErrors,
      vetoed, // V5.0: transparency — the VETO'd setups with Claude's reasoning
      passing_rr: validOpps.length,
      rejected_rr: withSetups.filter(o => o.actionable && o.setup && !o.setup.passes_rr_filter).length,
      rejected_confidence: withSetups.filter(o => o.score >= 65 && o.confidence < 0.25).length,
      healing_applied: healing,
      new_since_last: newSinceLast,
      top10: validOpps.slice(0, 10),
      top5: validOpps.slice(0, 5),
      all: withSetups,
      regime,
      regime_code: regimeCode,
      nav: account.nav,
      gbp_usd: gbpUsd,
      timestamp: new Date().toISOString(),
    };

    console.log(`[SCANNER] ${payload.scanned} scanned, ${payload.passing_rr} valid, ${aiVetoes} vetoed, ${newSinceLast.length} new, regime=${regimeCode}`);

    if (!singleTicker) {
      await kvSet("apex:last_scan", { ...payload, updated: payload.timestamp });

      // Setup tracker (for hit-rate calibration)
      if (validOpps.length > 0) {
        let tracker = await kvGet("apex:setup_tracker") || { suggestions: [] };
        for (const opp of validOpps.slice(0, 10)) {
          tracker.suggestions.push({
            ticker: opp.ticker, score: opp.score, grade: opp.grade, confidence: opp.confidence,
            rr: opp.setup.rr, direction: opp.setup.direction, entry: opp.setup.entry,
            stop: opp.setup.stop, t1: opp.setup.t1, t2: opp.setup.t2,
            ai_verdict: opp.ai_judgment?.verdict, ai_thesis: opp.ai_judgment?.thesis,
            suggested_at: payload.timestamp, regime: regimeCode,
            mtf_aligned: opp.signals?.trend?.mtf_aligned, outcome: null,
            // V5.0 FIX C3 (part 1): persist the signal weights at entry time
            // so adaptive learning has REAL data to work with when the trade closes.
            signals_at_entry: {
              momentum: opp.signals?.momentum?.score || 0,
              trend_following: opp.signals?.trend?.score || 0,
              rsi_signal: opp.signals?.rsi?.strength || 0,
              volume_breakout: opp.signals?.volume?.signal === "BREAKOUT" ? 1 : 0,
              range_position: opp.signals?.range?.score || 0,
              regime_fit: opp.regime_multiplier || 1,
            },
          });
        }
        if (tracker.suggestions.length > 500) tracker.suggestions = tracker.suggestions.slice(-500);
        await kvSet("apex:setup_tracker", tracker);
      }
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Scanner error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}

export async function POST(req) { return GET(req); }
