import { NextResponse } from "next/server";
import { BRAINSTEM, AMYGDALA_PREAMBLE } from "../../data/brainstem.js";
import { ROUTER_PROMPT } from "../../data/router.js";
import { PATHWAYS } from "../../data/pathways.js";
import { getCortexSections } from "../../data/cortex.js";
import { AMYGDALA_PROMPT } from "../../data/amygdala.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import { WATCHLIST, PENCE_SYMBOLS } from "../../data/algoConfig.js";
import { runAlgoEngine } from "../../lib/algoInline.js";

export const maxDuration = 120;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function $(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "\u2014"; }
function plPerUnit(e, c, dir) { return (dir === "short" || dir === "sell") ? e - c : c - e; }

// === CHAT COMMAND PARSER ===
function parseChatCommand(msg, positions) {
  const l = msg.toLowerCase();
  const tickers = positions.map(p => p.id);
  const stopM = l.match(/(?:move|set|change|update)\s+(\w+)\s+stop\s+(?:to\s+)?\$?(\d+\.?\d*)/);
  if (stopM && tickers.includes(stopM[1].toUpperCase())) return { action: "update_position", ticker: stopM[1].toUpperCase(), stop: parseFloat(stopM[2]) };
  const t1M = l.match(/(?:change|set|update|move)\s+(\w+)\s+t1\s+(?:to\s+)?\$?(\d+\.?\d*)/);
  if (t1M && tickers.includes(t1M[1].toUpperCase())) return { action: "update_position", ticker: t1M[1].toUpperCase(), t1: parseFloat(t1M[2]) };
  const t2M = l.match(/(?:change|set|update|move)\s+(\w+)\s+t2\s+(?:to\s+)?\$?(\d+\.?\d*)/);
  if (t2M && tickers.includes(t2M[1].toUpperCase())) return { action: "update_position", ticker: t2M[1].toUpperCase(), t2: parseFloat(t2M[2]) };
  const unitsM = l.match(/(?:update|change|set)\s+(\w+)\s+units?\s+(?:to\s+)?(\d+\.?\d*)/);
  if (unitsM && tickers.includes(unitsM[1].toUpperCase())) return { action: "update_position", ticker: unitsM[1].toUpperCase(), units: parseFloat(unitsM[2]) };
  const sleeveM = l.match(/(?:switch|move|change)\s+(\w+)\s+(?:to\s+)?sleeve\s+([abc]|independent)/i);
  if (sleeveM && tickers.includes(sleeveM[1].toUpperCase())) return { action: "update_position", ticker: sleeveM[1].toUpperCase(), sleeve: sleeveM[2].toUpperCase() === "INDEPENDENT" ? "Independent" : sleeveM[2].toUpperCase() };
  const thesisM = l.match(/(?:change|update|set)\s+(\w+)\s+thesis\s+(?:to\s+)?(.+)/i);
  if (thesisM && tickers.includes(thesisM[1].toUpperCase())) return { action: "update_position", ticker: thesisM[1].toUpperCase(), thesis: thesisM[2].trim() };
  const closeM = l.match(/close\s+(\w+)\s+(?:at\s+)?\$?(\d+\.?\d*)/);
  if (closeM && tickers.includes(closeM[1].toUpperCase())) return { action: "close_position", ticker: closeM[1].toUpperCase(), exit_price: parseFloat(closeM[2]) };
  const partialM = l.match(/partial(?:ly)?\s+close\s+(\w+)\s+(\d+\.?\d*)\s*u(?:nits?)?\s+(?:at\s+)?\$?(\d+\.?\d*)/);
  if (partialM && tickers.includes(partialM[1].toUpperCase())) return { action: "partial_close", ticker: partialM[1].toUpperCase(), units: parseFloat(partialM[2]), exit_price: parseFloat(partialM[3]) };
  return null;
}

// === EXECUTE COMMAND VIA KV ===
async function execCmd(cmd) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(`${url}/get/apex:state`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json(); let state = d.result;
    for (let i = 0; i < 3; i++) { if (typeof state === "string") { try { state = JSON.parse(state); } catch { break; } } else break; }
    if (!state?.positions) return null;
    const idx = state.positions.findIndex(p => p.id === cmd.ticker);
    if (idx < 0) return { error: cmd.ticker + " not found" };
    const pos = state.positions[idx];
    const changes = [];
    if (cmd.action === "update_position") {
      if (cmd.stop !== undefined) { const dir = (pos.direction||"buy").toLowerCase(); if (pos.stop && ((dir==="buy"&&cmd.stop<pos.stop)||(dir==="short"&&cmd.stop>pos.stop))) return { error: "R1: Cannot move stop against position" }; changes.push("Stop: $"+pos.stop+" -> $"+cmd.stop); pos.stop=cmd.stop; }
      if (cmd.t1 !== undefined) { changes.push("T1: $"+pos.t1+" -> $"+cmd.t1); pos.t1=cmd.t1; }
      if (cmd.t2 !== undefined) { changes.push("T2: $"+pos.t2+" -> $"+cmd.t2); pos.t2=cmd.t2; }
      if (cmd.units !== undefined) { changes.push("Units: "+pos.units+" -> "+cmd.units); pos.units=cmd.units; }
      if (cmd.sleeve !== undefined) { changes.push("Sleeve: "+pos.sleeve+" -> "+cmd.sleeve); pos.sleeve=cmd.sleeve; }
      if (cmd.thesis !== undefined) { changes.push("Thesis updated"); pos.thesis=cmd.thesis; }
      state.positions[idx]=pos; state.account.last_updated=new Date().toISOString();
      if (!state.strategy_log) state.strategy_log=[];
      state.strategy_log.push({date:new Date().toISOString(),note:"CHAT EDIT "+cmd.ticker+": "+changes.join(", "),category:"trade_action",author:"PM"});
      if (state.strategy_log.length>100) state.strategy_log=state.strategy_log.slice(-100);
      await fetch(`${url}/set/apex:state`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(state)});
      return { ok:true, changes, position:pos };
    }
    if (cmd.action === "close_position") {
      const gbp=Number(state.account?.gbp_usd)||1.34;
      const rawPL=((pos.direction||"buy")==="short"?pos.entry_price-cmd.exit_price:cmd.exit_price-pos.entry_price)*pos.units;
      const plGbp=pos.currency==="GBP"?rawPL:rawPL/gbp;
      if (!state.closed) state.closed=[];
      state.closed.push({id:cmd.ticker+"-"+Date.now(),ticker:cmd.ticker,entry_price:pos.entry_price,exit_price:cmd.exit_price,units:pos.units,direction:pos.direction,sleeve:pos.sleeve,entry_date:pos.entry_date,exit_date:new Date().toISOString(),net_pl:Math.round(plGbp*100)/100,reason:"Chat close",exit_type:"manual"});
      state.positions.splice(idx,1);
      state.account.total_realised_pl=Math.round(((state.account.total_realised_pl||0)+plGbp)*100)/100;
      state.account.last_updated=new Date().toISOString();
      if (!state.strategy_log) state.strategy_log=[];
      state.strategy_log.push({date:new Date().toISOString(),note:"CLOSED "+cmd.ticker+" @ $"+cmd.exit_price+" | P&L: "+(plGbp>=0?"+":"")+"\u00a3"+plGbp.toFixed(2),category:"trade_action",author:"PM"});
      await fetch(`${url}/set/apex:state`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(state)});
      return { ok:true, closed:true, pl:plGbp.toFixed(2) };
    }
    return null;
  } catch(e) { return { error:e.message }; }
}

// === FAST PATH ===
function tryFastPath(msg, state, prices) {
  const l = msg.toLowerCase().trim(); const p = prices||{};
  const tm=l.match(/(?:what(?:'s| is)|price (?:of|for)|how (?:much )?is)\s+(\w+)/);
  const jt=l.match(/^(\w{1,5})(?:\s*(?:price|\?)?\s*)$/i);
  const tk=(tm?.[1]||jt?.[1]||"").toUpperCase();
  if (tk&&p[tk]?.price!=null) { const c=["IAG","BAE"].includes(tk)?"\u00a3":"$"; return { content: "**"+tk+":** "+c+$(p[tk].price)+" ("+(p[tk].changePct>=0?"+":"")+p[tk].changePct+"%)"+(p[tk].preMarket?" | Pre: "+c+$(p[tk].preMarket):"")+(p[tk].postMarket?" | Post: "+c+$(p[tk].postMarket):""), pathway:"fast_path" }; }
  if (l.match(/^(?:what(?:'s| is) (?:my |the )?)?(?:nav|account|balance)/)) { const a=state?.account; if(a) return { content:"**NAV:** \u00a3"+$(a.nav)+" | **Cash:** \u00a3"+$(a.cash)+" | **Health:** "+a.margin_health_pct+"%\n**Deposited:** \u00a3"+a.total_deposited+" | **Realised:** +\u00a3"+$(a.total_realised_pl), pathway:"fast_path" }; }
  if (l.match(/^(?:what(?:'s| are) (?:my |the )?)?(?:positions?|book|holdings?)/)) { const pos=state?.positions||[]; if(pos.length) { const lines=pos.map(pp=>{const lp=p[pp.id]?.price;const c=pp.currency==="GBP"?"\u00a3":"$";const dir=(pp.direction||"buy").toUpperCase();const ps=lp!=null?" \u2192 "+c+$(lp):"";return"**"+pp.id+"** ["+pp.sleeve+"/"+dir+"] "+pp.units+"u @ "+c+pp.entry_price+ps;}); return { content:"**"+pos.length+" positions:**\n"+lines.join("\n"), pathway:"fast_path" }; } }
  if (l.match(/(?:peace|signal).*(?:score|status)/)) { const s=state?.signals; if(s) return { content:"**Peace Signal:** "+s.total+"/8 (trigger \u2265"+s.trigger+")", pathway:"fast_path" }; }
  return null;
}

// === CLAUDE API ===
async function callClaude(system,messages,search=false,maxT=4096) {
  if(!API_KEY) throw new Error("No API key");
  const body={model:"claude-sonnet-4-20250514",max_tokens:maxT,messages};
  if(system) body.system=system;
  if(search) body.tools=[{type:"web_search_20250305",name:"web_search",max_uses:5}];
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify(body)});
  const raw=await r.text();
  let data; try{data=JSON.parse(raw);}catch{throw new Error("Non-JSON from Anthropic");}
  if(!r.ok){if(r.status===429)throw new Error("Rate limited");if(r.status===529)throw new Error("Overloaded");throw new Error(data?.error?.message||"Error "+r.status);}
  return{text:(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n")};
}

// === KV ===
async function kvGet(key) {
  const url=process.env.KV_REST_API_URL,token=process.env.KV_REST_API_TOKEN;
  if(!url||!token) return null;
  try{const r=await fetch(`${url}/get/${key}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)return null;const d=await r.json();let v=d.result;for(let i=0;i<3;i++){if(typeof v==="string"){try{v=JSON.parse(v);}catch{break;}}else break;}return v;}catch{return null;}
}

// === YAHOO ===
async function fetchYahoo(symbol) {
  try{const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range=2d&includePrePost=true",{headers:{"User-Agent":"Mozilla/5.0"}});if(!r.ok)return null;const data=await r.json();const meta=data?.chart?.result?.[0]?.meta;if(!meta?.regularMarketPrice)return null;let price=Number(meta.regularMarketPrice);let prev=Number(meta.chartPreviousClose||meta.previousClose)||price;let pre=meta.preMarketPrice?Number(meta.preMarketPrice):null;let post=meta.postMarketPrice?Number(meta.postMarketPrice):null;if(PENCE_SYMBOLS.includes(symbol)){price/=100;prev/=100;if(pre)pre/=100;if(post)post/=100;}if(!isFinite(price))return null;const eff=post||pre||price;return{price:eff,regular:price,preMarket:pre,postMarket:post,prevClose:prev,changePct:parseFloat($(prev?((eff-prev)/prev*100):0)),currency:PENCE_SYMBOLS.includes(symbol)?"GBP":meta.currency,marketState:meta.marketState};}catch{return null;}
}
async function loadPrices(positions=[]) {
  const tickers={BRENT:"BZ=F",WTI:"CL=F",SPX:"^GSPC",VIX:"^VIX",GBPUSD:"GBPUSD=X"};
  for(const pos of positions){const id=pos.id?.toUpperCase();if(id&&WATCHLIST[id])tickers[id]=WATCHLIST[id].yahoo;else if(id)tickers[id]=id;}
  const results={};const entries=Object.entries(tickers);
  for(let i=0;i<entries.length;i+=5){const batch=entries.slice(i,i+5);await Promise.all(batch.map(([k,s])=>fetchYahoo(s).then(d=>{if(d)results[k]=d;})));}
  return results;
}

// === FORMAT CONTEXT ===
function formatContext(state,prices,clientPrices,algoOutput) {
  if(!state) return "";
  const p={...prices,...(clientPrices||{})};const a=state.account;const gbp=Number(a?.gbp_usd)||1.34;
  const lines=["\n=== LIVE FUND STATE ==="];
  if(a){lines.push("NAV: \u00a3"+$(a.nav)+" | Cash: \u00a3"+$(a.cash)+" | Margin: \u00a3"+$(a.margin_used)+" | Health: "+a.margin_health_pct+"%");lines.push("Deposited: \u00a3"+a.total_deposited+" | Realised: \u00a3"+$(a.total_realised_pl)+" | Return: "+$(((a.nav-a.total_deposited)/a.total_deposited)*100,1)+"%");lines.push("Fund Day "+Math.floor((Date.now()-new Date(a.inception_date).getTime())/86400000));}
  const macro=[];if(p.BRENT?.price)macro.push("Brent: $"+$(p.BRENT.price)+" ("+(p.BRENT.changePct>=0?"+":"")+p.BRENT.changePct+"%)");if(p.SPX?.price)macro.push("S&P: "+$(p.SPX.price,0));if(p.VIX?.price)macro.push("VIX: "+$(p.VIX.price,1));if(p.GBPUSD?.price)macro.push("GBP/USD: "+$(p.GBPUSD.price,4));if(macro.length)lines.push("MACRO: "+macro.join(" | "));
  if(state.positions?.length){lines.push("\nOPEN POSITIONS ("+state.positions.length+"/10):");let totalPL=0;for(const pos of state.positions){const lp=p[pos.id]?.price;const c=pos.currency==="GBP"?"\u00a3":"$";const dir=(pos.direction||"buy").toUpperCase();const st=pos.trailing_stop?"trail "+c+pos.trailing_stop:pos.stop?"stop "+c+pos.stop:"no stop";let ps="entry "+c+pos.entry_price,plStr="";if(lp!=null){const pl=plPerUnit(pos.entry_price,lp,pos.direction)*pos.units;const plG=pos.currency==="GBP"?pl:pl/gbp;totalPL+=plG;ps=c+$(lp)+" ("+$(((lp-pos.entry_price)/pos.entry_price)*100,1)+"%)";plStr=" | P&L: "+(plG>=0?"+":"")+"\u00a3"+$(plG);}lines.push("  "+pos.id+" ["+pos.sleeve+"/"+dir+"] "+pos.units+"u @ "+c+pos.entry_price+" \u2192 "+ps+" | "+st+" | T1:"+c+pos.t1+plStr);if(pos.thesis)lines.push("    Thesis: "+pos.thesis);}lines.push("  TOTAL OPEN P&L: "+(totalPL>=0?"+":"")+"\u00a3"+$(totalPL));}
  if(state.closed?.length){lines.push("\nCLOSED ("+state.closed.length+"):");for(const c of state.closed.slice(-5))lines.push("  "+c.ticker+": "+(c.net_pl>0?"+":"")+"\u00a3"+c.net_pl+" | "+c.reason);}
  if(state.signals)lines.push("\nPEACE: "+state.signals.total+"/8 (trigger\u2265"+state.signals.trigger+")");
  if(state.catalysts?.length){const u=state.catalysts.filter(c=>c.status!=="passed").slice(0,5);if(u.length){lines.push("\nCATALYSTS:");for(const c of u)lines.push("  "+c.date+" "+c.position+": "+c.event);}}
  if(state.pipeline?.length){const ac=state.pipeline.filter(p=>p.status!=="filled");if(ac.length){lines.push("\nPIPELINE:");for(const pp of ac)lines.push("  Slot"+pp.slot+" ["+pp.status+"] "+pp.candidate);}}
  if(algoOutput?.dashboard){lines.push("\n"+algoOutput.dashboard);lines.push("\nINSTRUCTION: ALGO data above is quantitative. Reference numbers. RED alerts FIRST.");}
  if(state.strategy_log?.length){lines.push("\n=== STRATEGY MEMORY ===");for(const e of state.strategy_log.slice(-15)){const d=new Date(e.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"Europe/London"});lines.push("  ["+d+"] "+e.note);}lines.push("INSTRUCTION: This is decision history. Reference for continuity. Build on previous, don't start fresh.");}
  return lines.join("\n");
}

function extractKnowledgeFlags(text) {
  const lines=text.split("\n"),flags=[],clean=[];
  for(const line of lines){const m=line.match(/^KNOWLEDGE_FLAG:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);if(m)flags.push({category:m[1].trim(),fact:m[2].trim(),source:m[3].trim(),date:new Date().toISOString().slice(0,10)});else clean.push(line);}
  return{cleanText:clean.join("\n"),flags};
}

// === MAIN ===
export async function POST(req) {
  const auth=req.headers.get("x-apex-key");
  if(auth!==process.env.APEX_ACCESS_KEY) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const body=await req.json();
    if(!body.messages?.length) return NextResponse.json({error:"Missing messages"},{status:400});
    const userMsg=body.messages[body.messages.length-1]?.content||"";
    const clientState=body.client_state||null;const clientPrices=body.client_prices||null;
    const kvState=await kvGet("apex:state");
    const fundState=clientState||kvState||DEFAULT_STATE;
    // Chat commands
    const chatCmd=parseChatCommand(userMsg,fundState.positions||[]);
    if(chatCmd){const result=await execCmd(chatCmd);if(result?.error)return NextResponse.json({content:"\u274c "+result.error,pathway:"chat_command",urgency:"normal",entities:[chatCmd.ticker],compliance:"CLEAR",knowledge_flags:[]});if(result?.ok){let msg="\u2705 **"+chatCmd.ticker+" updated**\n";if(result.changes)msg+=result.changes.join("\n");if(result.closed)msg+="Position closed. P&L: \u00a3"+result.pl;return NextResponse.json({content:msg,pathway:"chat_command",urgency:"normal",entities:[chatCmd.ticker],compliance:"CLEAR",knowledge_flags:[],state_changed:true});}}
    const serverPrices=await loadPrices(fundState.positions||[]);
    const mergedPrices={...serverPrices,...(clientPrices||{})};
    const algoOutput=runAlgoEngine(fundState.positions||[],mergedPrices,fundState.account);
    const fast=tryFastPath(userMsg,fundState,mergedPrices);
    if(fast)return NextResponse.json({content:fast.content,pathway:fast.pathway,urgency:"normal",entities:[],compliance:"CLEAR",knowledge_flags:[],algo:{screens_red:algoOutput.screens.filter(s=>s.level==="RED").length,screens_amber:algoOutput.screens.filter(s=>s.level==="AMBER").length}});
    let pathway="general",entities=[],urgency="normal",contextNotes="";
    const l=userMsg.toLowerCase();let regexMatched=true;
    if(l.match(/morning|brief|daily|good morning|start.*day/))pathway="morning_brief";
    else if(l.match(/should i.*(?:buy|short|open|trade)|new position|trade idea|open a/))pathway="trade_proposal";
    else if(l.match(/how is|update on|should i hold|what about|check on/))pathway="position_review";
    else if(l.match(/weekly review|sunday review|end of week/))pathway="weekly_review";
    else if(l.match(/peace deal|crisis|breaking|emergency|crash|just announced/)){pathway="crisis";urgency="CRITICAL";}
    else if(l.match(/analy[sz]e|deep dive|macro view|what comes next|regime|research|thesis/))pathway="deep_analysis";
    else if(l.match(/journal|log.*trade|record|trade hist/))pathway="journal";
    else if(l.match(/investor update|fund review|full review|capital overview|how are we doing/))pathway="investor_update";
    else if(l.match(/deposit|added.*capital|added.*\u00a3|added.*gbp/))pathway="capital_event";
    else if(l.match(/algo|screen|signal|scan|darvas|monte carlo|risk model/))pathway="deep_analysis";
    else regexMatched=false;
    const tickerRe=userMsg.match(/\b(JPM|BAC|FCX|NVDA|MSFT|MS|SMCI|COPX|EWJ|TLT|CVX|MPC|GLNG|APD|DAL|IAG|LNG|FRO|SPX|BRENT|EQT|UAL|BAE|XOM|LMT|RTX|GD|SLB|HAL)\b/gi);
    if(tickerRe)entities=[...new Set(tickerRe.map(t=>t.toUpperCase()))];
    if(!regexMatched&&userMsg.length>15){try{const rr=await callClaude(ROUTER_PROMPT,[{role:"user",content:userMsg}],false,200);const p=JSON.parse(rr.text.replace(/```json|```/g,"").trim());pathway=p.pathway||"general";if(Array.isArray(p.entities))entities=[...entities,...p.entities];urgency=p.urgency||"normal";contextNotes=p.context_notes||"";}catch(e){console.error("Router:",e.message);}}
    if(urgency==="CRITICAL")pathway="crisis";if(!PATHWAYS[pathway])pathway="general";await delay(200);
    const fc=formatContext(fundState,serverPrices,clientPrices,algoOutput);
    let sp=BRAINSTEM+"\n\n"+AMYGDALA_PREAMBLE+"\n\n"+PATHWAYS[pathway];
    if(["weekly_review","deep_analysis","investor_update"].includes(pathway)){const cs=getCortexSections(pathway,entities,contextNotes);if(cs.length)sp+="\n\n=== DEEP KNOWLEDGE ===\n"+cs.join("\n\n");}
    sp+=fc;
    const ukNow=new Date().toLocaleDateString("en-GB",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"Europe/London"})+" "+new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"});
    const conflictDay=Math.floor((Date.now()-new Date("2026-02-28").getTime())/86400000);
    sp+="\n\nCURRENT DATE/TIME: "+ukNow+" (UK). Conflict Day "+conflictDay+". ALL times in responses must be UK time.";
    sp+="\n\nPRICE AUTHORITY: Prices above are from Yahoo Finance. Use them. Only web-search for NEWS/ANALYSIS.";
    const useSearch=["morning_brief","trade_proposal","position_review","weekly_review","crisis","deep_analysis","investor_update"].includes(pathway);
    const clean=body.messages.map(m=>({role:m.role,content:m.content}));
    const apex=await callClaude(sp,clean,useSearch,4096);await delay(200);
    const{cleanText,flags:knowledgeFlags}=extractKnowledgeFlags(apex.text);
    let flag=null;
    if(["trade_proposal","crisis","capital_event"].includes(pathway)){try{let as=AMYGDALA_PROMPT;if(fundState?.positions)as+="\n\nPOSITIONS:\n"+fundState.positions.map(p=>p.id+" ["+p.sleeve+"] "+p.units+"u stop "+(p.stop||"none")).join("\n");if(fundState?.account)as+="\nNAV: \u00a3"+fundState.account.nav;const ar=await callClaude(as,[{role:"user",content:"Review:\n\n"+cleanText.slice(0,3000)}],false,300);if(ar.text.trim().startsWith("VIOLATION"))flag=ar.text.trim();}catch(e){console.error("Amygdala:",e.message);}}
    let ft=cleanText;if(flag)ft+="\n\n\u26a0\ufe0f **COMPLIANCE FLAG**\n"+flag;
    if(knowledgeFlags.length>0){try{const url=process.env.KV_REST_API_URL,token=process.env.KV_REST_API_TOKEN;if(url&&token){let kn=await kvGet("apex:knowledge")||[];for(const f of knowledgeFlags)kn.push({...f,status:"fresh",stored_at:new Date().toISOString()});kn=kn.slice(-200);fetch(`${url}/set/apex:knowledge`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(kn)}).catch(()=>{});}}catch{}}
    const callCount=1+(["trade_proposal","crisis","capital_event"].includes(pathway)?1:0)+(!regexMatched&&userMsg.length>15?1:0);
    return NextResponse.json({content:ft,pathway,urgency,entities,compliance:flag?"VIOLATION":"CLEAR",knowledge_flags:knowledgeFlags,cost:{calls:callCount,est_usd:callCount*0.02},algo:{screens_red:algoOutput.screens.filter(s=>s.level==="RED").length,screens_amber:algoOutput.screens.filter(s=>s.level==="AMBER").length,risk_pct:algoOutput.risk?.max_drawdown_pct,correlation_violations:algoOutput.correlation?.violations?.length||0}});
  }catch(err){console.error("Brain error:",err);return NextResponse.json({error:"APEX: "+err.message},{status:500});}
}
