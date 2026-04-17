import { NextResponse } from "next/server";
export const maxDuration = 30;

// More aggressive feeds targeting recency (hourly updates)
const RSS_FEEDS = [
  // Breaking markets — most frequent updates
  { name: "Reuters Business", url: "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-GB", category: "markets" },
  { name: "Bloomberg Markets", url: "https://news.google.com/rss/search?q=site:bloomberg.com+when:1d&hl=en-GB", category: "markets" },
  { name: "CNBC Breaking", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "markets" },
  { name: "Market News", url: "https://news.google.com/rss/search?q=stock+market+today+when:1d&hl=en-GB", category: "markets" },
  // Geopolitics / conflict — Iran/Hormuz
  { name: "Iran Conflict", url: "https://news.google.com/rss/search?q=iran+war+OR+hormuz+when:1d&hl=en-GB", category: "conflict" },
  { name: "Middle East Security", url: "https://news.google.com/rss/search?q=middle+east+strike+OR+ceasefire+when:1d&hl=en-GB", category: "conflict" },
  // Energy
  { name: "Oil Prices", url: "https://news.google.com/rss/search?q=brent+OR+crude+oil+when:1d&hl=en-GB", category: "energy" },
  { name: "OPEC Energy", url: "https://news.google.com/rss/search?q=opec+OR+gasoline+when:1d&hl=en-GB", category: "energy" },
  // Macro
  { name: "Fed Policy", url: "https://news.google.com/rss/search?q=federal+reserve+OR+powell+when:1d&hl=en-GB", category: "macro" },
  { name: "US Inflation", url: "https://news.google.com/rss/search?q=cpi+inflation+when:1d&hl=en-GB", category: "macro" },
  // Earnings
  { name: "Bank Earnings", url: "https://news.google.com/rss/search?q=bank+earnings+when:1d&hl=en-GB", category: "earnings" },
  { name: "Tech Earnings", url: "https://news.google.com/rss/search?q=nvidia+OR+microsoft+earnings+when:1d&hl=en-GB", category: "earnings" },
];

function parseRSS(xml, feedName, category) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < 8) {
    const c = m[1];
    const title = c.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
    const link = c.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
    const pubDate = c.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || "";
    const desc = c.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim().slice(0, 250) || "";
    if (title && pubDate) {
      const age_hours = Math.round((Date.now() - new Date(pubDate).getTime()) / 3600000);
      // Only include articles from last 24 hours
      if (age_hours >= 0 && age_hours <= 24) {
        items.push({ title, link, pubDate, description: desc, source: feedName, category, age_hours });
      }
    }
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    return parseRSS(await r.text(), feed.name, feed.category);
  } catch { return []; }
}

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await Promise.all(RSS_FEEDS.map(f => fetchFeed(f)));
    const all = results.flat().sort((a, b) => {
      if (!a.pubDate || !b.pubDate) return 0;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });
    const seen = new Set();
    const unique = all.filter(i => {
      const k = i.title.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const byCategory = {};
    for (const i of unique) {
      if (!byCategory[i.category]) byCategory[i.category] = [];
      byCategory[i.category].push(i);
    }
    return NextResponse.json({
      articles: unique.slice(0, 40),
      by_category: byCategory,
      total: unique.length,
      feeds_checked: RSS_FEEDS.length,
      timestamp: new Date().toISOString(),
      uk_time: new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
      freshest_age_hours: unique[0]?.age_hours ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
