import { NextResponse } from "next/server";
export const maxDuration = 30;

const RSS_FEEDS = [
  { name: "Reuters Markets", url: "https://news.google.com/rss/search?q=reuters+markets+oil+stocks&hl=en-GB", category: "markets" },
  { name: "Iran Conflict", url: "https://news.google.com/rss/search?q=iran+war+hormuz+blockade+2026&hl=en-GB", category: "conflict" },
  { name: "Oil Energy", url: "https://news.google.com/rss/search?q=brent+crude+oil+price&hl=en-GB", category: "energy" },
  { name: "Fed Rates", url: "https://news.google.com/rss/search?q=federal+reserve+rates+inflation&hl=en-GB", category: "macro" },
  { name: "Bank Earnings", url: "https://news.google.com/rss/search?q=JPMorgan+bank+earnings+2026&hl=en-GB", category: "earnings" },
];

function parseRSS(xml, feedName, category) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < 5) {
    const c = m[1];
    const title = c.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,"").trim()||"";
    const link = c.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()||"";
    const pubDate = c.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()||"";
    const desc = c.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]*>/g,"").trim().slice(0,200)||"";
    if(title) items.push({ title, link, pubDate, description: desc, source: feedName, category, age_hours: pubDate ? Math.round((Date.now()-new Date(pubDate).getTime())/3600000):null });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, { headers:{"User-Agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(8000) });
    if(!r.ok) return [];
    return parseRSS(await r.text(), feed.name, feed.category);
  } catch { return []; }
}

export async function GET(req) {
  const auth = req.headers.get("x-apex-key");
  if(auth!==process.env.APEX_ACCESS_KEY) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const results = await Promise.all(RSS_FEEDS.map(f=>fetchFeed(f)));
    const all = results.flat().sort((a,b)=>{if(!a.pubDate||!b.pubDate)return 0;return new Date(b.pubDate)-new Date(a.pubDate);});
    const seen=new Set();
    const unique=all.filter(i=>{const k=i.title.toLowerCase().slice(0,50);if(seen.has(k))return false;seen.add(k);return true;});
    const byCategory={};
    for(const i of unique){if(!byCategory[i.category])byCategory[i.category]=[];byCategory[i.category].push(i);}
    return NextResponse.json({ articles:unique.slice(0,30), by_category:byCategory, total:unique.length, feeds_checked:RSS_FEEDS.length, timestamp:new Date().toISOString(), uk_time:new Date().toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit"}) });
  } catch(err) { return NextResponse.json({error:err.message},{status:500}); }
}
