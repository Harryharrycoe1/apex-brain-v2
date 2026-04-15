// APEX BRAIN V2 — QUANT ENGINE
// Features extraction, ML (Logistic Regression), backtester, factors, Monte Carlo

// ═══ FEATURE EXTRACTION FROM OHLCV ═══
export function extractFeatures(closes, volumes) {
  if (!closes?.length || closes.length < 20) return null;
  const n = closes.length;
  const c = closes;

  // Returns
  const returns = [];
  for (let i = 1; i < n; i++) returns.push((c[i] - c[i - 1]) / c[i - 1]);

  // SMA
  const sma = (arr, period) => {
    if (arr.length < period) return null;
    return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  };

  // RSI (14-period)
  const rsi = () => {
    const gains = [], losses = [];
    for (let i = Math.max(0, returns.length - 14); i < returns.length; i++) {
      if (returns[i] > 0) { gains.push(returns[i]); losses.push(0); }
      else { gains.push(0); losses.push(Math.abs(returns[i])); }
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  };

  // Volatility (20-day)
  const vol20 = () => {
    const r = returns.slice(-20);
    if (r.length < 10) return 0;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
    return Math.sqrt(variance) * Math.sqrt(252); // Annualised
  };

  // ATR proxy (using closes only)
  const atr = () => {
    const ranges = [];
    for (let i = Math.max(1, n - 14); i < n; i++) {
      ranges.push(Math.abs(c[i] - c[i - 1]));
    }
    return ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
  };

  // Volume ratio
  const volRatio = volumes?.length >= 20
    ? (volumes.slice(-5).reduce((a, b) => a + b, 0) / 5) / (volumes.slice(-20).reduce((a, b) => a + b, 0) / 20)
    : 1;

  const lastPrice = c[n - 1];
  const sma5 = sma(c, 5);
  const sma20 = sma(c, 20);
  const sma50 = sma(c, Math.min(50, n));

  return {
    price: lastPrice,
    return_1d: returns[returns.length - 1] || 0,
    return_5d: c.length >= 5 ? (c[n - 1] - c[n - 5]) / c[n - 5] : 0,
    return_20d: c.length >= 20 ? (c[n - 1] - c[n - 20]) / c[n - 20] : 0,
    rsi_14: rsi(),
    volatility_20d: vol20(),
    atr_14: atr(),
    sma5_dist: sma5 ? (lastPrice - sma5) / sma5 * 100 : 0,
    sma20_dist: sma20 ? (lastPrice - sma20) / sma20 * 100 : 0,
    sma50_dist: sma50 ? (lastPrice - sma50) / sma50 * 100 : 0,
    above_sma20: sma20 ? (lastPrice > sma20 ? 1 : 0) : 0,
    above_sma50: sma50 ? (lastPrice > sma50 ? 1 : 0) : 0,
    volume_ratio: parseFloat(volRatio.toFixed(2)),
    trend: sma5 && sma20 ? (sma5 > sma20 ? 1 : -1) : 0,
  };
}

// ═══ LOGISTIC REGRESSION ═══
export class LogisticRegression {
  constructor(featureNames) {
    this.featureNames = featureNames;
    this.weights = new Array(featureNames.length).fill(0);
    this.bias = 0;
    this.trained = false;
  }

  sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z)))); }

  predict(features) {
    let z = this.bias;
    for (let i = 0; i < this.weights.length; i++) {
      z += this.weights[i] * (features[i] || 0);
    }
    return this.sigmoid(z);
  }

  train(X, y, lr = 0.01, epochs = 100) {
    const n = X.length;
    if (n === 0) return;

    // Normalise features
    this.means = new Array(this.weights.length).fill(0);
    this.stds = new Array(this.weights.length).fill(1);
    for (let j = 0; j < this.weights.length; j++) {
      const col = X.map(row => row[j] || 0);
      this.means[j] = col.reduce((a, b) => a + b, 0) / n;
      const variance = col.reduce((a, b) => a + (b - this.means[j]) ** 2, 0) / n;
      this.stds[j] = Math.sqrt(variance) || 1;
    }

    const Xn = X.map(row => row.map((v, j) => (v - this.means[j]) / this.stds[j]));

    for (let e = 0; e < epochs; e++) {
      for (let i = 0; i < n; i++) {
        const pred = this.predict(Xn[i]);
        const error = pred - y[i];
        this.bias -= lr * error;
        for (let j = 0; j < this.weights.length; j++) {
          this.weights[j] -= lr * error * (Xn[i][j] || 0);
        }
      }
    }
    this.trained = true;
  }

  predictNormalised(features) {
    if (!this.trained || !this.means) return 0.5;
    const norm = features.map((v, j) => ((v || 0) - this.means[j]) / this.stds[j]);
    return this.predict(norm);
  }

  crossValidate(X, y, folds = 5) {
    const n = X.length;
    if (n < folds * 2) return { accuracy: 0, auc: 0 };
    const foldSize = Math.floor(n / folds);
    let correct = 0, total = 0;

    for (let f = 0; f < folds; f++) {
      const testStart = f * foldSize;
      const testEnd = testStart + foldSize;
      const Xtrain = [...X.slice(0, testStart), ...X.slice(testEnd)];
      const ytrain = [...y.slice(0, testStart), ...y.slice(testEnd)];
      const Xtest = X.slice(testStart, testEnd);
      const ytest = y.slice(testStart, testEnd);

      const model = new LogisticRegression(this.featureNames);
      model.train(Xtrain, ytrain, 0.01, 50);

      for (let i = 0; i < Xtest.length; i++) {
        const pred = model.predictNormalised(Xtest[i]) > 0.5 ? 1 : 0;
        if (pred === ytest[i]) correct++;
        total++;
      }
    }

    return { accuracy: parseFloat((correct / total * 100).toFixed(1)), folds };
  }
}

// ═══ BACKTESTER ═══
export function backtest(closes, holdDays = 5, signalFn = null) {
  if (!closes?.length || closes.length < holdDays + 20) return null;

  const trades = [];
  const step = Math.max(1, Math.floor(holdDays / 2));

  for (let i = 20; i < closes.length - holdDays; i += step) {
    const entry = closes[i];
    const exit = closes[i + holdDays];
    if (!entry || !exit) continue;

    const returnPct = ((exit - entry) / entry) * 100;
    const win = returnPct > 0;

    // Simple momentum signal: buy if 5d return > 0
    const signal = closes[i] > closes[Math.max(0, i - 5)] ? 1 : 0;

    trades.push({
      entry_idx: i, entry_price: entry, exit_price: exit,
      return_pct: parseFloat(returnPct.toFixed(2)),
      win, signal, hold_days: holdDays,
    });
  }

  if (!trades.length) return null;

  const signalTrades = trades.filter(t => t.signal === 1);
  const wins = signalTrades.filter(t => t.win);
  const losses = signalTrades.filter(t => !t.win);

  return {
    total_trades: trades.length,
    signal_trades: signalTrades.length,
    win_rate: signalTrades.length ? parseFloat((wins.length / signalTrades.length * 100).toFixed(1)) : 0,
    avg_win: wins.length ? parseFloat((wins.reduce((a, t) => a + t.return_pct, 0) / wins.length).toFixed(2)) : 0,
    avg_loss: losses.length ? parseFloat((losses.reduce((a, t) => a + t.return_pct, 0) / losses.length).toFixed(2)) : 0,
    expectancy: signalTrades.length ? parseFloat((signalTrades.reduce((a, t) => a + t.return_pct, 0) / signalTrades.length).toFixed(2)) : 0,
    max_drawdown: calculateMaxDrawdown(signalTrades.map(t => t.return_pct)),
    hold_days: holdDays,
  };
}

function calculateMaxDrawdown(returns) {
  let peak = 0, maxDD = 0, cumulative = 0;
  for (const r of returns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }
  return parseFloat(maxDD.toFixed(2));
}

// ═══ FACTOR DECOMPOSITION ═══
export function factorDecomposition(tickerReturns, marketReturns, oilReturns) {
  if (!tickerReturns?.length || tickerReturns.length < 10) return null;
  const n = Math.min(tickerReturns.length, marketReturns?.length || 0, oilReturns?.length || Infinity);
  if (n < 10) return null;

  const tr = tickerReturns.slice(-n);
  const mr = (marketReturns || []).slice(-n);
  const or = (oilReturns || []).slice(-n);

  // Simple OLS for market beta
  const marketBeta = linearRegression(mr, tr);

  // Oil beta (if available)
  const oilBeta = or.length >= n ? linearRegression(or, tr) : null;

  // Alpha = mean(ticker) - beta * mean(market)
  const meanTicker = tr.reduce((a, b) => a + b, 0) / n;
  const meanMarket = mr.reduce((a, b) => a + b, 0) / n;
  const alpha = (meanTicker - marketBeta.slope * meanMarket) * 252; // Annualised

  return {
    market_beta: parseFloat(marketBeta.slope.toFixed(3)),
    oil_beta: oilBeta ? parseFloat(oilBeta.slope.toFixed(3)) : null,
    alpha_annual: parseFloat(alpha.toFixed(2)),
    r_squared: parseFloat(marketBeta.rSquared.toFixed(3)),
  };
}

function linearRegression(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i]; sumX2 += x[i] ** 2; sumY2 += y[i] ** 2;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2 || 1);
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = y.reduce((a, yi, i) => a + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const meanY = sumY / n;
  const ssTot = y.reduce((a, yi) => a + (yi - meanY) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, rSquared };
}

// ═══ MONTE CARLO (Student-t fat tails) ═══
export function monteCarloSimulation(currentValue, dailyReturns, days = 30, simulations = 5000) {
  if (!dailyReturns?.length || dailyReturns.length < 10) return null;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
  const std = Math.sqrt(variance);

  // Student-t with df=5 for fat tails
  const df = 5;
  const studentT = () => {
    // Box-Muller for normal, then scale for Student-t
    const u1 = Math.random(), u2 = Math.random();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // Chi-squared approximation for df=5
    let chi2 = 0;
    for (let i = 0; i < df; i++) {
      const n = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
      chi2 += n * n;
    }
    return normal / Math.sqrt(chi2 / df);
  };

  const finalValues = [];
  for (let s = 0; s < simulations; s++) {
    let value = currentValue;
    for (let d = 0; d < days; d++) {
      const shock = mean + std * studentT();
      value *= (1 + shock);
    }
    finalValues.push(value);
  }

  finalValues.sort((a, b) => a - b);
  const percentile = (p) => finalValues[Math.floor(p / 100 * finalValues.length)] || currentValue;

  return {
    current: currentValue,
    days,
    simulations,
    distribution: "Student-t (df=5)",
    var_95: parseFloat((currentValue - percentile(5)).toFixed(2)),
    var_99: parseFloat((currentValue - percentile(1)).toFixed(2)),
    median: parseFloat(percentile(50).toFixed(2)),
    p5: parseFloat(percentile(5).toFixed(2)),
    p25: parseFloat(percentile(25).toFixed(2)),
    p75: parseFloat(percentile(75).toFixed(2)),
    p95: parseFloat(percentile(95).toFixed(2)),
    expected: parseFloat((finalValues.reduce((a, b) => a + b, 0) / simulations).toFixed(2)),
    prob_loss: parseFloat((finalValues.filter(v => v < currentValue).length / simulations * 100).toFixed(1)),
  };
}

// ═══ FETCH YAHOO HISTORY ═══
export async function fetchYahooHistory(symbol, range = "1y") {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
    const volumes = result.indicators?.quote?.[0]?.volume?.filter(v => v != null) || [];
    return { closes, volumes, symbol };
  } catch { return null; }
}
