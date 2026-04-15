import { NextResponse } from "next/server";
import { WATCHLIST } from "../../data/algoConfig.js";
import { DEFAULT_STATE } from "../../data/fundState.js";
import {
  extractFeatures, LogisticRegression, backtest,
  factorDecomposition, monteCarloSimulation, fetchYahooHistory,
} from "../../lib/quantEngine.js";

export const maxDuration = 60;

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try { const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) return null; const d = await r.json(); let v = d.result; for (let i = 0; i < 3; i++) { if (typeof v === "string") { try { v = JSON.parse(v); } catch { break; } } else break; } return v; } catch { return null; }
}

function $(v, d = 2) { const n = Number(v); return isFinite(n) ? n.toFixed(d) : "—"; }

export async function POST(req) {
  const auth = req.headers.get("x-apex-key");
  if (auth !== process.env.APEX_ACCESS_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { action, ticker, hold_days } = body;

    switch (action) {
      // ═══ BACKTEST A SINGLE TICKER ═══
      case "backtest": {
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        const sym = WATCHLIST[ticker.toUpperCase()]?.yahoo || ticker;
        const history = await fetchYahooHistory(sym, "2y");
        if (!history?.closes?.length) return NextResponse.json({ error: `No data for ${ticker}` }, { status: 404 });

        const result = backtest(history.closes, hold_days || 5);
        const features = extractFeatures(history.closes, history.volumes);

        return NextResponse.json({ ticker: ticker.toUpperCase(), backtest: result, features, data_points: history.closes.length });
      }

      // ═══ BACKTEST UNIVERSE ═══
      case "backtest_universe": {
        const tickers = Object.keys(WATCHLIST).filter(t => !["BRENT", "WTI", "SPX", "VIX", "GBPUSD"].includes(t));
        const results = [];
        const hd = hold_days || 5;

        for (let i = 0; i < tickers.length; i += 3) {
          const batch = tickers.slice(i, i + 3);
          await Promise.all(batch.map(async (t) => {
            const sym = WATCHLIST[t]?.yahoo || t;
            const history = await fetchYahooHistory(sym, "1y");
            if (!history?.closes?.length) return;
            const bt = backtest(history.closes, hd);
            if (bt && bt.signal_trades > 5) {
              results.push({ ticker: t, ...bt });
            }
          }));
        }

        results.sort((a, b) => b.expectancy - a.expectancy);
        return NextResponse.json({
          hold_days: hd,
          tickers_tested: tickers.length,
          results_valid: results.length,
          top5: results.slice(0, 5),
          validated_signals: results.filter(r => r.win_rate > 55 && r.expectancy > 0.5),
          all: results,
        });
      }

      // ═══ TRAIN ML MODEL ═══
      case "train": {
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        const sym = WATCHLIST[ticker.toUpperCase()]?.yahoo || ticker;
        const history = await fetchYahooHistory(sym, "2y");
        if (!history?.closes?.length || history.closes.length < 60) {
          return NextResponse.json({ error: `Insufficient data for ${ticker}` }, { status: 400 });
        }

        const hd = hold_days || 5;
        const featureNames = ["return_1d", "return_5d", "rsi_14", "volatility_20d", "sma20_dist", "volume_ratio", "trend"];
        const X = [], y = [];

        for (let i = 30; i < history.closes.length - hd; i++) {
          const slice = history.closes.slice(0, i + 1);
          const volSlice = history.volumes?.slice(0, i + 1);
          const feat = extractFeatures(slice, volSlice);
          if (!feat) continue;

          const futureReturn = (history.closes[i + hd] - history.closes[i]) / history.closes[i];
          const label = futureReturn > 0 ? 1 : 0;

          X.push(featureNames.map(f => feat[f] || 0));
          y.push(label);
        }

        if (X.length < 30) return NextResponse.json({ error: "Not enough training samples" }, { status: 400 });

        const model = new LogisticRegression(featureNames);
        const cv = model.crossValidate(X, y, 5);
        model.train(X, y, 0.01, 100);

        // Get current prediction
        const currentFeatures = extractFeatures(history.closes, history.volumes);
        const currentX = featureNames.map(f => currentFeatures?.[f] || 0);
        const prediction = model.predictNormalised(currentX);

        return NextResponse.json({
          ticker: ticker.toUpperCase(),
          training_samples: X.length,
          cv_accuracy: cv.accuracy,
          cv_folds: cv.folds,
          hold_days: hd,
          current_prediction: parseFloat((prediction * 100).toFixed(1)),
          signal: prediction > 0.6 ? "BUY" : prediction < 0.4 ? "SELL" : "NEUTRAL",
          features: currentFeatures,
          weights: Object.fromEntries(featureNames.map((f, i) => [f, parseFloat(model.weights[i].toFixed(4))])),
        });
      }

      // ═══ PREDICT (using fresh features) ═══
      case "predict": {
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        const sym = WATCHLIST[ticker.toUpperCase()]?.yahoo || ticker;
        const history = await fetchYahooHistory(sym, "6mo");
        if (!history?.closes?.length) return NextResponse.json({ error: `No data for ${ticker}` }, { status: 404 });

        const features = extractFeatures(history.closes, history.volumes);
        return NextResponse.json({ ticker: ticker.toUpperCase(), features });
      }

      // ═══ FACTOR DECOMPOSITION ═══
      case "factors": {
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        const sym = WATCHLIST[ticker.toUpperCase()]?.yahoo || ticker;
        const [tickerHist, spxHist, oilHist] = await Promise.all([
          fetchYahooHistory(sym, "1y"),
          fetchYahooHistory("^GSPC", "1y"),
          fetchYahooHistory("BZ=F", "1y"),
        ]);

        if (!tickerHist?.closes?.length || !spxHist?.closes?.length) {
          return NextResponse.json({ error: "Insufficient data" }, { status: 400 });
        }

        // Calculate daily returns
        const toReturns = (c) => c.slice(1).map((v, i) => (v - c[i]) / c[i]);
        const tickerReturns = toReturns(tickerHist.closes);
        const marketReturns = toReturns(spxHist.closes);
        const oilReturns = oilHist?.closes ? toReturns(oilHist.closes) : null;

        const factors = factorDecomposition(tickerReturns, marketReturns, oilReturns);

        return NextResponse.json({ ticker: ticker.toUpperCase(), factors });
      }

      // ═══ MONTE CARLO ═══
      case "montecarlo": {
        const state = await kvGet("apex:state") || DEFAULT_STATE;
        const nav = Number(state.account?.nav) || 884;

        // Get portfolio daily returns from closed trades
        const closed = state.closed || [];
        const dailyReturns = [];

        // Approximate daily returns from trade history
        for (const trade of closed) {
          const entry = Number(trade.entry_price);
          const exit = Number(trade.exit_price);
          if (!entry || !exit) continue;
          const totalReturn = (exit - entry) / entry;
          const days = Math.max(1, Math.ceil((new Date(trade.exit_date) - new Date(trade.entry_date)) / 86400000));
          const dailyReturn = totalReturn / days;
          for (let d = 0; d < days; d++) dailyReturns.push(dailyReturn);
        }

        // If not enough trade data, use market proxy
        if (dailyReturns.length < 10) {
          const spx = await fetchYahooHistory("^GSPC", "6mo");
          if (spx?.closes?.length) {
            for (let i = 1; i < spx.closes.length; i++) {
              dailyReturns.push((spx.closes[i] - spx.closes[i - 1]) / spx.closes[i - 1]);
            }
          }
        }

        const mc = monteCarloSimulation(nav, dailyReturns, body.days || 30, body.simulations || 5000);

        return NextResponse.json({
          nav_current: nav,
          monte_carlo: mc,
          data_source: closed.length >= 10 ? "trade_history" : "market_proxy",
        });
      }

      // ═══ FULL REPORT ═══
      case "full_report": {
        if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
        const sym = WATCHLIST[ticker.toUpperCase()]?.yahoo || ticker;

        const [history, spxHist, oilHist] = await Promise.all([
          fetchYahooHistory(sym, "2y"),
          fetchYahooHistory("^GSPC", "1y"),
          fetchYahooHistory("BZ=F", "1y"),
        ]);

        if (!history?.closes?.length) return NextResponse.json({ error: `No data for ${ticker}` }, { status: 404 });

        const features = extractFeatures(history.closes, history.volumes);
        const bt = backtest(history.closes, hold_days || 5);

        const toReturns = (c) => c.slice(1).map((v, i) => (v - c[i]) / c[i]);
        const factors = spxHist?.closes
          ? factorDecomposition(toReturns(history.closes), toReturns(spxHist.closes), oilHist?.closes ? toReturns(oilHist.closes) : null)
          : null;

        return NextResponse.json({
          ticker: ticker.toUpperCase(),
          data_points: history.closes.length,
          features,
          backtest: bt,
          factors,
          timestamp: new Date().toISOString(),
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}. Valid: backtest, backtest_universe, train, predict, factors, montecarlo, full_report` }, { status: 400 });
    }
  } catch (err) {
    console.error("Quant error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
