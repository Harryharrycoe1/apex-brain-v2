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
  const[showDeposit,setShowDeposit]=useState(false);
  const[depositAmount,setDepositAmount]=useState("");
  const chatEnd=useRef(null);
  const chatScroller=useRef(null);
  const lastMsgCount=useRef(0);

  // AUTH
  useEffect(()=>{const k=typeof window!=="undefined"&&localStorage.getItem("apex_key");if(k){setAccessKey(k);setAuthed(true);};},[]);
  const login=()=>{if(accessKey.trim()){localStorage.setItem("apex_key",accessKey.trim());setAuthed(true);}};
  const logout=()=>{localStorage.removeItem("apex_key");setAuthed(false);setMessages([]);};

  // LOADERS
  const loadState=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/state",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();if(d.state)setState(d.state);}else console.error("loadState HTTP "+r.status);}catch(e){console.error("loadState:",e.message);}},[accessKey]);
  const loadPrices=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/prices",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setPrices(d.prices||{});setPriceTime(d.uk_time||"");setMarketState(d.market_state||"");}else console.error("loadPrices HTTP "+r.status);}catch(e){console.error("loadPrices:",e.message);}},[accessKey]);
  const loadNews=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/news",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setNews(d.articles||[]);setNewsTime(d.uk_time||"");}else console.error("loadNews HTTP "+r.status);}catch(e){console.error("loadNews:",e.message);}},[accessKey]);
  const loadHealth=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/health",{headers:{"x-apex-key":accessKey}});if(r.ok)setHealth(await r.json());else console.error("loadHealth HTTP "+r.status);}catch(e){console.error("loadHealth:",e.message);}},[accessKey]);
  const loadScanner=useCallback(async()=>{if(!accessKey)return;setScannerLoading(true);try{const r=await fetch("/api/scanner",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setScanner(d);setScannerTime(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}));}else console.error("loadScanner HTTP "+r.status);}catch(e){console.error("loadScanner:",e.message);}setScannerLoading(false);},[accessKey]);
  const loadRegime=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/regime",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setRegime(d);}}catch(e){console.error("loadRegime:",e.message);}},[accessKey]);
  const loadPeaceSignal=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/altdata?source=peace_signal",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();setPeaceSignal(d.peace_signal);}}catch(e){console.error("loadPeaceSignal:",e.message);}},[accessKey]);
  const loadStrategyLog=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/state",{method:"POST",headers:{"Content-Type":"application/json","x-apex-key":accessKey},body:JSON.stringify({action:"get_strategy_log"})});if(r.ok){const d=await r.json();setStrategyLog(d.log||[]);}}catch(e){console.error("loadStrategyLog:",e.message);}},[accessKey]);
  const loadSocial=useCallback(async()=>{if(!accessKey)return;try{const r=await fetch("/api/social",{headers:{"x-apex-key":accessKey}});if(r.ok){const d=await r.json();
    // Combine reddit, stocktwits, twitter into unified feed
    const unified=[];
    for(const p of (d.reddit||[])){unified.push({type:"reddit",source:"r/"+p.subreddit,title:p.title,text:p.text,url:p.url,created:p.created,score:p.score,comments:p.comments});}
    for(const p of (d.stocktwits_held||[])){unified.push({type:"stocktwits",source:"ST $"+p.symbol,title:p.text,sentiment:p.sentiment,user:p.user,url:p.url,created:p.created,likes:p.likes});}
    for(const p of (d.twitter||[])){unified.push({type:"twitter",source:"@"+p.account,title:p.text,url:p.url,created:p.created});}
    // Sort by created date desc
    unified.sort((a,b)=>{if(!a.created)return 1;if(!b.created)return -1;return new Date(b.created)-new Date(a.created);});
    setSocial(unified);
    setSocialTime(d.uk_time||new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"}));
  }}catch{};},[accessKey]);

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
  useEffect(()=>{if(tab!=="pipeline"||!authed)return;const iv=setInterval(()=>{loadScanner();loadState();loadPrices();},300000);return()=>clearInterval(iv);},[tab,authed,loadScanner,loadState,loadPrices]);
  useEffect(()=>{if(tab==="performance"){loadStrategyLog();loadRegime();loadState();loadPrices();}},[tab,loadStrategyLog,loadRegime,loadState,loadPrices]);
  useEffect(()=>{if(tab!=="performance"||!authed)return;const iv=setInterval(()=>{loadState();loadPrices();loadStrategyLog();},60000);return()=>clearInterval(iv);},[tab,authed,loadState,loadPrices,loadStrategyLog]);
  useEffect(()=>{if(authed){loadRegime();loadPeaceSignal();}},[authed,loadRegime,loadPeaceSignal]);
  useEffect(()=>{if(!authed)return;const iv=setInterval(()=>{loadRegime();loadPeaceSignal();},1800000);return()=>clearInterval(iv);},[authed,loadRegime,loadPeaceSignal]);
  useEffect(()=>{if(messages.length>lastMsgCount.current&&chatScroller.current){chatScroller.current.scrollTop=chatScroller.current.scrollHeight;lastMsgCount.current=messages.length;}},[messages]);

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

  // ADD CAPITAL
  const submitDeposit=async()=>{
    const amt=Number(depositAmount);
    if(!amt||amt<=0){alert("Please enter a valid amount");return;}
    const d=await stateAction("add_deposit",{amount:amt,date:new Date().toISOString().slice(0,10)});
    if(d?.ok){setShowDeposit(false);setDepositAmount("");await loadState();await loadStrategyLog();}
    else alert("Error: "+(d?.error||"unknown"));
  };

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
          <div ref={chatScroller} style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
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
              <button onClick={loadScanner} disabled={scannerLoading} style={{padding:"5px 10px",background:T.cardHover,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,fontSize:10,cursor:scannerLoading?"wait":"pointer"}}>{scannerLoading?"⏳":"🔄"} Scan</button>
            </div>
          </div>

          {scanner&&(<div style={{fontSize:9,color:T.textDim,marginBottom:10,padding:"6px 8px",background:T.card,borderRadius:6,border:`1px solid ${T.border}`}}>
            <div>🌐 Universe: <span style={{color:T.text}}>{scanner.universe_size||100}</span> • Scanned: <span style={{color:T.text}}>{scanner.scanned}</span> • Regime: <span style={{color:T.gold}}>{scanner.regime}</span></div>
            <div style={{marginTop:2}}>✅ Valid (R:R ≥3): <span style={{color:T.green,fontWeight:700}}>{scanner.passing_rr||0}</span> • ❌ Rejected R:R: <span style={{color:T.red}}>{scanner.rejected_rr||0}</span> • 🤷 Low confidence: <span style={{color:T.amber}}>{scanner.rejected_confidence||0}</span>{scanner.dismissed_count>0&&<> • 🚫 Dismissed: <span style={{color:T.textDim}}>{scanner.dismissed_count}</span></>}</div>
          </div>)}

          {/* ═══════════════════════════════════════════ */}
          {/* ACTIVE PIPELINE — user-promoted, ready to execute */}
          {/* ═══════════════════════════════════════════ */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4,marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:700,color:T.green,letterSpacing:1}}>⚡ ACTIVE PIPELINE ({(state?.active_pipeline||[]).length})</div>
            {(state?.active_pipeline||[]).length>0&&<button onClick={()=>{if(confirm("Clear all active pipeline?"))stateAction("clear_active",{});}} style={{padding:"3px 8px",background:"transparent",color:T.textDim,border:`1px solid ${T.border}`,borderRadius:4,fontSize:9,cursor:"pointer"}}>Clear</button>}
          </div>
          <div style={{fontSize:9,color:T.textDim,marginBottom:6}}>Promoted opportunities ready for execution. Live prices + setup refreshed each load.</div>
          {(state?.active_pipeline||[]).length===0&&<div style={{color:T.textDim,fontSize:11,padding:"12px",textAlign:"center",background:T.card,borderRadius:8,border:`1px dashed ${T.border}`,marginBottom:10}}>No active opportunities. Promote from APEX suggestions below.</div>}
          {(state?.active_pipeline||[]).map((ap,i)=>{
            const livePrice=prices[ap.candidate]?.price;
            const livePct=livePrice&&ap.entry_price?((livePrice-ap.entry_price)/ap.entry_price)*100:null;
            const stillValid=livePrice?(ap.direction==="buy"?livePrice>=ap.stop&&livePrice<=ap.t1*1.02:livePrice<=ap.stop&&livePrice>=ap.t1*0.98):true;
            // Staleness: promoted >4 hours ago AND price moved >2%
            const ageMin=ap.promoted_at?(Date.now()-new Date(ap.promoted_at).getTime())/60000:0;
            const isStale=ageMin>240&&livePct!=null&&Math.abs(livePct)>2;
            const borderColor=!stillValid?T.red:isStale?T.amber:T.green;
            return(<div key={"ap-"+i} style={{padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:6,border:`2px solid ${borderColor}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,fontWeight:700,color:T.text}}>{ap.candidate}</span>
                  <span style={{padding:"2px 6px",background:ap.direction==="buy"?T.green+"20":T.red+"20",color:ap.direction==="buy"?T.green:T.red,borderRadius:4,fontSize:9,fontWeight:700}}>{ap.direction?.toUpperCase()}</span>
                  {ap.grade&&<span style={{padding:"2px 6px",background:T.gold+"20",color:T.gold,borderRadius:4,fontSize:9,fontWeight:700}}>Q{ap.grade}</span>}
                  {!stillValid&&<span style={{padding:"2px 6px",background:T.red+"20",color:T.red,borderRadius:4,fontSize:9,fontWeight:700}}>⚠ STOP BREACHED</span>}
                  {isStale&&<span style={{padding:"2px 6px",background:T.amber+"20",color:T.amber,borderRadius:4,fontSize:9,fontWeight:700}}>⏳ STALE — REFRESH</span>}
                  {ap.setup_refreshed&&<span style={{padding:"2px 6px",background:T.gold+"20",color:T.gold,borderRadius:4,fontSize:9,fontWeight:700}}>↻ REFRESHED</span>}
                </div>
                <span style={{fontSize:10,color:T.textDim}}>R:R {ap.rr}:1 {ageMin>60?`• ${Math.floor(ageMin/60)}h old`:`• ${Math.floor(ageMin)}m`}</span>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginTop:6,fontSize:10,fontFamily:T.mono}}>
                <div><span style={{color:T.textDim}}>Entry:</span> <span style={{color:T.text}}>${fmt(ap.entry_price)}</span></div>
                <div><span style={{color:T.textDim}}>Live:</span> <span style={{color:livePct!=null&&livePct>0?T.green:livePct!=null&&livePct<0?T.red:T.text}}>${livePrice?fmt(livePrice):"—"}{livePct!=null?` (${livePct>=0?"+":""}${fmt(livePct,1)}%)`:""}</span></div>
                <div><span style={{color:T.textDim}}>Stop:</span> <span style={{color:T.red}}>${fmt(ap.stop)}</span></div>
                <div><span style={{color:T.textDim}}>T1:</span> <span style={{color:T.green}}>${fmt(ap.t1)}</span></div>
                <div><span style={{color:T.textDim}}>T2:</span> <span style={{color:T.green}}>${fmt(ap.t2)}</span></div>
                {ap.sector&&<div><span style={{color:T.textDim}}>Sector:</span> <span style={{color:T.textDim,fontSize:9}}>{ap.sector}</span></div>}
              </div>

              {/* Position sizing if available */}
              {ap.suggested_units&&(<div style={{display:"flex",justifyContent:"space-between",marginTop:6,padding:"4px 8px",background:T.cardHover,borderRadius:4,fontSize:10,fontFamily:T.mono}}>
                <span>Size: <span style={{color:T.text,fontWeight:700}}>{ap.suggested_units}u</span></span>
                <span>Risk: <span style={{color:ap.pct_nav_at_risk>1?T.red:T.green,fontWeight:700}}>£{fmt(ap.risk_gbp)} ({fmt(ap.pct_nav_at_risk,1)}%)</span></span>
              </div>)}

              {ap.entry_trigger&&<div style={{fontSize:9,color:T.textDim,marginTop:4,fontStyle:"italic"}}>⚡ {ap.entry_trigger}</div>}
              {ap.thesis&&<div style={{fontSize:10,color:T.text,marginTop:4,padding:"4px 6px",background:T.cardHover,borderRadius:4,borderLeft:`2px solid ${T.gold}`,lineHeight:1.4}}>💡 {ap.thesis}</div>}

              <div style={{display:"flex",gap:4,marginTop:8}}>
                <button onClick={()=>{setAddForm({ticker:ap.candidate,units:String(ap.suggested_units||""),entry:String(ap.entry_price||""),stop:String(ap.stop||""),t1:String(ap.t1||""),t2:String(ap.t2||""),sleeve:ap.sleeve||"B",direction:ap.direction||"buy",thesis:ap.thesis||""});setShowAdd(true);setTab("positions");}} style={{flex:2,padding:"6px 8px",background:T.green,color:"#000",fontWeight:700,border:"none",borderRadius:4,fontSize:11,cursor:"pointer"}}>▶ EXECUTE</button>
                <button onClick={async()=>{const r=await stateAction("update_active",{ticker:ap.candidate});if(r?.ok){await loadState();if(r.entry?.refresh_failed)alert("Refresh failed: "+(r.entry?.refresh_reason||"unknown"));else alert(ap.candidate+" setup refreshed:\n"+r.entry?.direction?.toUpperCase()+" entry $"+r.entry?.entry_price+"\nStop $"+r.entry?.stop+"\nT1 $"+r.entry?.t1+"\nR:R "+r.entry?.rr+":1");}else alert("Refresh failed: "+(r?.error||"unknown"));}} title="Re-scan ticker & rebuild setup from live price" style={{flex:1,padding:"6px 8px",background:T.cardHover,border:`1px solid ${T.border}`,borderRadius:4,color:T.gold,fontSize:11,cursor:"pointer"}}>↻ Refresh</button>
                <button onClick={async()=>{await stateAction("remove_active",{ticker:ap.candidate});await loadState();}} style={{padding:"6px 8px",background:T.cardHover,border:`1px solid ${T.red}`,borderRadius:4,color:T.red,fontSize:11,cursor:"pointer"}}>✕</button>
              </div>
            </div>);
          })}

          {/* ═══════════════════════════════════════════ */}
          {/* APEX SUGGESTION PIPELINE — auto-scanned, R:R validated */}
          {/* ═══════════════════════════════════════════ */}
          <div style={{fontSize:11,fontWeight:700,color:T.gold,letterSpacing:1,marginTop:16,marginBottom:6}}>🧠 APEX SUGGESTIONS ({scanner?.passing_rr||0})</div>
          <div style={{fontSize:9,color:T.textDim,marginBottom:6}}>Auto-scanned every 15 min • R:R ≥ 3:1 filter enforced • Non-held tickers only</div>

          {!scanner&&!scannerLoading&&<div style={{color:T.textDim,fontSize:11,padding:"12px",textAlign:"center"}}>Loading opportunities...</div>}
          {scanner?.top10?.length===0&&<div style={{color:T.textDim,fontSize:11,padding:"12px",textAlign:"center"}}>No opportunities passing R:R filter right now. Next scan in 15 min.</div>}

          {(scanner?.top10||[]).map((opp,i)=>{
            const s=opp.setup||{};
            const qGrade=s.quality_grade||"—";
            const gradeColor=qGrade==="A"?T.green:qGrade==="B"?T.gold:qGrade==="C"?T.amber:T.textDim;
            const scoreBarWidth=Math.max(5,Math.min(100,opp.score));
            const inActive=(state?.active_pipeline||[]).some(a=>a.candidate===opp.ticker);
            const isNew=(scanner?.new_since_last||[]).includes(opp.ticker);
            return(<div key={opp.ticker} style={{padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${inActive?T.green:isNew?T.gold:T.border}`,opacity:inActive?0.6:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,fontWeight:700,color:T.text}}>{opp.ticker}</span>
                  <span style={{padding:"2px 6px",background:gradeColor+"20",color:gradeColor,borderRadius:4,fontSize:10,fontWeight:700}}>Q{qGrade}</span>
                  <span style={{padding:"2px 6px",background:s.direction==="buy"?T.green+"20":T.red+"20",color:s.direction==="buy"?T.green:T.red,borderRadius:4,fontSize:9,fontWeight:700}}>{s.direction?.toUpperCase()||"—"}</span>
                  {s.mtf_aligned===true&&<span style={{padding:"2px 6px",background:T.green+"20",color:T.green,borderRadius:4,fontSize:9,fontWeight:700}} title="Multi-timeframe aligned — weekly trend agrees">🟢 MTF</span>}
                  {s.mtf_aligned===false&&<span style={{padding:"2px 6px",background:T.amber+"20",color:T.amber,borderRadius:4,fontSize:9,fontWeight:700}} title="Daily vs weekly trend disagree">⚠ MTF</span>}
                  {s.days_to_earnings!=null&&s.days_to_earnings<=14&&<span style={{padding:"2px 6px",background:T.amber+"20",color:T.amber,borderRadius:4,fontSize:9,fontWeight:700}} title="Earnings approaching">📢 EPS {s.days_to_earnings}d</span>}
                  {isNew&&<span style={{padding:"2px 6px",background:T.gold+"20",color:T.gold,borderRadius:4,fontSize:9,fontWeight:700}}>NEW</span>}
                  {s.sector_concentrated&&<span style={{padding:"2px 6px",background:T.amber+"20",color:T.amber,borderRadius:4,fontSize:9,fontWeight:700}}>⚠ CONC</span>}
                  {s.correlation?.warning&&<span style={{padding:"2px 6px",background:T.red+"20",color:T.red,borderRadius:4,fontSize:9,fontWeight:700}} title={s.correlation.warning}>🔗 {s.correlation.sector_count}x {s.correlation.sector}</span>}
                  {inActive&&<span style={{padding:"2px 6px",background:T.green+"20",color:T.green,borderRadius:4,fontSize:9,fontWeight:700}}>✓ ACTIVE</span>}
                </div>
                <div style={{textAlign:"right"}}>
                  <span style={{fontSize:12,color:gradeColor,fontWeight:700}}>{opp.score}/100</span>
                  <div style={{fontSize:9,color:T.textDim}}>R:R {s.rr}:1</div>
                </div>
              </div>
              <div style={{marginTop:4,height:3,background:T.cardHover,borderRadius:2,overflow:"hidden"}}>
                <div style={{width:`${scoreBarWidth}%`,height:"100%",background:gradeColor,borderRadius:2}}/>
              </div>

              {/* Thesis */}
              {s.thesis&&<div style={{fontSize:10,color:T.text,marginTop:6,padding:"4px 6px",background:T.cardHover,borderRadius:4,borderLeft:`2px solid ${gradeColor}`,lineHeight:1.4}}>💡 {s.thesis}</div>}

              {/* Trade setup grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2,marginTop:6,fontSize:10,fontFamily:T.mono}}>
                <div><span style={{color:T.textDim}}>Entry:</span> ${fmt(s.entry)}</div>
                <div><span style={{color:T.textDim}}>Live:</span> <span style={{color:opp.changePct>=0?T.green:T.red}}>${fmt(opp.price)} ({opp.changePct>=0?"+":""}{fmt(opp.changePct,1)}%)</span></div>
                <div><span style={{color:T.textDim}}>Stop:</span> <span style={{color:T.red}}>${fmt(s.stop)}</span></div>
                <div><span style={{color:T.textDim}}>T1:</span> <span style={{color:T.green}}>${fmt(s.t1)}</span></div>
                <div><span style={{color:T.textDim}}>Sector:</span> <span style={{color:T.textDim,fontSize:9}}>{s.sector||"—"}</span></div>
                <div><span style={{color:T.textDim}}>T2:</span> <span style={{color:T.green}}>${fmt(s.t2)}</span></div>
              </div>

              {/* Entry trigger */}
              {s.entry_trigger&&<div style={{fontSize:9,color:T.textDim,marginTop:4,fontStyle:"italic"}}>⚡ {s.entry_trigger}</div>}

              {/* Position sizing */}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6,padding:"4px 8px",background:T.cardHover,borderRadius:4,fontSize:10,fontFamily:T.mono}}>
                <span style={{color:T.textDim}}>Size:</span>
                <span style={{color:T.text,fontWeight:700}}>{s.suggested_units}u = £{fmt(s.position_value_gbp)}</span>
                <span style={{color:T.textDim}}>Risk:</span>
                <span style={{color:s.pct_nav_at_risk>1?T.red:T.green,fontWeight:700}}>£{fmt(s.risk_gbp)} ({fmt(s.pct_nav_at_risk,1)}% NAV)</span>
              </div>

              <div style={{display:"flex",gap:4,marginTop:8}}>
                <button onClick={()=>{setTab("chat");sendMessage(`Deep dive on ${opp.ticker}. Quality ${qGrade}, score ${opp.score}/100. Setup: ${s.direction?.toUpperCase()} entry $${s.entry} stop $${s.stop} T1 $${s.t1} T2 $${s.t2} R:R ${s.rr}:1. Position size: ${s.suggested_units}u = £${s.position_value_gbp} (£${s.risk_gbp} at risk, ${s.pct_nav_at_risk}% NAV). Sector: ${s.sector}${s.sector_concentrated?" [CONCENTRATED]":""}. Regime: ${scanner.regime}. Auto-thesis: ${s.thesis}. Give full analysis and verdict: PROMOTE to active pipeline or REJECT.`);}} style={{flex:2,padding:"6px 8px",background:T.cardHover,border:`1px solid ${T.gold}`,borderRadius:4,color:T.gold,fontSize:11,fontWeight:600,cursor:"pointer"}}>🧠 Deep Dive</button>
                <button onClick={async()=>{const r=await stateAction("promote_to_active",{candidate:opp.ticker,direction:s.direction,entry_price:s.entry,stop:s.stop,t1:s.t1,t2:s.t2,rr:s.rr,score:opp.score,grade:qGrade,sleeve:s.sector==="long_bonds"||s.sector==="gold"||s.sector==="utility_etf"?"Independent":"B",thesis:s.thesis,suggested_units:s.suggested_units,risk_gbp:s.risk_gbp,pct_nav_at_risk:s.pct_nav_at_risk,sector:s.sector,entry_trigger:s.entry_trigger,source:"apex_scan"});if(r?.ok){await loadState();}}} disabled={inActive} style={{flex:1,padding:"6px 8px",background:inActive?T.cardHover:T.green,color:inActive?T.textDim:"#000",fontWeight:700,border:"none",borderRadius:4,fontSize:11,cursor:inActive?"default":"pointer"}}>{inActive?"✓ In Active":"✅ Promote"}</button>
                <button onClick={async()=>{if(confirm(`Dismiss ${opp.ticker} for 15 min?\n\nWill reappear on next scan if setup still valid.`)){await stateAction("dismiss_suggestion",{ticker:opp.ticker});await loadScanner();}}} title="Hide until next scan" style={{padding:"6px 8px",background:T.cardHover,border:`1px solid ${T.border}`,borderRadius:4,color:T.red,fontSize:11,cursor:"pointer"}}>❌</button>
              </div>
            </div>);
          })}
        </div>)}

        {/* ═══ PERFORMANCE TAB ═══ */}
        {tab==="performance"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>Fund Performance</span>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>setShowDeposit(true)} style={{padding:"4px 10px",background:T.green,color:"#000",fontWeight:700,border:"none",borderRadius:6,fontSize:10,cursor:"pointer"}}>💷 Add Capital</button>
              <span style={{fontSize:9,color:T.textDim}}>Since 17 Mar 2026</span>
            </div>
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
            {social.length===0&&<div style={{color:T.textDim,fontSize:12,padding:20,textAlign:"center"}}>Loading social feed...<br/><span style={{fontSize:10}}>Reddit, StockTwits, Twitter intel</span></div>}
            {social.map((s,i)=>{
              const ageH=s.created?Math.floor((Date.now()-new Date(s.created).getTime())/3600000):null;
              const typeColor=s.type==="reddit"?T.amber:s.type==="stocktwits"?T.green:T.gold;
              return(<a key={i} href={s.url||"#"} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`,textDecoration:"none",overflow:"hidden",wordBreak:"break-word"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,fontSize:9}}>
                  <span style={{color:typeColor,fontWeight:700,letterSpacing:1}}>{s.source}</span>
                  <span style={{color:T.textDim}}>{ageH!=null?(ageH<1?"<1h":ageH<24?`${ageH}h`:`${Math.floor(ageH/24)}d`)+" ago":""}</span>
                </div>
                <div style={{fontSize:12,fontWeight:600,color:T.text,lineHeight:1.4,wordBreak:"break-word",overflowWrap:"break-word"}}>{s.title}</div>
                {s.text&&s.text.length>0&&<div style={{fontSize:10,color:T.textDim,marginTop:4,lineHeight:1.4,wordBreak:"break-word"}}>{s.text.slice(0,200)}{s.text.length>200?"…":""}</div>}
                {(s.score||s.likes||s.comments)&&<div style={{fontSize:9,color:T.textDim,marginTop:4}}>{s.score!=null?`⬆ ${s.score} `:""}{s.comments!=null?`💬 ${s.comments} `:""}{s.likes!=null?`♥ ${s.likes}`:""}</div>}
              </a>);
            })}
          </>)}
        </div>)}

        {/* ═══ HEALTH TAB ═══ */}
        {tab==="health"&&(<div style={{padding:"8px 12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:700,color:T.text}}>System Health</span>
            <button onClick={loadHealth} style={{padding:"4px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:6,color:T.textDim,fontSize:10,cursor:"pointer"}}><RefreshCw size={10}/> Refresh</button>
          </div>

          {health&&(<>
            {/* Top-level status cards */}
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[{l:"GREEN",v:health.green,c:T.green},{l:"AMBER",v:health.amber,c:T.amber},{l:"RED",v:health.red,c:T.red}].map((s,i)=>(<div key={i} style={{flex:1,padding:"8px",background:T.card,borderRadius:8,textAlign:"center",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:20,fontWeight:800,color:s.c,fontFamily:T.mono}}>{s.v}</div>
                <div style={{fontSize:9,color:T.textDim,letterSpacing:1}}>{s.l}</div>
              </div>))}
            </div>

            {/* Runtime telemetry */}
            <div style={{padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:8,border:`1px solid ${T.gold}`}}>
              <div style={{fontSize:10,color:T.gold,fontWeight:700,letterSpacing:1,marginBottom:6}}>⚡ RUNTIME</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11}}>
                <div><span style={{color:T.textDim}}>Memory:</span> <span style={{color:health.memory_mb>400?T.amber:T.green,fontFamily:T.mono,fontWeight:700}}>{health.memory_mb||0}MB</span></div>
                <div><span style={{color:T.textDim}}>Uptime:</span> <span style={{color:T.text,fontFamily:T.mono}}>{Math.floor((health.uptime_seconds||0)/3600)}h {Math.floor(((health.uptime_seconds||0)%3600)/60)}m</span></div>
                <div><span style={{color:T.textDim}}>Node:</span> <span style={{color:T.text,fontFamily:T.mono}}>{health.node_version}</span></div>
                <div><span style={{color:T.textDim}}>Checks:</span> <span style={{color:T.text,fontFamily:T.mono}}>{health.total}</span></div>
              </div>
            </div>

            {/* Scanner state */}
            {health.last_scan&&(<div style={{padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:8,border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{fontSize:10,color:T.gold,fontWeight:700,letterSpacing:1}}>🔍 SCANNER</div>
                <button onClick={async()=>{setScannerLoading(true);await loadScanner();await loadHealth();setScannerLoading(false);}} disabled={scannerLoading} style={{padding:"4px 10px",background:T.gold,color:"#000",fontWeight:700,border:"none",borderRadius:4,fontSize:9,cursor:scannerLoading?"wait":"pointer"}}>{scannerLoading?"⏳ Scanning":"▶ Run Now"}</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11}}>
                <div><span style={{color:T.textDim}}>Last run:</span> <span style={{color:T.text,fontFamily:T.mono}}>{health.last_scan.updated?Math.floor((Date.now()-new Date(health.last_scan.updated).getTime())/60000)+"min ago":"—"}</span></div>
                <div><span style={{color:T.textDim}}>Universe:</span> <span style={{color:T.text,fontFamily:T.mono}}>{health.last_scan.universe_size||"—"}</span></div>
                <div><span style={{color:T.textDim}}>Scanned:</span> <span style={{color:T.text,fontFamily:T.mono}}>{health.last_scan.scanned||0}</span></div>
                <div><span style={{color:T.textDim}}>Fetch errors:</span> <span style={{color:health.last_scan.fetch_errors>5?T.red:T.text,fontFamily:T.mono}}>{health.last_scan.fetch_errors||0}</span></div>
                <div><span style={{color:T.textDim}}>Valid setups:</span> <span style={{color:T.green,fontFamily:T.mono,fontWeight:700}}>{health.last_scan.passing_rr||0}</span></div>
                <div><span style={{color:T.textDim}}>Rejected R:R:</span> <span style={{color:T.red,fontFamily:T.mono}}>{health.last_scan.rejected_rr||0}</span></div>
                <div><span style={{color:T.textDim}}>Low conf.:</span> <span style={{color:T.amber,fontFamily:T.mono}}>{health.last_scan.rejected_confidence||0}</span></div>
                <div><span style={{color:T.textDim}}>Earnings block:</span> <span style={{color:T.textDim,fontFamily:T.mono}}>{health.last_scan.blocked_earnings||0}</span></div>
                <div><span style={{color:T.textDim}}>Dismissed:</span> <span style={{color:T.textDim,fontFamily:T.mono}}>{health.last_scan.dismissed_count||0}</span></div>
                <div><span style={{color:T.textDim}}>Self-heal:</span> <span style={{color:health.last_scan.healing_applied?T.amber:T.green,fontFamily:T.mono,fontSize:9}}>{health.last_scan.healing_applied?"ACTIVE":"clean"}</span></div>
              </div>
              {health.last_scan.healing_applied&&<div style={{fontSize:9,color:T.amber,marginTop:4,fontStyle:"italic"}}>⚠ {health.last_scan.healing_applied}</div>}
            </div>)}

            {/* Regime detection */}
            {health.regime_current&&(<div style={{padding:"10px 12px",background:T.card,borderRadius:8,marginBottom:8,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.gold,fontWeight:700,letterSpacing:1,marginBottom:6}}>🌐 REGIME</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11}}>
                <div><span style={{color:T.textDim}}>Current:</span> <span style={{color:T.gold,fontWeight:700}}>{health.regime_current.primary_code}</span></div>
                <div><span style={{color:T.textDim}}>Confidence:</span> <span style={{color:T.text,fontFamily:T.mono}}>{health.regime_current.confidence}%</span></div>
              </div>
            </div>)}

            {/* Grouped category checks */}
            {health.grouped&&Object.entries(health.grouped).map(([cat,items])=>{
              const allGreen=items.every(c=>c.status==="GREEN");
              const anyRed=items.some(c=>c.status==="RED");
              const catColor=anyRed?T.red:allGreen?T.green:T.amber;
              return(<div key={cat} style={{marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:catColor,letterSpacing:1,marginBottom:4,padding:"2px 4px"}}>
                  {anyRed?"🔴":allGreen?"✅":"🟡"} {cat} ({items.length})
                </div>
                {items.map((c,i)=>(<div key={i} style={{padding:"5px 10px",background:T.card,borderRadius:4,marginBottom:2,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",fontSize:10}}>
                  <span style={{color:T.text}}>{c.status==="GREEN"?"✅":c.status==="AMBER"?"🟡":"🔴"} {c.name.split(":")[1]||c.name}</span>
                  <span style={{color:T.textDim,fontFamily:T.mono,fontSize:9,textAlign:"right",maxWidth:"60%",wordBreak:"break-word"}}>{c.detail}</span>
                </div>))}
              </div>);
            })}

            <div style={{fontSize:8,color:T.textDim,textAlign:"center",marginTop:10,fontStyle:"italic"}}>Refreshed {new Date(health.timestamp).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/London"})} UK</div>
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

      {showDeposit&&<Modal title="💷 Add Capital to Fund" onClose={()=>{setShowDeposit(false);setDepositAmount("");}}>
        <div style={{padding:"10px",background:T.card,borderRadius:8,marginBottom:10,border:`1px solid ${T.border}`,fontSize:11}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{color:T.textDim}}>Current NAV:</span><span style={{color:T.text,fontFamily:T.mono,fontWeight:700}}>£{fmt(account.nav)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{color:T.textDim}}>Total deposited:</span><span style={{color:T.text,fontFamily:T.mono}}>£{fmt(account.total_deposited||0)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:T.textDim}}>Cash available:</span><span style={{color:T.text,fontFamily:T.mono}}>£{fmt(account.cash||0)}</span>
          </div>
        </div>

        <div style={{fontSize:10,color:T.textDim,marginBottom:4,letterSpacing:1}}>QUICK AMOUNTS</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,marginBottom:8}}>
          {[100,200,300,500].map(amt=>(
            <button key={amt} onClick={()=>setDepositAmount(String(amt))} style={{padding:"8px 4px",background:Number(depositAmount)===amt?T.green:T.card,color:Number(depositAmount)===amt?"#000":T.text,border:`1px solid ${Number(depositAmount)===amt?T.green:T.border}`,borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer"}}>
              £{amt}
            </button>
          ))}
        </div>

        <Inp p="Amount £" v={depositAmount} c={setDepositAmount} t="number" full/>

        {Number(depositAmount)>0&&<div style={{padding:"8px 10px",background:T.card,borderRadius:8,marginTop:8,marginBottom:8,border:`1px solid ${T.green}`,fontSize:11}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
            <span style={{color:T.textDim}}>New NAV:</span><span style={{color:T.green,fontFamily:T.mono,fontWeight:700}}>£{fmt(account.nav+Number(depositAmount))}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:T.textDim}}>New total deposited:</span><span style={{color:T.text,fontFamily:T.mono}}>£{fmt((account.total_deposited||0)+Number(depositAmount))}</span>
          </div>
        </div>}

        <Btn onClick={submitDeposit}>💷 Add £{depositAmount||"0"} to Fund</Btn>
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
