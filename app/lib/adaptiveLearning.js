// APEX BRAIN V4.1 — ADAPTIVE LEARNING LOOP
// Closed-trade outcomes feed back into scanner signal weights via Bayesian updating
// Produces calibrated probabilities (Brier score) that improve with every trade

// ═══ DEFAULT WEIGHTS (used when no learning data exists) ═══
export const DEFAULT_SIGNAL_WEIGHTS = {
  momentum: 1.0,
  volume_breakout: 1.0,
  pead: 1.0,
  relative_strength: 1.0,
  vol_compression: 1.0,
  pattern_bullish: 1.0,
  regime_fit: 1.0,
  oversold_rsi: 1.0,
  trend_following: 1.0,
  earnings_proximity: 1.0,
};

// ═══ INITIALIZE LEARNING STATE ═══
export function initLearningState() {
  return {
    weights: { ...DEFAULT_SIGNAL_WEIGHTS },
    signal_history: {}, // { signal_name: [{ predicted: 0.7, actual: 1, ticker, date }] }
    outcomes: [],       // [{ ticker, signals_at_entry, predicted_prob, actual_outcome, return_pct, date }]
    brier_score: null,  // Lower = better calibration
    accuracy: null,     // Win rate
    sample_size: 0,
    last_updated: null,
  };
}

// ═══ RECORD TRADE OUTCOME ═══
// Called when a trade closes - feeds outcome back into weights
export function recordOutcome(learningState, trade, signalsAtEntry) {
  if (!learningState) learningState = initLearningState();
  if (!signalsAtEntry || !trade) return learningState;

  const entry = Number(trade.entry_price);
  const exit = Number(trade.exit_price);
  if (!entry || !exit) return learningState;

  const dir = (trade.direction || "buy").toLowerCase();
  const returnPct = dir === "short"
    ? ((entry - exit) / entry) * 100
    : ((exit - entry) / entry) * 100;
  const won = returnPct > 0;
  const actualOutcome = won ? 1 : 0;

  // Calculate predicted probability (composite of signals)
  const predictedProb = calculatePredictedProb(signalsAtEntry, learningState.weights);

  // Brier score contribution
  const brierContribution = (predictedProb - actualOutcome) ** 2;

  // Record outcome
  const outcome = {
    ticker: trade.id,
    signals_at_entry: signalsAtEntry,
    predicted_prob: parseFloat(predictedProb.toFixed(3)),
    actual_outcome: actualOutcome,
    return_pct: parseFloat(returnPct.toFixed(2)),
    brier: parseFloat(brierContribution.toFixed(4)),
    date: new Date().toISOString(),
  };

  learningState.outcomes = learningState.outcomes || [];
  learningState.outcomes.push(outcome);

  // Keep last 200 outcomes (sliding window)
  if (learningState.outcomes.length > 200) {
    learningState.outcomes = learningState.outcomes.slice(-200);
  }

  // Update per-signal history
  for (const [signal, value] of Object.entries(signalsAtEntry)) {
    if (!value || value === 0) continue;
    if (!learningState.signal_history[signal]) learningState.signal_history[signal] = [];
    learningState.signal_history[signal].push({
      strength: value,
      outcome: actualOutcome,
      return: returnPct,
      date: new Date().toISOString(),
    });
    // Keep last 100 per signal
    if (learningState.signal_history[signal].length > 100) {
      learningState.signal_history[signal] = learningState.signal_history[signal].slice(-100);
    }
  }

  // Recalibrate weights based on signal hit rates
  learningState.weights = recalibrateWeights(learningState.signal_history, learningState.weights);

  // Update aggregate metrics
  learningState.sample_size = learningState.outcomes.length;
  learningState.brier_score = calculateBrierScore(learningState.outcomes);
  learningState.accuracy = calculateAccuracy(learningState.outcomes);
  learningState.last_updated = new Date().toISOString();

  return learningState;
}

// ═══ CALCULATE PREDICTED PROBABILITY ═══
function calculatePredictedProb(signals, weights) {
  let logOdds = 0; // Start at 50/50
  let signalCount = 0;

  for (const [signal, value] of Object.entries(signals)) {
    if (!value || value === 0) continue;
    const weight = weights[signal] || 1.0;
    const contribution = value * weight * 0.5; // Each signal contributes max ~0.5 logOdds
    logOdds += contribution;
    signalCount++;
  }

  // Convert log-odds to probability via sigmoid
  const prob = 1 / (1 + Math.exp(-logOdds));
  return Math.max(0.05, Math.min(0.95, prob)); // Clamp to avoid extreme predictions
}

// ═══ RECALIBRATE WEIGHTS ═══
// Signals that historically predicted wins get amplified, losers get muted
function recalibrateWeights(signalHistory, currentWeights) {
  const newWeights = { ...currentWeights };
  const learningRate = 0.1; // How fast weights adapt (0.1 = gentle)
  const minSamples = 5;     // Need at least 5 samples to start adapting

  for (const [signal, history] of Object.entries(signalHistory)) {
    if (history.length < minSamples) continue;

    // Recent hit rate (last 30 occurrences)
    const recent = history.slice(-30);
    const hitRate = recent.filter(h => h.outcome === 1).length / recent.length;

    // Average return when signal fired
    const avgReturn = recent.reduce((a, h) => a + h.return, 0) / recent.length;

    // Target weight: signals with >55% hit rate AND positive avg return get boosted
    let targetWeight = 1.0;
    if (hitRate > 0.6 && avgReturn > 1) targetWeight = 1.5;
    else if (hitRate > 0.55 && avgReturn > 0) targetWeight = 1.2;
    else if (hitRate < 0.45 || avgReturn < -1) targetWeight = 0.7;
    else if (hitRate < 0.4 || avgReturn < -2) targetWeight = 0.4;

    // Move current weight toward target (gentle learning)
    const current = newWeights[signal] || 1.0;
    newWeights[signal] = current + learningRate * (targetWeight - current);
    newWeights[signal] = Math.max(0.2, Math.min(2.0, newWeights[signal])); // Clamp 0.2-2.0
    newWeights[signal] = parseFloat(newWeights[signal].toFixed(3));
  }

  return newWeights;
}

// ═══ BRIER SCORE (calibration metric) ═══
// Lower = better calibrated. 0.25 = random guessing. 0.0 = perfect.
function calculateBrierScore(outcomes) {
  if (!outcomes?.length) return null;
  const sum = outcomes.reduce((a, o) => a + o.brier, 0);
  return parseFloat((sum / outcomes.length).toFixed(4));
}

function calculateAccuracy(outcomes) {
  if (!outcomes?.length) return null;
  const wins = outcomes.filter(o => o.actual_outcome === 1).length;
  return parseFloat((wins / outcomes.length * 100).toFixed(1));
}

// ═══ APPLY LEARNED WEIGHTS TO NEW SIGNAL ═══
export function scoreWithLearning(signals, learningState) {
  const weights = learningState?.weights || DEFAULT_SIGNAL_WEIGHTS;
  const prob = calculatePredictedProb(signals, weights);
  const sampleSize = learningState?.sample_size || 0;

  // Confidence depends on sample size
  const confidence = sampleSize >= 30 ? "HIGH"
                  : sampleSize >= 10 ? "MEDIUM"
                  : "LOW (insufficient data)";

  return {
    probability: parseFloat((prob * 100).toFixed(1)),
    confidence,
    weights_applied: weights,
    sample_size: sampleSize,
    calibration: learningState?.brier_score
      ? `Brier: ${learningState.brier_score} (${learningState.brier_score < 0.2 ? "well-calibrated" : learningState.brier_score < 0.25 ? "decent" : "uncalibrated"})`
      : "No calibration yet",
  };
}

// ═══ GET LEARNING SUMMARY ═══
export function getLearningSummary(learningState) {
  if (!learningState || !learningState.sample_size) {
    return { status: "untrained", message: "No closed trades recorded yet" };
  }

  const weights = learningState.weights || {};
  const sortedWeights = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return {
    status: "active",
    sample_size: learningState.sample_size,
    accuracy: learningState.accuracy,
    brier_score: learningState.brier_score,
    calibration_quality: learningState.brier_score < 0.2 ? "EXCELLENT" : learningState.brier_score < 0.25 ? "GOOD" : "NEEDS MORE DATA",
    top_signals: sortedWeights.slice(0, 3).map(([s, w]) => ({ signal: s, weight: w })),
    weakest_signals: sortedWeights.slice(-3).map(([s, w]) => ({ signal: s, weight: w })),
    last_updated: learningState.last_updated,
  };
}
