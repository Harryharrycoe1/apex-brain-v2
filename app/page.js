"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, RefreshCw, Plus, X, TrendingUp, TrendingDown, Search, LogOut, ArrowUpDown } from "lucide-react";

const T = {
  bg: "#0a0a0f", card: "#12121a", cardHover: "#1a1a2e", border: "#1e1e2e",
  gold: "#d4a843", goldDim: "#b8942e", green: "#10b981", red: "#ef4444",
  amber: "#f59e0b", text: "#e2e8f0", textDim: "#64748b", mono: "'JetBrains Mono', monospace",
  sans: "'DM Sans', sans-serif",
};

function fmt(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "—"; }
function plPerUnit(entry, current, dir) { return (dir === "short" || dir === "sell") ? entry - current : current - entry; }

export default function ApexBrain() {
  const [accessKey, setAccessKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState(null);
  const [prices, setPrices] = useState({});
  const [priceTime, setPriceTime] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const chatEnd = useRef(null);
  const inputRef = useRef(null);

  // ═══ AUTH ═══
  useEffect(() => {
    const k = typeof window !== "undefined" && localStorage.getItem("apex_key");
    if (k) { setAccessKey(k); setAuthed(true); }
  }, []);
  const login = () => { if (accessKey.trim()) { localStorage.setItem("apex_key", accessKey.trim()); setAuthed(true); } };
  const logout = () => { localStorage.removeItem("apex_key"); setAuthed(false); setAccessKey(""); setMessages([]); };

  // ═══ LOAD STATE ═══
  const loadState = useCallback(async () => {
    if (!accessKey) return;
    try {
      const r = await fetch("/api/state", { headers: { "x-apex-key": accessKey } });
      if (r.ok) { const d = await r.json(); if (d.state) setState(d.state); }
    } catch {}
  }, [accessKey]);

  // ═══ LOAD PRICES ═══
  const loadPrices = useCallback(async () => {
    if (!accessKey) return;
    try {
      const r = await fetch("/api/prices", { headers: { "x-apex-key": accessKey } });
      if (r.ok) {
        const d = await r.json();
        setPrices(d.prices || {});
        setPriceTime(d.uk_time || "");
      }
    } catch {}
  }, [accessKey]);

  useEffect(() => { if (authed) { loadState(); loadPrices(); } }, [authed, loadState, loadPrices]);

  // Auto-refresh prices every 60s
  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(loadPrices, 60000);
    return () => clearInterval(iv);
  }, [authed, loadPrices]);

  // Background survival — reload on visibility change
  useEffect(() => {
    const handler = () => { if (document.visibilityState === "visible" && authed) { loadState(); loadPrices(); } };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [authed, loadState, loadPrices]);

  // Auto-scroll
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ═══ SEND MESSAGE ═══
  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-apex-key": accessKey },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: msg }].map(m => ({ role: m.role, content: m.content })),
          client_state: state,
          client_prices: prices,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMessages(prev => [...prev, {
        role: "assistant", content: d.content,
        pathway: d.pathway, urgency: d.urgency, compliance: d.compliance, cost: d.cost,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `❌ ${err.message}` }]);
    }
    setLoading(false);
  };

  // ═══ POSITION ACTIONS (inject into chat) ═══
  const stateAction = async (action, body) => {
    try {
      const r = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-apex-key": accessKey },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await r.json();
      if (d.error) { setMessages(prev => [...prev, { role: "user", content: `❌ ${d.error}` }]); return d; }
      await loadState();
      return d;
    } catch (err) {
      setMessages(prev => [...prev, { role: "user", content: `❌ ${err.message}` }]);
      return null;
    }
  };

  // ═══ ADD POSITION ═══
  const [addForm, setAddForm] = useState({ ticker: "", units: "", entry: "", stop: "", t1: "", sleeve: "B", direction: "buy", thesis: "" });
  const addPosition = async () => {
    const d = await stateAction("add_position", {
      ticker: addForm.ticker, units: addForm.units, entry_price: addForm.entry,
      stop: addForm.stop || null, t1: addForm.t1 || null, sleeve: addForm.sleeve,
      direction: addForm.direction, thesis: addForm.thesis,
    });
    if (d?.ok) {
      const dir = addForm.direction.toUpperCase();
      setMessages(prev => [...prev, { role: "user", content: `[POSITION OPENED] ${addForm.ticker} ${dir} ${addForm.units}u @ $${addForm.entry} | Sleeve ${addForm.sleeve} | Stop: $${addForm.stop || "none"} | T1: $${addForm.t1 || "none"} | Thesis: ${addForm.thesis || "none"}` }]);
      setShowAdd(false);
      setAddForm({ ticker: "", units: "", entry: "", stop: "", t1: "", sleeve: "B", direction: "buy", thesis: "" });
    }
  };

  // ═══ T212 SYNC ═══
  const [syncForm, setSyncForm] = useState({ nav: "", cash: "", margin: "", health: "" });
  const [showSync, setShowSync] = useState(false);
  const doSync = async () => {
    await stateAction("sync_account", {
      nav: syncForm.nav || undefined, cash: syncForm.cash || undefined,
      margin: syncForm.margin || undefined, health: syncForm.health || undefined,
    });
    setMessages(prev => [...prev, { role: "user", content: `[T212 SYNC] NAV: £${syncForm.nav} | Cash: £${syncForm.cash} | Margin: £${syncForm.margin} | Health: ${syncForm.health}%` }]);
    setShowSync(false);
    setSyncForm({ nav: "", cash: "", margin: "", health: "" });
  };

  // ═══ AUTH SCREEN ═══
  if (!authed) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, fontFamily: T.sans }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: T.gold, marginBottom: 8 }}>🧠 APEX</div>
      <div style={{ fontSize: 12, color: T.textDim, marginBottom: 24, letterSpacing: 2 }}>NEURAL INTELLIGENCE SYSTEM V2</div>
      <input placeholder="Access Key" type="password" value={accessKey} onChange={e => setAccessKey(e.target.value)} onKeyDown={e => e.key === "Enter" && login()}
        style={{ width: 260, padding: "12px 16px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 14, fontFamily: T.mono, outline: "none", textAlign: "center" }} />
      <button onClick={login} style={{ marginTop: 12, padding: "10px 40px", background: T.gold, color: "#000", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>ENTER</button>
    </div>
  );

  // ═══ COMPUTE P&L ═══
  const positions = state?.positions || [];
  const account = state?.account || {};
  const gbpUsd = Number(account.gbp_usd) || 1.34;
  let totalOpenPL = 0;
  const positionsWithPL = positions.map(pos => {
    const lp = prices[pos.id]?.price;
    const dir = (pos.direction || "buy").toLowerCase();
    let plGbp = 0, plPct = 0, stopDist = null, t1Dist = null;
    if (lp != null) {
      const pl = plPerUnit(pos.entry_price, lp, dir) * pos.units;
      plGbp = pos.currency === "GBP" ? pl : pl / gbpUsd;
      plPct = ((lp - pos.entry_price) / pos.entry_price) * 100;
      totalOpenPL += plGbp;
    }
    if (pos.stop && lp) stopDist = Math.abs((lp - pos.stop) / lp * 100);
    if (pos.t1 && lp) t1Dist = Math.abs((pos.t1 - lp) / lp * 100);
    return { ...pos, livePrice: lp, plGbp, plPct, stopDist, t1Dist };
  });

  const staleness = state?.account?.last_updated ? Math.floor((Date.now() - new Date(state.account.last_updated).getTime()) / 3600000) : null;

  // ═══ MAIN UI ═══
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, fontFamily: T.sans, overflow: "hidden" }}>
      {/* ── HEADER ── */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>🧠 APEX</span>
          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 1.5 }}>V2</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowSync(true)} title="T212 Sync" style={{ ...btnSmall, background: T.card }}>$</button>
          <button onClick={loadPrices} title="Refresh prices" style={{ ...btnSmall, background: T.card }}><RefreshCw size={14} /></button>
          <button onClick={() => sendMessage("Give me my morning brief")} title="Morning Brief" style={{ ...btnSmall, background: T.card }}><Search size={14} /></button>
          <button onClick={logout} title="Logout" style={{ ...btnSmall, background: T.card }}><LogOut size={14} /></button>
        </div>
      </div>

      {/* ── DASHBOARD BAR ── */}
      <div style={{ display: "flex", padding: "6px 12px", gap: 8, borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: "auto" }}>
        {[
          { label: "NAV", value: `£${fmt(account.nav, 0)}`, color: T.text },
          { label: "CASH", value: `£${fmt(account.cash, 0)}`, color: T.green },
          { label: "P&L", value: `${totalOpenPL >= 0 ? "+" : ""}£${fmt(totalOpenPL)}`, color: totalOpenPL >= 0 ? T.green : T.red },
          { label: "HEALTH", value: `${account.margin_health_pct || "—"}%`, color: (account.margin_health_pct || 100) > 50 ? T.green : T.red },
        ].map((d, i) => (
          <div key={i} style={{ textAlign: "center", minWidth: 65 }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1 }}>{d.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: d.color, fontFamily: T.mono }}>{d.value}</div>
          </div>
        ))}
      </div>

      {/* ── STALENESS WARNING ── */}
      {staleness > 4 && (
        <div onClick={() => setShowSync(true)} style={{ padding: "4px 12px", background: "#3b1515", color: T.red, fontSize: 11, cursor: "pointer", textAlign: "center" }}>
          ⚠️ DATA {staleness}h OLD — Tap to sync from T212
        </div>
      )}

      {/* ── POSITIONS ACCORDION ── */}
      <div style={{ borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div onClick={() => setPosOpen(!posOpen)} style={{ padding: "6px 12px", display: "flex", justifyContent: "space-between", cursor: "pointer", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: T.textDim }}>{positions.length} POSITIONS • P&L {totalOpenPL >= 0 ? "+" : ""}£{fmt(totalOpenPL)}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={e => { e.stopPropagation(); setShowAdd(true); }} style={{ ...btnSmall, background: T.gold, color: "#000", width: 28, height: 28 }}><Plus size={14} /></button>
            <ArrowUpDown size={14} color={T.textDim} />
          </div>
        </div>
        {posOpen && (
          <div style={{ maxHeight: 200, overflowY: "auto", padding: "0 12px 8px" }}>
            {positionsWithPL.map((pos, i) => {
              const up = pos.plGbp >= 0;
              const dir = (pos.direction || "buy").toUpperCase();
              return (
                <div key={i} style={{ padding: "6px 8px", background: T.card, borderRadius: 8, marginBottom: 4, border: `1px solid ${pos.stopDist != null && pos.stopDist < 5 ? T.red : T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span style={{ color: T.text }}>{pos.id} <span style={{ color: T.textDim, fontSize: 10 }}>[{pos.sleeve}/{dir}]</span></span>
                    <span style={{ color: T.text, fontFamily: T.mono }}>{pos.livePrice != null ? `$${fmt(pos.livePrice)}` : "—"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 11, fontFamily: T.mono }}>
                    <span style={{ color: up ? T.green : T.red, fontWeight: 700 }}>{up ? "+" : ""}£{fmt(pos.plGbp)} ({up ? "+" : ""}{fmt(pos.plPct, 1)}%)</span>
                    <span style={{ color: pos.stopDist != null && pos.stopDist < 5 ? T.red : T.textDim }}>Stop {pos.stopDist != null ? fmt(pos.stopDist, 1) : "—"}%</span>
                  </div>
                </div>
              );
            })}
            {positions.length === 0 && <div style={{ color: T.textDim, fontSize: 12, padding: 8 }}>No open positions</div>}
          </div>
        )}
      </div>

      {/* ── CHAT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 60, color: T.textDim }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧠</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>APEX BRAIN V2</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Ask for a morning brief, trade proposal, or position review</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 16 }}>
              {["Morning brief", "How are my positions?", "Weekly review", "What's the macro outlook?"].map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)} style={{ padding: "6px 12px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, color: T.textDim, fontSize: 11, cursor: "pointer" }}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%", padding: "10px 14px", borderRadius: 12,
              background: m.role === "user" ? T.cardHover : T.card,
              border: `1px solid ${m.compliance === "VIOLATION" ? T.red : m.urgency === "CRITICAL" ? T.amber : T.border}`,
              color: T.text, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {m.role === "assistant" && m.pathway && m.pathway !== "fast_path" && (
                <div style={{ fontSize: 9, color: T.gold, letterSpacing: 2, marginBottom: 4, fontWeight: 700 }}>🧠 {m.pathway.toUpperCase().replace(/_/g, " ")} ⏱</div>
              )}
              {renderMarkdown(m.content)}
              {m.cost && <div style={{ fontSize: 9, color: T.textDim, marginTop: 4, textAlign: "right" }}>{m.cost.calls} call{m.cost.calls > 1 ? "s" : ""} • ~${fmt(m.cost.est_usd, 3)}</div>}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: 12, justifyContent: "flex-start" }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: T.gold, animation: `pulse 1.4s ${i * 0.2}s infinite ease-in-out` }} />)}
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      {/* ── INPUT ── */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message APEX..." disabled={loading}
            style={{ flex: 1, padding: "10px 14px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 24, color: T.text, fontSize: 14, fontFamily: T.sans, outline: "none" }} />
          <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
            style={{ width: 44, height: 44, borderRadius: "50%", background: loading || !input.trim() ? T.card : T.gold, border: "none", cursor: loading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Send size={18} color={loading || !input.trim() ? T.textDim : "#000"} />
          </button>
        </div>
      </div>

      {/* ── ADD POSITION MODAL ── */}
      {showAdd && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: T.gold }}>Add Position</span>
              <X size={18} color={T.textDim} style={{ cursor: "pointer" }} onClick={() => setShowAdd(false)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input placeholder="Ticker (e.g. NVDA)" value={addForm.ticker} onChange={e => setAddForm(p => ({ ...p, ticker: e.target.value.toUpperCase() }))} style={inputStyle} />
              <input placeholder="Units" type="number" value={addForm.units} onChange={e => setAddForm(p => ({ ...p, units: e.target.value }))} style={inputStyle} />
              <input placeholder="Entry $" type="number" value={addForm.entry} onChange={e => setAddForm(p => ({ ...p, entry: e.target.value }))} style={inputStyle} />
              <input placeholder="Stop $" type="number" value={addForm.stop} onChange={e => setAddForm(p => ({ ...p, stop: e.target.value }))} style={inputStyle} />
              <input placeholder="T1 $" type="number" value={addForm.t1} onChange={e => setAddForm(p => ({ ...p, t1: e.target.value }))} style={inputStyle} />
              <select value={addForm.sleeve} onChange={e => setAddForm(p => ({ ...p, sleeve: e.target.value }))} style={inputStyle}>
                <option value="A">Sleeve A</option><option value="B">Sleeve B</option><option value="C">Sleeve C</option><option value="Independent">Independent</option>
              </select>
              <select value={addForm.direction} onChange={e => setAddForm(p => ({ ...p, direction: e.target.value }))} style={inputStyle}>
                <option value="buy">LONG</option><option value="short">SHORT</option>
              </select>
            </div>
            <input placeholder="Thesis (one sentence)" value={addForm.thesis} onChange={e => setAddForm(p => ({ ...p, thesis: e.target.value }))} style={{ ...inputStyle, width: "100%", marginTop: 8 }} />
            <button onClick={addPosition} style={{ width: "100%", marginTop: 12, padding: 10, background: T.gold, color: "#000", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer" }}>Open Position</button>
          </div>
        </div>
      )}

      {/* ── T212 SYNC MODAL ── */}
      {showSync && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: T.gold }}>T212 Sync</span>
              <X size={18} color={T.textDim} style={{ cursor: "pointer" }} onClick={() => setShowSync(false)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input placeholder="NAV £" type="number" value={syncForm.nav} onChange={e => setSyncForm(p => ({ ...p, nav: e.target.value }))} style={inputStyle} />
              <input placeholder="Cash £" type="number" value={syncForm.cash} onChange={e => setSyncForm(p => ({ ...p, cash: e.target.value }))} style={inputStyle} />
              <input placeholder="Margin £" type="number" value={syncForm.margin} onChange={e => setSyncForm(p => ({ ...p, margin: e.target.value }))} style={inputStyle} />
              <input placeholder="Health %" type="number" value={syncForm.health} onChange={e => setSyncForm(p => ({ ...p, health: e.target.value }))} style={inputStyle} />
            </div>
            <button onClick={doSync} style={{ width: "100%", marginTop: 12, padding: 10, background: T.gold, color: "#000", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer" }}>Sync</button>
          </div>
        </div>
      )}

      {/* ── PRICE TICKER ── */}
      {priceTime && (
        <div style={{ padding: "3px 12px", borderTop: `1px solid ${T.border}`, fontSize: 9, color: T.textDim, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
          <span>Prices: {priceTime} UK • {Object.keys(prices).length} tickers</span>
          <span>Realised: +£{fmt(account.total_realised_pl)}</span>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

// ═══ STYLES ═══
const btnSmall = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.textDim };
const inputStyle = { padding: "8px 10px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none" };
const modalOverlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modalBox = { background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 12, padding: 20, width: "90%", maxWidth: 400 };

// ═══ MARKDOWN RENDERER ═══
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Headers
    if (line.startsWith("### ")) return <div key={i} style={{ fontSize: 13, fontWeight: 700, color: "#d4a843", marginTop: 8, marginBottom: 4 }}>{line.slice(4)}</div>;
    if (line.startsWith("## ")) return <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#d4a843", marginTop: 10, marginBottom: 4 }}>{line.slice(3)}</div>;
    if (line.startsWith("# ")) return <div key={i} style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginTop: 12, marginBottom: 6 }}>{line.slice(2)}</div>;
    // Horizontal rule
    if (line.match(/^---+$/)) return <hr key={i} style={{ border: "none", borderTop: "1px solid #1e1e2e", margin: "8px 0" }} />;
    // Bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={j} style={{ color: "#e2e8f0" }}>{p.slice(2, -2)}</strong>;
      return p;
    });
    // Bullets
    if (line.match(/^[\s]*[-•]\s/)) return <div key={i} style={{ paddingLeft: 12, position: "relative" }}><span style={{ position: "absolute", left: 0 }}>•</span>{rendered}</div>;
    // Numbered
    if (line.match(/^[\s]*\d+\.\s/)) return <div key={i} style={{ paddingLeft: 16 }}>{rendered}</div>;
    // Empty
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    return <div key={i}>{rendered}</div>;
  });
}
