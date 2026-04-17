import { NextResponse } from "next/server";

export const maxDuration = 30;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}
async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try { await fetch(`${url}/set/${key}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }); return true; } catch { return false; }
}

// ═══ REDDIT (FREE) ═══
async function fetchReddit(subreddit, limit = 10) {
  try {
    const r = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, {
      headers: { "User-Agent": "APEX-MACRO/1.0" },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data?.children || []).map(c => ({
      source: "reddit",
      subreddit,
      title: c.data.title,
      text: (c.data.selftext || "").slice(0, 200),
      score: c.data.score,
      comments: c.data.num_comments,
      url: `https://reddit.com${c.data.permalink}`,
      created: new Date(c.data.created_utc * 1000).toISOString(),
      author: c.data.author,
    }));
  } catch { return []; }
}

// ═══ STOCKTWITS (FREE) ═══
async function fetchStockTwits(symbol) {
  try {
    const r = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`, {
      headers: { "User-Agent": "APEX-MACRO/1.0" },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.messages || []).slice(0, 10).map(m => ({
      source: "stocktwits",
      symbol,
      text: (m.body || "").slice(0, 300),
      sentiment: m.entities?.sentiment?.basic || "neutral",
      user: m.user?.username || "anonymous",
      followers: m.user?.followers || 0,
      likes: m.likes?.total || 0,
      url: `https://stocktwits.com/message/${m.id}`,
      created: m.created_at,
    }));
  } catch { return []; }
}

// ═══ STOCKTWITS TRENDING ═══
async function fetchStockTwitsTrending() {
  try {
    const r = await fetch("https://api.stocktwits.com/api/2/trending/symbols.json", {
      headers: { "User-Agent": "APEX-MACRO/1.0" },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.symbols || []).slice(0, 15).map(s => ({
      symbol: s.symbol,
      title: s.title,
      watchlist_count: s.watchlist_count,
    }));
  } catch { return []; }
}

// ═══ RSS TWITTER BRIDGES (free) ═══
async function fetchTwitterViaRSS(accountList) {
  const results = [];
  // Using RSSHub's public instance for Twitter accounts
  const publicInstances = [
    "https://rsshub.app/twitter/user/",
    "https://rss.rssforever.com/twitter/user/",
  ];

  for (const account of accountList.slice(0, 5)) {
    let fetched = false;
    for (const instance of publicInstances) {
      if (fetched) break;
      try {
        const r = await fetch(`${instance}${account}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) continue;
        const text = await r.text();
        // Parse RSS XML
        const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
        for (const item of items.slice(0, 3)) {
          const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
          const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
          const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
          results.push({
            source: "twitter",
            account,
            text: title.replace(/<!\[CDATA\[|\]\]>/g, "").slice(0, 300),
            url: link,
            created: pubDate,
          });
        }
        fetched = true;
      } catch { continue; }
    }
  }
  return results;
}

// ═══ MAIN ═══
export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check cache
  const cache = await kvGet("apex:social_cache");
  const cacheAge = cache ? (Date.now() - new Date(cache.timestamp).getTime()) / 60000 : Infinity;
  if (cache && cacheAge < 15 && !req.nextUrl?.searchParams.get("force")) {
    return NextResponse.json({ ...cache, cached: true, age_min: cacheAge.toFixed(1) });
  }

  try {
    const state = await kvGet("apex:state") || {};
    const heldTickers = (state.positions || []).map(p => p.id);

    // Twitter accounts to follow (PM can customize via state.social_accounts)
    const twitterAccounts = state.social_accounts || [
      "WSJmarkets", "FT", "zerohedge", "business", "markets", "ReutersBiz",
      "jimcramer", "elerianm", "LizAnnSonders",
    ];

    // Fetch everything in parallel
    const [
      stocksRed, optionsRed, investingRed, secRed, valueRed,
      trending,
      twitter,
    ] = await Promise.all([
      fetchReddit("stocks", 5),
      fetchReddit("options", 5),
      fetchReddit("investing", 5),
      fetchReddit("SecurityAnalysis", 5),
      fetchReddit("ValueInvesting", 3),
      fetchStockTwitsTrending(),
      fetchTwitterViaRSS(twitterAccounts),
    ]);

    // StockTwits for held tickers
    const heldSocial = [];
    for (const t of heldTickers.slice(0, 5)) {
      const msgs = await fetchStockTwits(t);
      heldSocial.push(...msgs.slice(0, 3));
    }

    const reddit = [...stocksRed, ...optionsRed, ...investingRed, ...secRed, ...valueRed]
      .sort((a, b) => b.score - a.score).slice(0, 20);

    const result = {
      timestamp: new Date().toISOString(),
      uk_time: new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      reddit,
      stocktwits_held: heldSocial,
      stocktwits_trending: trending,
      twitter,
      counts: {
        reddit: reddit.length,
        stocktwits: heldSocial.length,
        trending: trending.length,
        twitter: twitter.length,
      },
    };

    await kvSet("apex:social_cache", result);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
