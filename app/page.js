"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, RefreshCw, Plus, X, TrendingUp, TrendingDown, Search, LogOut, ArrowUpDown, BarChart3, Newspaper, Activity, Target, Edit3, ChevronRight } from "lucide-react";

const T={bg:"#0a0a0f",card:"#12121a",cardHover:"#1a1a2e",border:"#1e1e2e",gold:"#d4a843",green:"#10b981",red:"#ef4444",amber:"#f59e0b",text:"#e2e8f0",textDim:"#64748b",mono:"'JetBrains Mono',monospace",sans:"'DM Sans',sans-serif"};
function fmt(v,d=2){const n=Number(v);return isFinite(n)?n.toFixed(d):"—";}
function plPerUnit(e,c,dir){return(dir==="short"||dir==="sell")?e-c:c-e;}

export default function ApexBrain(){
  const[accessKey,setAccessKey]=useState("");
  const[authed,setAuthed]=useState(false);
  const[tab,setTab]=useState("chat");
  const[messages,setMessages]=useState([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[state,setState]=useState(null);
  const[prices,setPrices]=useState({});
  const[priceTime,setPriceTime]=useState("");
  const[marketState,setMarketState]=useState("");
  const[news,setNews]=useState([]);
  const[newsTime,setNewsTime]=useState("");
  const[health,setHealth]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  const[showSync,setShowSync]=useState(false);
  const[editPos,setEditPos]=useState(null);
  const chatEnd=useRef(null);

  // AUTH
  useEffect(()=>{const k=typeof window!=="undefined"&&localStorage.getItem("apex_key");if(k){setAccessKey(k);setAuthed(true);};},[]);
  const login=()=>{if(accessKey.trim()){localStorage.setItem("apex_key",accessKey.trim());setAuthed(true);}};
  const logout=()=>{localStorage.removeItem("apex_key");setAuthed(false);setMessages([]);};

  // LOADERS
  const loadState=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/state",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();if(d.state)setState(d.state);}}catch{};},[accessKey]);
  const loadPrices=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/prices",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setPrices(d.prices||{});setPriceTime(d.uk_time||"");setMarketState(d.market_state||"");}}catch{};},[accessKey]);
  const loadNews=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/news",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setNews(d.articles||[]);setNewsTime(d.uk_time||"");}}catch{};},[accessKey]);
  const loadHealth=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/health",{headers:{"x-apex-key":accessKey}});if(r.ok)setHealth(await r.json());}catch{};},[accessKey]);

  useEffect(()=>{if(authed){loadState();loadPrices();}},[authed,loadState,loadPrices]);
  useEffect(()=>{if(!authed)return;const iv=setInterval(loadPrices,60000);return()=>clearInterval(iv);},[authed,loadPrices]);
  useEffect(()=>{const h=()=>{if(document.visibilityState==="visible"&&authed){loadState();loadPrices();}};document.addEventListener("visibilitychange",h);return()=>document.removeEventListener("visibilitychange",h);},[authed,loadState,loadPrices]);
  useEffect(()=>{if(tab==="news"&&!news.length)loadNews();},[tab,news.length,loadNews]);
  useEffect(()=>{if(tab==="health")loadHealth();},[tab,loadHealth]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  // SEND MESSAGE
  const sendMessage=async(text)=>{const msg=text||input.trim();if(!msg||loading)return;setInput("");setMessages(p=>[...p,{role:"user",content:msg}]);setLoading(true);
    try{const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","x-apex-key":accessKey},body:JSON.stringify({messages:[...messages,{role:"user",content:msg}].map(m=>({role:m.role,content:m.content})),client_state:state,client_prices:prices})});const d=await r.json();if(d.error)throw new Error(d.error);
    setMessages(p=>[...p,{role:"assistant",content:d.content,pathway:d.pathway,urgency:d.urgency,compliance:d.compliance,cost:d.cost,algo:d.algo}]);
    if(d.pathway==="command")loadState();}catch(err){setMessages(p=>[...p,{role:"assistant",content:`❌ ${err.message}`}]);}setLoading(false);};

  // STATE ACTION
  const stateAction=async(action,body)=>{try{const r=await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json","x-apex-key":accessKey},body:JSON.stringify({action,...body})});const d=await r.json();if(!d.error)await loadState();return d;}catch(e){return{error:e.message};}};

  // ADD POSITION
  const[addForm,setAddForm]=useState({ticker:"",units:"",entry:"",stop:"",t1:"",t2:"",sleeve:"B",direction:"buy",thesis:""});
  const addPosition=async()=>{const d=await stateAction("add_position",{ticker:addForm.ticker,units:addForm.units,entry_price:addForm.entry,stop:addForm.stop||null,t1:addForm.t1||null,t2:addForm.t2||null,sleeve:addForm.sleeve,direction:addForm.direction,thesis:addForm.thesis});if(d?.ok){setShowAdd(false);setAddForm({ticker:"",units:"",entry:"",stop:"",t1:"",t2:"",sleeve:"B",direction:"buy",thesis:""});}};

  // SYNC
  const[syncForm,setSyncForm]=useState({nav:"",cash:"",margin:"",health:""});
  const doSync=async()=>{await stateAction("sync_account",{nav:syncForm.nav||undefined,cash:syncForm.cash||undefined,margin:syncForm.margin||undefined,health:syncForm.health||undefined});setShowSync(false);setSyncForm({nav:"",cash:"",margin:"",health:""});};

  // EDIT POSITION
  const saveEdit=async()=>{if(!editPos)return;const d=await stateAction("update_position",editPos);if(d?.ok)setEditPos(null);};

  // AUTH SCREEN
  if(!authed) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,fontFamily:T.sans}}>
      <div style={{fontSize:32,fontWeight:800,color:T.gold,marginBottom:8}}>🧠 APEX</div>
      <div style={{fontSize:10,color:T.textDim,letterSpacing:2,marginBottom:24}}>NEURAL INTELLIGENCE SYSTEM V3</div>
      <input placeholder="Access Key" type="password" value={accessKey} onChange={e=>setAccessKey(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={{width:260,padding:"12px 16px",background:T.card,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,fontFamily:T.mono,outline:"none",textAlign:"center"}}/>
      <button onClick={login} style={{marginTop:12,padding:"10px 40px",background:T.gold,color:"#000",fontWeight:700,border:"none",borderRadius:8,cursor:"pointer"}}>ENTER</button>
    </div>);

  // COMPUTE P&L
  const positions=state?.positions||[];
  const account=state?.account||{};
  const gbpUsd=Number(account.gbp_usd)||1.34;
  let totalOpenPL=0;
  const positionsWithPL=positions.map(pos=>{const lp=prices[pos.id]?.price;const dir=(pos.direction||"buy").toLowerCase();let plGbp=0,plPct=0,stopDist=null,t1Dist=null;
    if(lp!=null){const pl=plPerUnit(pos.entry_price,lp,dir)*pos.units;plGbp=pos.currency==="GBP"?pl:pl/gbpUsd;plPct=((lp-pos.entry_price)/pos.entry_price)*100;totalOpenPL+=plGbp;}
    if(pos.stop&&lp)stopDist=Math.abs((lp-pos.stop)/lp*100);if(pos.t1&&lp)t1Dist=Math.abs((pos.t1-lp)/lp*100);
    return{...pos,livePrice:lp,plGbp,plPct,stopDist,t1Dist};});
  const staleness=state?.account?.last_updated?Math.floor((Date.now()-new Date(state.account.last_updated).getTime())/3600000):null;

  // ═══ TABS ═══
  const TABS=[{id:"chat",icon:"💬",label:"Chat"},{id:"positions",icon:"📊",label:"Positions"},{id:"pipeline",icon:"🎯",label:"Pipeline"},{id:"performance",icon:"📈",label:"Performance"},{id:"news",icon:"📰",label:"News"},{id:"health",icon:"🏥",label:"Health"}];

  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:T.bg,fontFamily:T.sans,overflow:"hidden"}}>
      {/* HEADER */}
      <div style={{padding:"6px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:16,fontWeight:800,color:T.text}}>🧠 APEX</span>
          <span style={{fontSize:9,color:T.textDim,letterSpacing:1.5}}>V3</span>
          <span style={{fontSize:9,color:marketState==="REGULAR"?T.green:T.amber,marginLeft:4}}>{marketState==="REGULAR"?"● LIVE":marketState==="PRE"?"◐ PRE":"○ CLOSED"}</span>
        </div>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>setShowSync(true)} style={{...btnS,background:T.card}}>$</button>
          <button onClick={loadPrices} style={{...btnS,background:T.card}}><RefreshCw size={12}/></button>
          <button onClick={logout} style={{...btnS,background:T.card}}><LogOut size={12}/></button>
        </div>
      </div>

      {/* DASHBOARD BAR */}
      <div style={{display:"flex",padding:"4px 12px",gap:8,borderBottom:`1px solid ${T.border}`,flexShrink:0,overflowX:"auto"}}>
        {[{l:"NAV",v:`£${fmt(account.nav,0)}`,c:T.text},{l:"P&L",v:`${totalOpenPL>=0?"+":""}£${fmt(totalOpenPL)}`,c:totalOpenPL>=0?T.green:T.red},{l:"REAL",v:`+£${fmt(account.total_realised_pl)}`,c:T.green},{l:"HLTH",v:`${account.margin_health_pct||"—"}%`,c:(account.margin_health_pct||100)>50?T.green:T.red}].map((d,i)=>(<div key={i} style={{textAlign:"center",minWidth:55}}><div style={{fontSize:8,color:T.textDim,letterSpacing:1}}>{d.l}</div><div style={{fontSize:13,fontWeight:700,color:d.c,fontFamily:T.mono}}>{d.v}</div></div>))}
      </div>

      {staleness>4&&<div onClick={()=>setShowSync(true)} style={{padding:"3px 12px",background:"#3b1515",color:T.red,fontSize:10,cursor:"pointer",textAlign:"center"}}>⚠️ DATA {staleness}h OLD — Tap to sync</div>}

      {/* TAB BAR */}
      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,flexShrink:0,overflowX:"auto"}}>
        {TABS.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"6px 4px",background:tab===t.id?T.cardHover:"transparent",border:"none",borderBottom:tab===t.id?`2px solid ${T.gold}`:"2px solid transparent",color:tab===t.id?T.gold:T.textDim,fontSize:10,cursor:"pointer",fontFamily:T.sans,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><span style={{fontSize:14}}>{t.icon}</span>{t.label}</button>))}
      </div>

      {/* TAB CONTENT */}
      <div style={{flex:1,overflowY:"auto"}}>

        {/* ═══ CHAT TAB ═══ */}
        {tab==="chat"&&(<div style={{display:"flex",flexDirection:"column",height:"100%"}}>
          <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
            {messages.length===0&&(<div style={{textAlign:"center",marginTop:40,color:T.textDim}}>
              <div style={{fontSize:36,marginBottom:6}}>🧠</div><div style={{fontSize:13,fontWeight:600}}>APEX BRAIN V3</div>
              <div style={{fontSize:10,marginTop:4}}>Chat commands: "move JPM stop to 300" • "close BAC at 54"</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:12}}>
                {["Morning brief","How are my positions?","Weekly review","BAC earnings prep"].map((q,i)=>(<button key={i} onClick={()=>sendMessage(q)} style={{padding:"5px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:14,color:T.textDim,fontSize:10,cursor:"pointer"}}>{q}</button>))}
              </div></div>)}
            {messages.map((m,i)=>(<div key={i} style={{marginBottom:6,display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"88%",padding:"8px 12px",borderRadius:10,background:m.role==="user"?T.cardHover:T.card,border:`1px solid ${m.compliance==="VIOLATION"?T.red:m.urgency==="CRITICAL"?T.amber:T.border}`,color:T.text,fontSize:12,lineHeight:1.5,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                {m.role==="assistant"&&m.pathway&&m.pathway!=="fast_path"&&m.pathway!=="command"&&(<div style={{fontSize:8,color:T.gold,letterSpacing:2,marginBottom:3,fontWeight:700}}>🧠 {m.pathway.toUpperCase().replace(/_/g," ")}</div>)}
                {m.algo&&(m.algo.screens_red>0||m.algo.screens_amber>0)&&(<div style={{fontSize:9,color:m.algo.screens_red>0?T.red:T.amber,marginBottom:3}}>⚡ {m.algo.screens_red} red {m.algo.screens_amber} amber alerts</div>)}
                {renderMD(m.content)}
                {m.cost&&<div style={{fontSize:8,color:T.textDim,marginTop:3,textAlign:"right"}}>{m.cost.calls}call • ~${fmt(m.cost.est_usd,3)}</div>}
              </div></div>))}
            {loading&&<div style={{display:"flex",gap:4,padding:8}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.gold,animation:`pulse 1.4s ${i*0.2}s infinite ease-in-out`}}/>)}</div>}
            <div ref={chatEnd}/>
          </div>
          <div style={{padding:"6px 12px",borderTop:`1px solid ${T.border}`,flexShrink:0}}>
            <div style={{display:"flex",gap:6}}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Message APEX..." disabled={loading} style={{flex:1,padding:"9px 12px",background:T.card,border:`1px solid ${T.border}`,borderRadius:20,color:T.text,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
              <button onClick={()=>sendMessage()} disabled={loading||!input.trim()} style={{width:40,height:40,borderRadius:"50%",background:loading||!input.trim()?T.card:T.gold,border:"none",cursor:loading?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Send size={16} color={loading||!input.trim()?T.textDim:"#000"}/></button>
            </div></div>
        </div>)}

        {/* ═══ POSITIONS TAB ═══ */}
        {tab==="positions"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>{positions.length}/10 Positions</span>
            <button onClick={()=>setShowAdd(true)} style={{padding:"5px 12px",background:T.gold,color:"#000",fontWeight:700,border:"none",borderRadius:6,fontSize:11,cursor:"pointer"}}><Plus size={12}/> Add</button>
          </div>
          {positionsWithPL.map((pos,i)=>{const up=pos.plGbp>=0;const dir=(pos.direction||"buy").toUpperCase();return(
            <div key={i} style={{padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${pos.stopDist!=null&&pos.stopDist<5?T.red:T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><span style={{fontSize:14,fontWeight:700,color:T.text}}>{pos.id}</span><span style={{fontSize:9,color:T.textDim,marginLeft:6}}>[{pos.sleeve}/{dir}]</span></div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>setEditPos({ticker:pos.id,stop:pos.stop||"",t1:pos.t1||"",t2:pos.t2||"",units:pos.units,sleeve:pos.sleeve,direction:pos.direction||"buy",thesis:pos.thesis||"",conviction:pos.conviction||3})} style={{...btnS,width:24,height:24}}><Edit3 size={10} color={T.textDim}/></button>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:12,fontFamily:T.mono}}>
                <span style={{color:T.text}}>Entry: ${pos.entry_price} → {pos.livePrice!=null?`$${fmt(pos.livePrice)}`:"—"}</span>
                <span style={{color:up?T.green:T.red,fontWeight:700}}>{up?"+":""}£{fmt(pos.plGbp)} ({up?"+":""}{fmt(pos.plPct,1)}%)</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:2,fontSize:10,color:T.textDim}}>
                <span>Stop: ${pos.stop||"—"} ({pos.stopDist!=null?fmt(pos.stopDist,1)+"% away":"no stop"})</span>
                <span>T1: ${pos.t1||"—"} {pos.t1Dist!=null&&pos.t1Dist<5?"🟢":""}</span>
              </div>
              {pos.thesis&&<div style={{fontSize:10,color:T.textDim,marginTop:3,fontStyle:"italic"}}>{pos.thesis}</div>}
            </div>);})}
          {positions.length===0&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>No open positions. Tap + to add.</div>}

          {/* Closed trades */}
          {state?.closed?.length>0&&(<div style={{marginTop:16}}>
            <div style={{fontSize:12,fontWeight:700,color:T.textDim,marginBottom:6}}>CLOSED ({state.closed.length})</div>
            {state.closed.slice(-5).reverse().map((c,i)=>(<div key={i} style={{padding:"4px 8px",background:T.card,borderRadius:6,marginBottom:3,fontSize:11,display:"flex",justifyContent:"space-between"}}>
              <span style={{color:T.text}}>{c.ticker}</span>
              <span style={{color:c.net_pl>0?T.green:T.red,fontFamily:T.mono}}>{c.net_pl>0?"+":""}£{c.net_pl}</span>
              <span style={{color:T.textDim}}>{c.reason}</span>
            </div>))}
          </div>)}
        </div>)}

        {/* ═══ PIPELINE TAB ═══ */}
        {tab==="pipeline"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>Pipeline</span>
            <button onClick={()=>sendMessage("What are the top 10 trade opportunities right now? Score them by conviction and fit with our current strategy.")} style={{padding:"5px 10px",background:T.gold,color:"#000",fontWeight:600,border:"none",borderRadius:6,fontSize:10,cursor:"pointer"}}>🔍 Scan Now</button>
          </div>
          {(state?.pipeline||[]).filter(p=>p.status!=="filled").map((p,i)=>(<div key={i} style={{padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:13,fontWeight:700,color:T.text}}>{p.candidate}</span>
              <span style={{fontSize:10,color:p.status==="armed"?T.green:T.amber}}>{p.status?.toUpperCase()}</span>
            </div>
            <div style={{fontSize:10,color:T.textDim,marginTop:2}}>Slot {p.slot} • {p.day||"TBD"} • {p.thesis||""}</div>
            <button onClick={()=>{setTab("chat");sendMessage(`Deep dive on ${p.candidate} — full trade construction`);}} style={{marginTop:4,padding:"3px 8px",background:T.cardHover,border:`1px solid ${T.border}`,borderRadius:4,color:T.gold,fontSize:9,cursor:"pointer"}}>Deep Dive →</button>
          </div>))}
          {!(state?.pipeline||[]).filter(p=>p.status!=="filled").length&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>No pipeline entries. Ask APEX to scan for opportunities.</div>}
        </div>)}

        {/* ═══ PERFORMANCE TAB ═══ */}
        {tab==="performance"&&(<div style={{padding:"8px 12px"}}>
          <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:8}}>Fund Performance</div>
          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {[
              {l:"NAV",v:`£${fmt(account.nav,2)}`,c:T.text},
              {l:"Deposited",v:`£${account.total_deposited||0}`,c:T.textDim},
              {l:"Open P&L",v:`${totalOpenPL>=0?"+":""}£${fmt(totalOpenPL)}`,c:totalOpenPL>=0?T.green:T.red},
              {l:"Realised P&L",v:`+£${fmt(account.total_realised_pl)}`,c:T.green},
              {l:"Total Return",v:`${fmt(((account.nav-(account.total_deposited||1))/(account.total_deposited||1))*100,1)}%`,c:account.nav>=account.total_deposited?T.green:T.red},
              {l:"Win Rate",v:`${state?.closed?.length?fmt(state.closed.filter(c=>c.net_pl>0).length/state.closed.length*100,0):0}%`,c:T.text},
              {l:"Trades",v:`${state?.closed?.length||0}`,c:T.text},
              {l:"Fund Age",v:`${Math.floor((Date.now()-new Date("2026-03-17").getTime())/86400000)}d`,c:T.textDim},
            ].map((k,i)=>(<div key={i} style={{padding:"8px 10px",background:T.card,borderRadius:8,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1}}>{k.l}</div>
              <div style={{fontSize:16,fontWeight:700,color:k.c,fontFamily:T.mono,marginTop:2}}>{k.v}</div>
            </div>))}
          </div>

          {/* Closed trade history */}
          <div style={{fontSize:12,fontWeight:700,color:T.textDim,marginBottom:6}}>TRADE HISTORY</div>
          <div style={{maxHeight:300,overflowY:"auto"}}>
            {(state?.closed||[]).slice().reverse().map((c,i)=>(<div key={i} style={{padding:"6px 8px",background:T.card,borderRadius:6,marginBottom:3,border:`1px solid ${T.border}`,fontSize:11}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,color:T.text}}>{c.ticker} <span style={{color:T.textDim,fontWeight:400}}>[{c.direction||"buy"}]</span></span>
                <span style={{color:c.net_pl>0?T.green:T.red,fontFamily:T.mono,fontWeight:700}}>{c.net_pl>0?"+":""}£{c.net_pl}</span>
              </div>
              <div style={{color:T.textDim,fontSize:10,marginTop:2}}>${c.entry_price} → ${c.exit_price} • {c.units}u • {c.reason}</div>
            </div>))}
          </div>

          {/* Investor view */}
          <div style={{marginTop:12,padding:"10px",background:T.card,borderRadius:8,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,fontWeight:700,color:T.gold,marginBottom:4}}>INVESTOR SUMMARY</div>
            <div style={{fontSize:11,color:T.text,lineHeight:1.6}}>
              Capital invested: £{account.total_deposited||0}<br/>
              Current value: £{fmt(account.nav)}<br/>
              Return on capital: {fmt(((account.nav-(account.total_deposited||1))/(account.total_deposited||1))*100,1)}%<br/>
              Annualised (projected): {fmt(((account.nav-(account.total_deposited||1))/(account.total_deposited||1))*100*(365/Math.max(1,Math.floor((Date.now()-new Date("2026-03-17").getTime())/86400000))),1)}%<br/>
              Max positions: {positions.length}/10 slots used<br/>
              Realised gains: +£{fmt(account.total_realised_pl)}
            </div>
          </div>
        </div>)}

        {/* ═══ NEWS TAB ═══ */}
        {tab==="news"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>News & Intel</span>
            <button onClick={loadNews} style={{padding:"4px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:6,color:T.textDim,fontSize:10,cursor:"pointer"}}><RefreshCw size={10}/> {newsTime||"Refresh"}</button>
          </div>
          {news.length===0&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>Loading news feed...</div>}
          {news.map((n,i)=>(<a key={i} href={n.link} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:4,border:`1px solid ${T.border}`,textDecoration:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:T.text,lineHeight:1.3}}>{n.title}</div>
                {n.description&&<div style={{fontSize:10,color:T.textDim,marginTop:2}}>{n.description.slice(0,120)}</div>}
              </div>
              <div style={{marginLeft:8,flexShrink:0,textAlign:"right"}}>
                <span style={{fontSize:9,color:n.category==="conflict"?T.red:n.category==="energy"?T.amber:T.textDim,fontWeight:600}}>{n.category?.toUpperCase()}</span>
                {n.age_hours!=null&&<div style={{fontSize:9,color:T.textDim}}>{n.age_hours<1?"<1h":n.age_hours<24?`${n.age_hours}h`:`${Math.floor(n.age_hours/24)}d`} ago</div>}
              </div>
            </div>
          </a>))}
        </div>)}

        {/* ═══ HEALTH TAB ═══ */}
        {tab==="health"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>System Health</span>
            <button onClick={loadHealth} style={{padding:"4px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:6,color:T.textDim,fontSize:10,cursor:"pointer"}}><RefreshCw size={10}/> Refresh</button>
          </div>
          {health&&(<>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[{l:"GREEN",v:health.green,c:T.green},{l:"AMBER",v:health.amber,c:T.amber},{l:"RED",v:health.red,c:T.red}].map((s,i)=>(<div key={i} style={{flex:1,padding:"8px",background:T.card,borderRadius:8,textAlign:"center",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:18,fontWeight:800,color:s.c,fontFamily:T.mono}}>{s.v}</div>
                <div style={{fontSize:9,color:T.textDim}}>{s.l}</div>
              </div>))}
            </div>
            {health.checks?.map((c,i)=>(<div key={i} style={{padding:"4px 8px",background:T.card,borderRadius:6,marginBottom:2,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",fontSize:11}}>
              <span style={{color:T.text}}>{c.status==="GREEN"?"✅":c.status==="AMBER"?"🟡":"🔴"} {c.name}</span>
              <span style={{color:T.textDim}}>{c.detail}</span>
            </div>))}
          </>)}
          {!health&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>Loading health data...</div>}
        </div>)}
      </div>

      {/* PRICE FOOTER */}
      {priceTime&&<div style={{padding:"2px 12px",borderTop:`1px solid ${T.border}`,fontSize:8,color:T.textDim,display:"flex",justifyContent:"space-between",flexShrink:0}}>
        <span>Prices: {priceTime} UK • {Object.keys(prices).length} tickers</span>
        <span>Real: +£{fmt(account.total_realised_pl)}</span>
      </div>}

      {/* ═══ MODALS ═══ */}
      {showAdd&&<Modal title="Add Position" onClose={()=>setShowAdd(false)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <Inp p="Ticker" v={addForm.ticker} c={v=>setAddForm(p=>({...p,ticker:v.toUpperCase()}))}/>
          <Inp p="Units" v={addForm.units} c={v=>setAddForm(p=>({...p,units:v}))} t="number"/>
          <Inp p="Entry $" v={addForm.entry} c={v=>setAddForm(p=>({...p,entry:v}))} t="number"/>
          <Inp p="Stop $" v={addForm.stop} c={v=>setAddForm(p=>({...p,stop:v}))} t="number"/>
          <Inp p="T1 $" v={addForm.t1} c={v=>setAddForm(p=>({...p,t1:v}))} t="number"/>
          <Inp p="T2 $" v={addForm.t2} c={v=>setAddForm(p=>({...p,t2:v}))} t="number"/>
          <Sel v={addForm.sleeve} c={v=>setAddForm(p=>({...p,sleeve:v}))} opts={[["A","Sleeve A"],["B","Sleeve B"],["C","Sleeve C"],["Independent","Independent"]]}/>
          <Sel v={addForm.direction} c={v=>setAddForm(p=>({...p,direction:v}))} opts={[["buy","LONG"],["short","SHORT"]]}/>
        </div>
        <Inp p="Thesis" v={addForm.thesis} c={v=>setAddForm(p=>({...p,thesis:v}))} full/>
        <Btn onClick={addPosition}>Open Position</Btn>
      </Modal>}

      {showSync&&<Modal title="T212 Sync" onClose={()=>setShowSync(false)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <Inp p="NAV £" v={syncForm.nav} c={v=>setSyncForm(p=>({...p,nav:v}))} t="number"/>
          <Inp p="Cash £" v={syncForm.cash} c={v=>setSyncForm(p=>({...p,cash:v}))} t="number"/>
          <Inp p="Margin £" v={syncForm.margin} c={v=>setSyncForm(p=>({...p,margin:v}))} t="number"/>
          <Inp p="Health %" v={syncForm.health} c={v=>setSyncForm(p=>({...p,health:v}))} t="number"/>
        </div>
        <Btn onClick={doSync}>Sync</Btn>
      </Modal>}

      {editPos&&<Modal title={`Edit ${editPos.ticker}`} onClose={()=>setEditPos(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <Inp p="Stop $" v={editPos.stop} c={v=>setEditPos(p=>({...p,stop:v}))} t="number"/>
          <Inp p="T1 $" v={editPos.t1} c={v=>setEditPos(p=>({...p,t1:v}))} t="number"/>
          <Inp p="T2 $" v={editPos.t2} c={v=>setEditPos(p=>({...p,t2:v}))} t="number"/>
          <Inp p="Units" v={editPos.units} c={v=>setEditPos(p=>({...p,units:v}))} t="number"/>
          <Sel v={editPos.sleeve} c={v=>setEditPos(p=>({...p,sleeve:v}))} opts={[["A","Sleeve A"],["B","Sleeve B"],["C","Sleeve C"],["Independent","Independent"]]}/>
          <Sel v={editPos.direction} c={v=>setEditPos(p=>({...p,direction:v}))} opts={[["buy","LONG"],["short","SHORT"]]}/>
          <Inp p="Conviction (1-4)" v={editPos.conviction} c={v=>setEditPos(p=>({...p,conviction:v}))} t="number"/>
        </div>
        <Inp p="Thesis" v={editPos.thesis} c={v=>setEditPos(p=>({...p,thesis:v}))} full/>
        <Btn onClick={saveEdit}>Save Changes</Btn>
      </Modal>}

      <style>{`@keyframes pulse{0%,80%,100%{transform:scale(0);opacity:.5}40%{transform:scale(1);opacity:1}}`}</style>
    </div>);
}

// ═══ COMPONENTS ═══
const btnS={width:28,height:28,borderRadius:6,border:`1px solid #1e1e2e`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#64748b",background:"transparent"};
function Modal({title,onClose,children}){return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}><div style={{background:"#12121a",border:"1px solid #1e1e2e",borderRadius:12,padding:16,width:"92%",maxWidth:400}}>
  <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontWeight:700,color:"#d4a843"}}>{title}</span><X size={16} color="#64748b" style={{cursor:"pointer"}} onClick={onClose}/></div>{children}</div></div>);}
function Inp({p,v,c,t,full}){return<input placeholder={p} type={t||"text"} value={v} onChange={e=>c(e.target.value)} style={{padding:"7px 9px",background:"#12121a",border:"1px solid #1e1e2e",borderRadius:6,color:"#e2e8f0",fontSize:12,fontFamily:"'JetBrains Mono',monospace",outline:"none",...(full?{width:"100%",marginTop:6}:{})}}/>;}
function Sel({v,c,opts}){return<select value={v} onChange={e=>c(e.target.value)} style={{padding:"7px 9px",background:"#12121a",border:"1px solid #1e1e2e",borderRadius:6,color:"#e2e8f0",fontSize:12,outline:"none"}}>{opts.map(([val,label])=><option key={val} value={val}>{label}</option>)}</select>;}
function Btn({onClick,children}){return<button onClick={onClick} style={{width:"100%",marginTop:10,padding:9,background:"#d4a843",color:"#000",fontWeight:700,border:"none",borderRadius:8,cursor:"pointer",fontSize:12}}>{children}</button>;}

function renderMD(text){if(!text)return null;return text.split("\n").map((line,i)=>{
  if(line.startsWith("### "))return<div key={i} style={{fontSize:12,fontWeight:700,color:"#d4a843",marginTop:6,marginBottom:3}}>{line.slice(4)}</div>;
  if(line.startsWith("## "))return<div key={i} style={{fontSize:13,fontWeight:700,color:"#d4a843",marginTop:8,marginBottom:3}}>{line.slice(3)}</div>;
  if(line.startsWith("# "))return<div key={i} style={{fontSize:15,fontWeight:800,color:"#e2e8f0",marginTop:10,marginBottom:4}}>{line.slice(2)}</div>;
  if(line.match(/^---+$/))return<hr key={i} style={{border:"none",borderTop:"1px solid #1e1e2e",margin:"6px 0"}}/>;
  const parts=line.split(/(\*\*[^*]+\*\*)/g);
  const rendered=parts.map((p,j)=>{if(p.startsWith("**")&&p.endsWith("**"))return<strong key={j} style={{color:"#e2e8f0"}}>{p.slice(2,-2)}</strong>;return p;});
  if(line.match(/^[\s]*[-•]\s/))return<div key={i} style={{paddingLeft:10,position:"relative"}}><span style={{position:"absolute",left:0}}>•</span>{rendered}</div>;
  if(!line.trim())return<div key={i} style={{height:4}}/>;
  return<div key={i}>{rendered}</div>;});}
