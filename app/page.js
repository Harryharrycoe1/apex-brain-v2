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
  const[scanner,setScanner]=useState(null);
  const[scannerTime,setScannerTime]=useState("");
  const[scannerLoading,setScannerLoading]=useState(false);
  const[regime,setRegime]=useState(null);
  const[peaceSignal,setPeaceSignal]=useState(null);
  const[strategyLog,setStrategyLog]=useState([]);
  const[social,setSocial]=useState([]);
  const[socialTime,setSocialTime]=useState("");
  const[newsSubTab,setNewsSubTab]=useState("news");
  const[isListening,setIsListening]=useState(false);
  const recognitionRef=useRef(null);
  const[showAdd,setShowAdd]=useState(false);
  const[showSync,setShowSync]=useState(false);
  const[editPos,setEditPos]=useState(null);
  const[closePos,setClosePos]=useState(null);
  const chatEnd=useRef(null);
  const chatScroller=useRef(null);
  const lastMsgCount=useRef(0);

  // AUTH
  useEffect(()=>{const k=typeof window!=="undefined"&&localStorage.getItem("apex_key");if(k){setAccessKey(k);setAuthed(true);};},[]);
  const login=()=>{if(accessKey.trim()){localStorage.setItem("apex_key",accessKey.trim());setAuthed(true);}};
  const logout=()=>{localStorage.removeItem("apex_key");setAuthed(false);setMessages([]);};

  // LOADERS
  const loadState=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/state",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();if(d.state)setState(d.state);}}catch{};},[accessKey]);
  const loadPrices=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/prices",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setPrices(d.prices||{});setPriceTime(d.uk_time||"");setMarketState(d.market_state||"");}}catch{};},[accessKey]);
  const loadNews=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/news",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setNews(d.articles||[]);setNewsTime(d.uk_time||"");}}catch{};},[accessKey]);
  const loadHealth=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/health",{headers:{"x-apex-key":accessKey}});if(r.ok)setHealth(await r.json());}catch{};},[accessKey]);
  const loadScanner=useCallback(async()=>{if(!accessKey)return;setScannerLoading(true);try{const r=await fetch("/api/scanner",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setScanner(d);setScannerTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}));}}catch{};setScannerLoading(false);},[accessKey]);
  const loadRegime=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/regime",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setRegime(d);}}catch{};},[accessKey]);
  const loadPeaceSignal=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/altdata?source=peace_signal",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setPeaceSignal(d.peace_signal);}}catch{};},[accessKey]);
  const loadStrategyLog=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json","x-apex-key":accessKey},body:JSON.stringify({action:"get_strategy_log"})});if(r.ok){const d=await r.json();setStrategyLog(d.log||[]);}}catch{};},[accessKey]);
  const loadSocial=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/social",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setSocial(d.posts||d.articles||[]);setSocialTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}));}}catch{};},[accessKey]);

  // VOICE INPUT (browser native Web Speech API)
  const startListening=useCallback(()=>{if(typeof window==="undefined")return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){alert("Voice not supported on this browser. Try Chrome or Safari.");return;}const r=new SR();r.continuous=false;r.interimResults=true;r.lang="en-GB";r.onstart=()=>setIsListening(true);r.onresult=e=>{const t=Array.from(e.results).map(res=>res[0].transcript).join("");setInput(t);};r.onerror=()=>setIsListening(false);r.onend=()=>setIsListening(false);recognitionRef.current=r;r.start();},[]);
  const stopListening=useCallback(()=>{if(recognitionRef.current){recognitionRef.current.stop();}setIsListening(false);},[]);

  useEffect(()=>{if(authed){loadState();loadPrices();}},[authed,loadState,loadPrices]);
  useEffect(()=>{if(!authed)return;const iv=setInterval(loadPrices,60000);return()=>clearInterval(iv);},[authed,loadPrices]);
  useEffect(()=>{const h=()=>{if(document.visibilityState==="visible"&&authed){loadState();loadPrices();}};document.addEventListener("visibilitychange",h);return()=>document.removeEventListener("visibilitychange",h);},[authed,loadState,loadPrices]);
  useEffect(()=>{if(tab==="news"&&!news.length)loadNews();},[tab,news.length,loadNews]);
  useEffect(()=>{if(tab==="news"&&newsSubTab==="social"&&!social.length)loadSocial();},[tab,newsSubTab,social.length,loadSocial]);
  useEffect(()=>{if(tab!=="news"||!authed)return;const iv=setInterval(()=>{loadNews();loadSocial();},900000);return()=>clearInterval(iv);},[tab,authed,loadNews,loadSocial]);
  useEffect(()=>{if(tab==="health")loadHealth();},[tab,loadHealth]);
  useEffect(()=>{if(tab==="pipeline")loadScanner();},[tab,loadScanner]);
  useEffect(()=>{if(tab!=="pipeline"||!authed)return;const iv=setInterval(loadScanner,300000);return()=>clearInterval(iv);},[tab,authed,loadScanner]);
  useEffect(()=>{if(tab==="performance"){loadStrategyLog();loadRegime();loadState();loadPrices();}},[tab,loadStrategyLog,loadRegime,loadState,loadPrices]);
  useEffect(()=>{if(tab!=="performance"||!authed)return;const iv=setInterval(()=>{loadState();loadPrices();loadStrategyLog();},60000);return()=>clearInterval(iv);},[tab,authed,loadState,loadPrices,loadStrategyLog]);
  useEffect(()=>{if(authed){loadRegime();loadPeaceSignal();}},[authed,loadRegime,loadPeaceSignal]);
  useEffect(()=>{if(!authed)return;const iv=setInterval(()=>{loadRegime();loadPeaceSignal();},1800000);return()=>clearInterval(iv);},[authed,loadRegime,loadPeaceSignal]);
  useEffect(()=>{if(messages.length>lastMsgCount.current){chatEnd.current?.scrollIntoView({behavior:"smooth",block:"end"});lastMsgCount.current=messages.length;}},[messages]);

  // SEND MESSAGE
  const sendMessage=async(text)=>{const msg=text||input.trim();if(!msg||loading)return;setInput("");setMessages(p=>[...p,{role:"user",content:msg}]);setLoading(true);
    try{const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","x-apex-key":accessKey},body:JSON.stringify({messages:[...messages,{role:"user",content:msg}].map(m=>({role:m.role,content:m.content})),client_state:state,client_prices:prices})});const d=await r.json();if(d.error)throw new Error(d.error);
    setMessages(p=>[...p,{role:"assistant",content:d.content,pathway:d.pathway,urgency:d.urgency,compliance:d.compliance,cost:d.cost,algo:d.algo}]);
    if(d.pathway==="command"||d.pathway==="chat_command"||d.state_changed){await loadState();await loadPrices();loadStrategyLog();}}catch(err){setMessages(p=>[...p,{role:"assistant",content:`❌ ${err.message}`}]);}setLoading(false);};

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

  // CLOSE POSITION (full or partial)
  const executeClose=async()=>{
    if(!closePos)return;
    const unitsToClose=Number(closePos.units);
    const exit=Number(closePos.exit_price);
    if(!exit||exit<=0){alert("Please enter a valid exit price");return;}
    if(!unitsToClose||unitsToClose<=0){alert("Please enter units to close");return;}
    if(unitsToClose>closePos.max_units){alert("Cannot close more than position size ("+closePos.max_units+"u)");return;}
    const isPartial=unitsToClose<closePos.max_units;
    const d=await stateAction(isPartial?"partial_close":"close_position",{ticker:closePos.ticker,units:unitsToClose,exit_price:exit});
    if(d?.ok||d?.closed)setClosePos(null);
    else alert("Error: "+(d?.error||"unknown"));
  };
  const setClosePct=(pct)=>{if(!closePos)return;const u=parseFloat((closePos.max_units*(pct/100)).toFixed(4));setClosePos(p=>({...p,units:u,pct}));};

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
          {(regime?.current||peaceSignal)&&(<div style={{padding:"4px 12px",background:T.card,borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",fontSize:9,color:T.textDim,flexShrink:0}}>
            <span>{regime?.current?.primary_code||"—"} <span style={{color:T.textDim}}>({regime?.current?.confidence||0}%)</span></span>
            {peaceSignal&&<span>Peace: <span style={{color:peaceSignal.score>=3?T.green:peaceSignal.score>=1?T.amber:T.textDim,fontWeight:700}}>{peaceSignal.score}/8</span></span>}
            {regime?.shift?.shift_detected&&<span style={{color:T.red,fontWeight:700}}>⚠️ REGIME SHIFT</span>}
          </div>)}
          <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
            {messages.length===0&&(<div style={{textAlign:"center",marginTop:40,color:T.textDim}}>
              <div style={{fontSize:36,marginBottom:6}}>🧠</div><div style={{fontSize:13,fontWeight:600}}>APEX BRAIN V4.6</div>
              <div style={{fontSize:10,marginTop:4}}>Chat commands: "move JPM stop to 300" • "close BAC at 54" • "BAC T1 to 57"</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:12}}>
                {["Morning brief","How are my positions?","Weekly review","BAC earnings prep","What's the regime?","Scan for opportunities"].map((q,i)=>(<button key={i} onClick={()=>sendMessage(q)} style={{padding:"5px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:14,color:T.textDim,fontSize:10,cursor:"pointer"}}>{q}</button>))}
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
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder={isListening?"🎤 Listening...":"Message APEX..."} disabled={loading} style={{flex:1,padding:"9px 12px",background:isListening?T.cardHover:T.card,border:`1px solid ${isListening?T.gold:T.border}`,borderRadius:20,color:T.text,fontSize:13,fontFamily:T.sans,outline:"none"}}/>
              <button onClick={isListening?stopListening:startListening} disabled={loading} title="Voice input" style={{width:40,height:40,borderRadius:"50%",background:isListening?T.red:T.card,border:`1px solid ${T.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎤</button>
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
                  <button onClick={()=>setClosePos({ticker:pos.id,units:pos.units,max_units:pos.units,entry_price:pos.entry_price,current_price:pos.livePrice,direction:pos.direction,sleeve:pos.sleeve,currency:pos.currency,exit_price:pos.livePrice||pos.entry_price})} title="Close position" style={{...btnS,width:24,height:24,background:T.red+"20"}}><X size={10} color={T.red}/></button>
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
            <div>
              <span style={{fontSize:14,fontWeight:700,color:T.text}}>Pipeline</span>
              {scannerTime&&<span style={{fontSize:9,color:T.textDim,marginLeft:8}}>Updated {scannerTime}</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={loadScanner} disabled={scannerLoading} style={{padding:"5px 10px",background:T.cardHover,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,fontSize:10,cursor:scannerLoading?"wait":"pointer"}}>{scannerLoading?"⏳":"🔄"} Refresh</button>
              <button onClick={()=>sendMessage("Deep analysis on top 3 scanner opportunities — full trade construction for each")} style={{padding:"5px 10px",background:T.gold,color:"#000",fontWeight:600,border:"none",borderRadius:6,fontSize:10,cursor:"pointer"}}>🧠 Deep Dive</button>
            </div>
          </div>

          {scanner&&(<div style={{fontSize:9,color:T.textDim,marginBottom:6}}>
            Regime: <span style={{color:T.gold}}>{scanner.regime}</span> • Scanned: {scanner.scanned} • Actionable: <span style={{color:T.green}}>{scanner.actionable}</span>
          </div>)}

          {/* LIVE OPPORTUNITIES FROM SCANNER */}
          {scanner?.all?.filter(opp=>!positions.some(p=>p.id===opp.ticker)).slice(0,10).map((opp,i)=>{
            const gradeColor=opp.grade==="A"?T.green:opp.grade==="B"?T.gold:opp.grade==="C"?T.amber:T.textDim;
            const scoreBarWidth=Math.max(5,Math.min(100,opp.score));
            return(<div key={opp.ticker} style={{padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${opp.actionable?T.border:T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:T.text}}>{opp.ticker}</span>
                  <span style={{padding:"2px 6px",background:gradeColor+"20",color:gradeColor,borderRadius:4,fontSize:10,fontWeight:700}}>{opp.grade}</span>
                  {opp.actionable&&<span style={{padding:"2px 6px",background:T.green+"20",color:T.green,borderRadius:4,fontSize:9,fontWeight:600}}>ACTIONABLE</span>}
                </div>
                <span style={{fontSize:12,color:gradeColor,fontWeight:700}}>{opp.score}/100</span>
              </div>
              <div style={{marginTop:6,height:4,background:T.cardHover,borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${scoreBarWidth}%`,height:"100%",background:gradeColor,borderRadius:2}}/>
              </div>
              <div style={{fontSize:9,color:T.textDim,marginTop:4,display:"flex",justifyContent:"space-between"}}>
                <span>Regime fit: {opp.regime_weight?.toFixed(2)}x</span>
                <span>Correlation: {opp.correlation_check?.passes?"✓ OK":"⚠ High"}</span>
              </div>
              <div style={{display:"flex",gap:6,marginTop:6}}>
                <button onClick={()=>{setTab("chat");sendMessage(`Deep dive on ${opp.ticker} — full trade construction with entry, stop, T1, T2, R:R, sleeve recommendation. Factor in our current book and the ${scanner.regime} regime.`);}} style={{flex:1,padding:"4px 8px",background:T.cardHover,border:`1px solid ${T.border}`,borderRadius:4,color:T.gold,fontSize:10,cursor:"pointer"}}>Deep Dive →</button>
                <button onClick={()=>{setAddForm({ticker:opp.ticker,units:"",entry:"",stop:"",t1:"",t2:"",sleeve:"B",direction:"buy",thesis:`Scanner grade ${opp.grade} (${opp.score}/100). ${scanner.regime} regime.`});setShowAdd(true);setTab("positions");}} style={{padding:"4px 8px",background:T.gold,color:"#000",fontWeight:600,border:"none",borderRadius:4,fontSize:10,cursor:"pointer"}}>+ Add</button>
              </div>
            </div>);
          })}

          {!scanner&&!scannerLoading&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>Loading opportunities...</div>}
          {scanner&&!scanner.all?.filter(opp=>!positions.some(p=>p.id===opp.ticker)).length&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>No non-held opportunities in scanner right now. Auto-refreshes every 5 min.</div>}

          {/* LEGACY MANUAL PIPELINE (if user has curated entries) */}
          {(state?.pipeline||[]).filter(p=>p.status!=="filled").length>0&&(<>
            <div style={{fontSize:10,fontWeight:700,color:T.textDim,marginTop:16,marginBottom:6,letterSpacing:1}}>MANUAL PIPELINE (curated)</div>
            {(state?.pipeline||[]).filter(p=>p.status!=="filled").map((p,i)=>(<div key={"manual-"+i} style={{padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:700,color:T.text}}>{p.candidate}</span>
                <span style={{fontSize:10,color:p.status==="armed"?T.green:T.amber}}>{p.status?.toUpperCase()}</span>
              </div>
              <div style={{fontSize:10,color:T.textDim,marginTop:2}}>Slot {p.slot} • {p.day||"TBD"} • {p.thesis||""}</div>
              <button onClick={()=>{setTab("chat");sendMessage(`Deep dive on ${p.candidate} — full trade construction`);}} style={{marginTop:4,padding:"3px 8px",background:T.cardHover,border:`1px solid ${T.border}`,borderRadius:4,color:T.gold,fontSize:9,cursor:"pointer"}}>Deep Dive →</button>
            </div>))}
          </>)}
        </div>)}

        {/* ═══ PERFORMANCE TAB ═══ */}
        {tab==="performance"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>Fund Performance</span>
            <span style={{fontSize:9,color:T.textDim}}>Since 17 Mar 2026</span>
          </div>

          {/* REGIME + PEACE BANNER */}
          {(regime?.current||peaceSignal)&&(<div style={{padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:10,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10}}>
            <div>
              <span style={{color:T.textDim}}>Regime: </span><span style={{color:T.gold,fontWeight:700}}>{regime?.current?.primary_regime||"—"}</span>
              {regime?.current?.confidence&&<span style={{color:T.textDim,marginLeft:4}}>({regime.current.confidence}% conf)</span>}
            </div>
            {peaceSignal&&<div>
              <span style={{color:T.textDim}}>Peace: </span><span style={{color:peaceSignal.score>=3?T.green:peaceSignal.score>=1?T.amber:T.textDim,fontWeight:700}}>{peaceSignal.score}/8</span>
            </div>}
          </div>)}

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

          {/* EQUITY CURVE */}
          {state?.closed?.length>0&&(()=>{
            const trades=state.closed.slice().sort((a,b)=>new Date(a.exit_date)-new Date(b.exit_date));
            let cum=Number(account.total_deposited)||0;
            const points=[{pl:cum,date:trades[0]?.exit_date}];
            for(const t of trades){cum+=Number(t.net_pl)||0;points.push({pl:cum,date:t.exit_date});}
            const pls=points.map(p=>p.pl);
            const min=Math.min(...pls)*0.98;
            const max=Math.max(...pls)*1.02;
            const w=300,h=100;
            const xStep=w/(points.length-1||1);
            const yScale=(p)=>h-((p-min)/(max-min||1))*h;
            const path=points.map((p,i)=>`${i===0?"M":"L"} ${i*xStep},${yScale(p.pl)}`).join(" ");
            const lastPoint=points[points.length-1];
            const trend=lastPoint.pl>=(points[0]?.pl||0)?T.green:T.red;
            return(<div style={{padding:"10px",background:T.card,borderRadius:8,marginBottom:10,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.textDim,fontWeight:700,letterSpacing:1,marginBottom:6}}>EQUITY CURVE</div>
              <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={trend} stopOpacity="0.3"/><stop offset="100%" stopColor={trend} stopOpacity="0"/></linearGradient></defs>
                <path d={`${path} L ${w},${h} L 0,${h} Z`} fill="url(#eqGrad)"/>
                <path d={path} fill="none" stroke={trend} strokeWidth="2"/>
              </svg>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:T.textDim,fontFamily:T.mono}}>
                <span>£{points[0].pl.toFixed(0)}</span>
                <span style={{color:trend,fontWeight:700}}>£{lastPoint.pl.toFixed(0)}</span>
              </div>
            </div>);
          })()}

          {/* SLEEVE BREAKDOWN */}
          {positions.length>0&&(()=>{
            const sleeves={};
            positions.forEach(p=>{const s=p.sleeve||"B";const lp=prices[p.id]?.price||p.entry_price;const val=lp*p.units;const gbp=p.currency==="GBP"?val:val/gbpUsd;if(!sleeves[s])sleeves[s]={count:0,exposure:0};sleeves[s].count++;sleeves[s].exposure+=gbp;});
            return(<div style={{padding:"10px",background:T.card,borderRadius:8,marginBottom:10,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.textDim,fontWeight:700,letterSpacing:1,marginBottom:6}}>SLEEVE BREAKDOWN</div>
              {Object.entries(sleeves).map(([s,d])=>{const pct=(d.exposure/account.nav)*100;return(<div key={s} style={{marginBottom:4}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                  <span style={{color:T.text}}>Sleeve {s} ({d.count})</span>
                  <span style={{color:T.textDim,fontFamily:T.mono}}>£{fmt(d.exposure)} ({fmt(pct,0)}%)</span>
                </div>
                <div style={{height:3,background:T.cardHover,borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:`${Math.min(100,pct)}%`,height:"100%",background:s==="A"?T.amber:s==="B"?T.gold:T.green}}/>
                </div>
              </div>);})}
            </div>);
          })()}

          {/* Closed trade history */}
          <div style={{fontSize:10,color:T.textDim,fontWeight:700,letterSpacing:1,marginBottom:6}}>TRADE HISTORY</div>
          <div style={{maxHeight:240,overflowY:"auto",marginBottom:10}}>
            {(state?.closed||[]).slice().reverse().map((c,i)=>(<div key={i} style={{padding:"6px 8px",background:T.card,borderRadius:6,marginBottom:3,border:`1px solid ${T.border}`,fontSize:11}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,color:T.text}}>{c.ticker} <span style={{color:T.textDim,fontWeight:400}}>[{c.direction||"buy"}]</span></span>
                <span style={{color:c.net_pl>0?T.green:T.red,fontFamily:T.mono,fontWeight:700}}>{c.net_pl>0?"+":""}£{c.net_pl}</span>
              </div>
              <div style={{color:T.textDim,fontSize:10,marginTop:2}}>${c.entry_price} → ${c.exit_price} • {c.units}u • {c.reason}</div>
            </div>))}
            {!state?.closed?.length&&<div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:12}}>No closed trades yet</div>}
          </div>

          {/* STRATEGY LOG */}
          <div style={{fontSize:10,color:T.textDim,fontWeight:700,letterSpacing:1,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
            <span>STRATEGY LOG</span>
            <button onClick={loadStrategyLog} style={{background:"transparent",border:"none",color:T.textDim,fontSize:9,cursor:"pointer"}}>Refresh</button>
          </div>
          <div style={{maxHeight:200,overflowY:"auto",marginBottom:10}}>
            {strategyLog.slice().reverse().slice(0,30).map((e,i)=>(<div key={i} style={{padding:"4px 8px",background:T.card,borderRadius:4,marginBottom:2,border:`1px solid ${T.border}`,fontSize:10}}>
              <span style={{color:T.textDim}}>[{new Date(e.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"Europe/London"})}]</span> <span style={{color:T.text}}>{e.note}</span>
            </div>))}
            {!strategyLog.length&&<div style={{color:T.textDim,fontSize:11,textAlign:"center",padding:12}}>No strategy entries yet. Every trade action auto-logs.</div>}
          </div>

          {/* Investor view */}
          {(()=>{
            const deposited=Number(account.total_deposited)||1;
            const nav=Number(account.nav)||0;
            const realised=Number(account.total_realised_pl)||0;
            const totalReturn=((nav-deposited)/deposited)*100;
            const fundDays=Math.max(1,Math.floor((Date.now()-new Date("2026-03-17").getTime())/86400000));
            const annualised=totalReturn*(365/fundDays);
            const trades=state?.closed||[];
            const wins=trades.filter(t=>t.net_pl>0);
            const losses=trades.filter(t=>t.net_pl<=0);
            const winRate=trades.length?(wins.length/trades.length)*100:0;
            const avgWin=wins.length?wins.reduce((a,t)=>a+t.net_pl,0)/wins.length:0;
            const avgLoss=losses.length?losses.reduce((a,t)=>a+t.net_pl,0)/losses.length:0;
            const profitFactor=Math.abs(avgLoss)>0?(avgWin*wins.length)/Math.abs(avgLoss*losses.length):0;
            const expectancy=trades.length?trades.reduce((a,t)=>a+t.net_pl,0)/trades.length:0;
            const biggestWin=wins.length?Math.max(...wins.map(t=>t.net_pl)):0;
            const biggestLoss=losses.length?Math.min(...losses.map(t=>t.net_pl)):0;
            // Calculate running equity curve + drawdown
            let peak=deposited,maxDD=0,currDD=0;
            let cum=deposited;
            const sortedTrades=[...trades].sort((a,b)=>new Date(a.exit_date)-new Date(b.exit_date));
            for(const t of sortedTrades){cum+=Number(t.net_pl)||0;if(cum>peak)peak=cum;const dd=((peak-cum)/peak)*100;if(dd>maxDD)maxDD=dd;currDD=dd;}
            const targetNav=100000;// £100k drawdown target
            const progressPct=((nav-deposited)/(targetNav-deposited))*100;
            const goalYears=10;const goalNav=1000000;
            const goalProgress=(nav/goalNav)*100;
            const monthlyBurn=Math.abs(avgLoss)*losses.length/Math.max(1,Math.ceil(fundDays/30));
            // Best/worst positions current
            const openPositions=state?.positions||[];
            let bestOpenPct=-Infinity,bestOpenTicker="";
            let worstOpenPct=Infinity,worstOpenTicker="";
            for(const pos of openPositions){
              const lp=prices[pos.id]?.price;if(!lp)continue;
              const pct=((lp-pos.entry_price)/pos.entry_price)*100*(pos.direction==="short"?-1:1);
              if(pct>bestOpenPct){bestOpenPct=pct;bestOpenTicker=pos.id;}
              if(pct<worstOpenPct){worstOpenPct=pct;worstOpenTicker=pos.id;}
            }
            const Row=({l,v,c=T.text,fw=500})=>(<div style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
              <span style={{color:T.textDim}}>{l}</span>
              <span style={{color:c,fontFamily:T.mono,fontWeight:fw}}>{v}</span>
            </div>);
            return(<div style={{padding:"12px",background:T.card,borderRadius:8,border:`2px solid ${T.gold}`,marginTop:10}}>
              <div style={{fontSize:11,fontWeight:800,color:T.gold,marginBottom:10,letterSpacing:2,textAlign:"center"}}>📊 INVESTOR SUMMARY</div>

              {/* CAPITAL */}
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1,marginBottom:4,marginTop:4}}>CAPITAL</div>
              <div style={{fontSize:11,lineHeight:1.6}}>
                <Row l="Capital invested" v={"£"+(deposited).toLocaleString()}/>
                <Row l="Current NAV" v={"£"+fmt(nav)} c={nav>=deposited?T.green:T.red} fw={700}/>
                <Row l="Open P&L (unrealised)" v={(totalOpenPL>=0?"+":"")+"£"+fmt(totalOpenPL)} c={totalOpenPL>=0?T.green:T.red}/>
                <Row l="Realised P&L" v={"+£"+fmt(realised)} c={T.green}/>
              </div>

              {/* PERFORMANCE */}
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1,marginBottom:4,marginTop:10}}>PERFORMANCE</div>
              <div style={{fontSize:11,lineHeight:1.6}}>
                <Row l="Total return" v={(totalReturn>=0?"+":"")+fmt(totalReturn,1)+"%"} c={totalReturn>=0?T.green:T.red} fw={700}/>
                <Row l="Annualised (projected)" v={(annualised>=0?"+":"")+fmt(annualised,1)+"%"} c={annualised>=0?T.green:T.red}/>
                <Row l="Fund age" v={fundDays+" days"}/>
                <Row l="Current drawdown" v={fmt(currDD,1)+"%"} c={currDD>5?T.red:currDD>2?T.amber:T.text}/>
                <Row l="Max drawdown" v={fmt(maxDD,1)+"%"} c={maxDD>10?T.red:maxDD>5?T.amber:T.text}/>
              </div>

              {/* TRADES */}
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1,marginBottom:4,marginTop:10}}>TRADES</div>
              <div style={{fontSize:11,lineHeight:1.6}}>
                <Row l="Total trades" v={trades.length}/>
                <Row l="Win rate" v={fmt(winRate,0)+"%"} c={winRate>=50?T.green:T.amber}/>
                <Row l="Profit factor" v={profitFactor?fmt(profitFactor,2):"—"} c={profitFactor>2?T.green:profitFactor>1?T.amber:T.red}/>
                <Row l="Avg win" v={"+£"+fmt(avgWin)} c={T.green}/>
                <Row l="Avg loss" v={"£"+fmt(avgLoss)} c={T.red}/>
                <Row l="Expectancy/trade" v={(expectancy>=0?"+":"")+"£"+fmt(expectancy)} c={expectancy>=0?T.green:T.red}/>
                <Row l="Biggest win" v={"+£"+fmt(biggestWin)} c={T.green}/>
                <Row l="Biggest loss" v={"£"+fmt(biggestLoss)} c={T.red}/>
              </div>

              {/* BOOK */}
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1,marginBottom:4,marginTop:10}}>CURRENT BOOK</div>
              <div style={{fontSize:11,lineHeight:1.6}}>
                <Row l="Open positions" v={openPositions.length+"/10 slots"}/>
                <Row l="Cash" v={"£"+fmt(account.cash||0)}/>
                <Row l="Margin used" v={"£"+fmt(account.margin_used||0)}/>
                <Row l="Margin health" v={(account.margin_health_pct||100)+"%"} c={(account.margin_health_pct||100)>50?T.green:(account.margin_health_pct||100)>25?T.amber:T.red}/>
                {bestOpenTicker&&<Row l="Best open position" v={bestOpenTicker+" "+(bestOpenPct>=0?"+":"")+fmt(bestOpenPct,1)+"%"} c={bestOpenPct>=0?T.green:T.red}/>}
                {worstOpenTicker&&<Row l="Worst open position" v={worstOpenTicker+" "+fmt(worstOpenPct,1)+"%"} c={worstOpenPct>=0?T.green:T.red}/>}
              </div>

              {/* GOALS */}
              <div style={{fontSize:9,color:T.textDim,letterSpacing:1,marginBottom:4,marginTop:10}}>GOAL TRACKING</div>
              <div style={{fontSize:11,lineHeight:1.6}}>
                <Row l="£100k drawdown target" v={fmt(progressPct,1)+"%"}/>
                <div style={{height:4,background:T.cardHover,borderRadius:2,overflow:"hidden",margin:"2px 0"}}>
                  <div style={{width:Math.max(0,Math.min(100,progressPct))+"%",height:"100%",background:T.gold}}/>
                </div>
                <Row l="£1M fund target (10yr)" v={fmt(goalProgress,2)+"%"}/>
                <div style={{height:4,background:T.cardHover,borderRadius:2,overflow:"hidden",margin:"2px 0"}}>
                  <div style={{width:Math.max(0,Math.min(100,goalProgress))+"%",height:"100%",background:T.green}}/>
                </div>
                <Row l="Annual target" v="40%+" c={annualised>=40?T.green:annualised>=20?T.amber:T.red}/>
              </div>

              {/* MACRO CONTEXT */}
              {regime?.current&&(<>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1,marginBottom:4,marginTop:10}}>MACRO CONTEXT</div>
                <div style={{fontSize:11,lineHeight:1.6}}>
                  <Row l="Regime" v={regime.current.primary_code} c={T.gold}/>
                  <Row l="Confidence" v={regime.current.confidence+"%"}/>
                  {peaceSignal&&<Row l="Peace signal" v={peaceSignal.score+"/8"} c={peaceSignal.score>=3?T.green:peaceSignal.score>=1?T.amber:T.textDim}/>}
                  <Row l="Conflict day" v={Math.floor((Date.now()-new Date("2026-02-28").getTime())/86400000)}/>
                </div>
              </>)}

              <div style={{fontSize:9,color:T.textDim,marginTop:10,textAlign:"center",fontStyle:"italic"}}>Updated {new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"})} • Auto-refresh 60s</div>
            </div>);
          })()}
        </div>)}

        {/* ═══ NEWS TAB ═══ */}
        {tab==="news"&&(<div style={{padding:"8px 12px",overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>Intel Feed</span>
            <button onClick={()=>{if(newsSubTab==="news")loadNews();else loadSocial();}} style={{padding:"4px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:6,color:T.textDim,fontSize:10,cursor:"pointer"}}><RefreshCw size={10}/> {newsSubTab==="news"?(newsTime||"Refresh"):(socialTime||"Refresh")}</button>
          </div>

          {/* NEWS / SOCIAL TAB SWITCHER */}
          <div style={{display:"flex",gap:4,marginBottom:8,background:T.card,padding:3,borderRadius:8,border:`1px solid ${T.border}`}}>
            <button onClick={()=>setNewsSubTab("news")} style={{flex:1,padding:"6px 8px",background:newsSubTab==="news"?T.gold:"transparent",color:newsSubTab==="news"?"#000":T.textDim,border:"none",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>📰 News ({news.length})</button>
            <button onClick={()=>setNewsSubTab("social")} style={{flex:1,padding:"6px 8px",background:newsSubTab==="social"?T.gold:"transparent",color:newsSubTab==="social"?"#000":T.textDim,border:"none",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>💬 Social ({social.length})</button>
          </div>

          <div style={{fontSize:9,color:T.textDim,marginBottom:6}}>Auto-refresh every 15 min • Regime: <span style={{color:T.gold}}>{regime?.current?.primary_regime||"loading..."}</span></div>

          {/* NEWS FEED */}
          {newsSubTab==="news"&&(<>
            {news.length===0&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>Loading news feed...</div>}
            {news.map((n,i)=>(<a key={i} href={n.link} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`,textDecoration:"none",overflow:"hidden",wordBreak:"break-word"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,fontSize:9}}>
                <span style={{color:n.category==="conflict"?T.red:n.category==="energy"?T.amber:n.category==="earnings"?T.green:n.category==="macro"?T.gold:T.textDim,fontWeight:700,letterSpacing:1}}>{n.category?.toUpperCase()||"NEWS"}</span>
                {n.age_hours!=null&&<span style={{color:T.textDim}}>{n.age_hours<1?"<1h":n.age_hours<24?`${n.age_hours}h`:`${Math.floor(n.age_hours/24)}d`} ago</span>}
              </div>
              <div style={{fontSize:12,fontWeight:600,color:T.text,lineHeight:1.4,wordBreak:"break-word",overflowWrap:"break-word"}}>{n.title}</div>
              {n.description&&<div style={{fontSize:10,color:T.textDim,marginTop:4,lineHeight:1.4,wordBreak:"break-word",overflowWrap:"break-word"}}>{n.description.slice(0,200)}{n.description.length>200?"…":""}</div>}
              {n.source&&<div style={{fontSize:8,color:T.textDim,marginTop:4,fontStyle:"italic"}}>{n.source}</div>}
            </a>))}
          </>)}

          {/* SOCIAL FEED */}
          {newsSubTab==="social"&&(<>
            {social.length===0&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>Loading social feed...<br/><span style={{fontSize:10}}>Aggregates Trump statements, Hormuz activity, insurance commentary</span></div>}
            {social.map((s,i)=>(<a key={i} href={s.link||"#"} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`,textDecoration:"none",overflow:"hidden",wordBreak:"break-word"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,fontSize:9}}>
                <span style={{color:T.gold,fontWeight:700,letterSpacing:1}}>{s.source||s.query||"SOCIAL"}</span>
                {s.date&&<span style={{color:T.textDim}}>{new Date(s.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</span>}
              </div>
              <div style={{fontSize:12,fontWeight:600,color:T.text,lineHeight:1.4,wordBreak:"break-word",overflowWrap:"break-word"}}>{s.title||s.text}</div>
            </a>))}
          </>)}
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

            {/* V4 INTELLIGENCE STATUS */}
            <div style={{padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.gold,fontWeight:700,letterSpacing:1,marginBottom:4}}>V4 INTELLIGENCE</div>
              <div style={{fontSize:10,color:T.text,lineHeight:1.6}}>
                <div>Regime: <span style={{color:regime?.current?T.green:T.red}}>{regime?.current?.primary_regime||"Not loaded"}</span> {regime?.current?.confidence&&`(${regime.current.confidence}%)`}</div>
                <div>Peace signal: <span style={{color:peaceSignal?T.green:T.red}}>{peaceSignal?`${peaceSignal.score}/8`:"Not loaded"}</span></div>
                <div>Scanner: <span style={{color:scanner?T.green:T.textDim}}>{scanner?`${scanner.actionable}/${scanner.scanned} actionable`:"Not loaded"}</span></div>
                <div>Strategy log: <span style={{color:T.text}}>{health.strategy_log_count||0} entries</span></div>
                <div>Price errors 24h: <span style={{color:health.price_errors_24h>5?T.red:T.green}}>{health.price_errors_24h||0}</span></div>
              </div>
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

      {closePos&&<Modal title={`Close ${closePos.ticker}`} onClose={()=>setClosePos(null)}>
        <div style={{padding:"8px 10px",background:T.card,borderRadius:8,marginBottom:8,border:`1px solid ${T.border}`,fontSize:11}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:T.textDim}}>Position:</span><span style={{color:T.text,fontWeight:700}}>{closePos.ticker} [{closePos.sleeve}/{(closePos.direction||"buy").toUpperCase()}]</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:T.textDim}}>Entry:</span><span style={{color:T.text,fontFamily:T.mono}}>${fmt(closePos.entry_price)} × {closePos.max_units}u</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:T.textDim}}>Current:</span><span style={{color:T.text,fontFamily:T.mono}}>${fmt(closePos.current_price)}</span>
          </div>
        </div>

        <div style={{fontSize:10,color:T.textDim,marginBottom:4,letterSpacing:1}}>QUICK SIZE</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}}>
          {[25,50,75,100].map(pct=>(
            <button key={pct} onClick={()=>setClosePct(pct)} style={{padding:"8px 4px",background:closePos.pct===pct?T.gold:T.card,color:closePos.pct===pct?"#000":T.text,border:`1px solid ${closePos.pct===pct?T.gold:T.border}`,borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {pct}%
            </button>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <Inp p="Units to close" v={closePos.units} c={v=>setClosePos(p=>({...p,units:v,pct:null}))} t="number"/>
          <Inp p="Exit price $" v={closePos.exit_price} c={v=>setClosePos(p=>({...p,exit_price:v}))} t="number"/>
        </div>

        {(()=>{
          const u=Number(closePos.units)||0;
          const ex=Number(closePos.exit_price)||0;
          const dir=(closePos.direction||"buy").toLowerCase();
          const rawPL=(dir==="short"?closePos.entry_price-ex:ex-closePos.entry_price)*u;
          const gbp=Number(state?.account?.gbp_usd)||1.34;
          const plGbp=closePos.currency==="GBP"?rawPL:rawPL/gbp;
          const remaining=closePos.max_units-u;
          const isPartial=remaining>0;
          return(<div style={{padding:"8px 10px",background:T.card,borderRadius:8,marginTop:8,marginBottom:8,border:`1px solid ${T.border}`,fontSize:11}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <span style={{color:T.textDim}}>Closing:</span><span style={{color:T.text,fontFamily:T.mono}}>{u}u of {closePos.max_units}u</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <span style={{color:T.textDim}}>Remaining after close:</span><span style={{color:T.text,fontFamily:T.mono}}>{remaining}u {isPartial?"(PARTIAL)":"(FULL CLOSE)"}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{color:T.textDim}}>Estimated P&L:</span><span style={{color:plGbp>=0?T.green:T.red,fontFamily:T.mono,fontWeight:700}}>{plGbp>=0?"+":""}£{fmt(plGbp)}</span>
            </div>
          </div>);
        })()}

        <Btn onClick={executeClose}>{Number(closePos.units)>=closePos.max_units?"🔴 FULL CLOSE":"🟡 PARTIAL CLOSE"}</Btn>
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
