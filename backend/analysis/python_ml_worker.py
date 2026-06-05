import json
import math
import statistics
import sys


def clamp(value, low, high):
    return max(low, min(high, value))


def safe_number(value, fallback=0.0):
    try:
        number = float(value)
        if math.isfinite(number):
            return number
    except (TypeError, ValueError):
        pass
    return fallback


def pct_change(current, previous):
    if not previous:
        return 0.0
    return ((current - previous) / previous) * 100.0


def sigmoid(value):
    return 1.0 / (1.0 + math.exp(-clamp(value, -20.0, 20.0)))


def ema(values, period):
    if not values:
        return 0.0
    alpha = 2.0 / (period + 1.0)
    result = values[0]
    for value in values[1:]:
        result = (value * alpha) + (result * (1.0 - alpha))
    return result


def rsi(closes, period=14):
    if len(closes) <= period:
        return 50.0
    gains = []
    losses = []
    for index in range(len(closes) - period, len(closes)):
        change = closes[index] - closes[index - 1]
        if change >= 0:
            gains.append(change)
        else:
            losses.append(abs(change))
    avg_gain = statistics.mean(gains) if gains else 0.0
    avg_loss = statistics.mean(losses) if losses else 0.0
    if avg_loss == 0:
        return 100.0 if avg_gain else 50.0
    return 100.0 - (100.0 / (1.0 + (avg_gain / avg_loss)))


def feature_pack(rows, end=None):
    view = rows[:end] if end else rows
    closes = [safe_number(row.get("close")) for row in view]
    highs = [safe_number(row.get("high")) for row in view]
    lows = [safe_number(row.get("low")) for row in view]
    volumes = [safe_number(row.get("volume")) for row in view]
    latest = closes[-1]
    previous = closes[-2] if len(closes) > 1 else latest
    three_ago = closes[-4] if len(closes) > 3 else previous
    five_ago = closes[-6] if len(closes) > 5 else previous
    ten_ago = closes[-11] if len(closes) > 10 else previous
    twenty_ago = closes[-21] if len(closes) > 20 else previous
    recent_returns = [pct_change(closes[i], closes[i - 1]) for i in range(max(1, len(closes) - 30), len(closes))]
    volatility = statistics.pstdev(recent_returns) if len(recent_returns) > 1 else 0.0
    short_volatility = statistics.pstdev(recent_returns[-8:]) if len(recent_returns) > 8 else volatility
    volume_base = statistics.mean(volumes[-21:-1]) if len(volumes) > 21 else statistics.mean(volumes) if volumes else 1.0
    volume_ratio = volumes[-1] / volume_base if volume_base else 1.0
    high_low_range = ((highs[-1] - lows[-1]) / latest) * 100.0 if latest else 0.0
    range_high = max(highs[-30:]) if len(highs) >= 30 else max(highs)
    range_low = min(lows[-30:]) if len(lows) >= 30 else min(lows)
    range_position = ((latest - range_low) / (range_high - range_low)) if range_high != range_low else 0.5
    ema_fast = ema(closes[-40:], 8)
    ema_mid = ema(closes[-70:], 21)
    ema_slow = ema(closes[-120:], 50)
    regime_trend = pct_change(ema_mid, ema_slow)

    return {
        "latest": latest,
        "one_day": pct_change(latest, previous),
        "three_day": pct_change(latest, three_ago),
        "five_day": pct_change(latest, five_ago),
        "ten_day": pct_change(latest, ten_ago),
        "twenty_day": pct_change(latest, twenty_ago),
        "ema_fast": ema_fast,
        "ema_mid": ema_mid,
        "ema_slow": ema_slow,
        "regime_trend": regime_trend,
        "rsi": rsi(closes),
        "volatility": volatility,
        "short_volatility": short_volatility,
        "volume_ratio": volume_ratio,
        "range": high_low_range,
        "range_position": range_position,
        "closes": closes,
        "returns": recent_returns,
    }


def probability_from_score(score):
    return clamp(score * 100.0, 1.0, 99.0)


def direction_from_score(score, probabilities):
    agreement = directional_agreement(probabilities)
    if score >= 57 and agreement["direction"] == "BULLISH" and agreement["count"] >= 4:
        return "BUY"
    if score <= 43 and agreement["direction"] == "BEARISH" and agreement["count"] >= 4:
        return "SELL"
    return "HOLD"


def regime_name(features):
    if features["short_volatility"] >= max(1.8, features["volatility"] * 1.35):
        return "volatile"
    if abs(features["regime_trend"]) >= 1.2:
        return "trend"
    return "sideways"


def model_probabilities(features):
    trend = pct_change(features["ema_fast"], features["ema_mid"])
    long_trend = features["regime_trend"]
    regime = regime_name(features)
    momentum = features["three_day"] * 0.35 + features["five_day"] * 0.32 + features["ten_day"] * 0.18
    rsi_bias = (features["rsi"] - 50.0) / 18.0
    mean_reversion_bias = (0.5 - features["range_position"]) * 1.15
    volume_bias = math.log(max(features["volume_ratio"], 0.1)) * 0.35
    volatility_penalty = max(0.0, features["volatility"] - 2.5) * 0.10
    returns = features["returns"]
    last_return = returns[-1] if returns else 0.0
    mean_return = statistics.mean(returns[-10:]) if returns else 0.0

    if regime == "sideways":
        momentum *= 0.65
        rsi_bias = (rsi_bias * 0.35) + mean_reversion_bias
    elif regime == "volatile":
        momentum *= 0.75
        volatility_penalty *= 1.6
    else:
        momentum += long_trend * 0.35

    xgboost = sigmoid((momentum * 0.26) + (rsi_bias * 0.45) + volume_bias - volatility_penalty)
    lightgbm = sigmoid((trend * 0.30) + (long_trend * 0.22) + (features["one_day"] * 0.10) + (rsi_bias * 0.36) + (features["range"] * 0.02))
    lstm = sigmoid((ema(returns[-20:], 5) * 0.58) + (mean_return * 0.34) + (trend * 0.14) - (features["short_volatility"] * 0.025))
    gru = sigmoid((last_return * 0.22) + (ema(returns[-14:], 4) * 0.68) + (volume_bias * 0.30) - (features["short_volatility"] * 0.018))
    prophet = sigmoid((features["twenty_day"] * 0.10) + (long_trend * 0.42) + (mean_return * 0.45) - (features["volatility"] * 0.045))
    arima = sigmoid((last_return * 0.16) + (mean_return * 0.78) + (features["three_day"] * 0.08) - (features["volatility"] * 0.04))

    return [
        {"name": "XGBoost gradient tree worker", "probability": probability_from_score(xgboost)},
        {"name": "LightGBM leaf-wise tree worker", "probability": probability_from_score(lightgbm)},
        {"name": "LSTM sequence worker", "probability": probability_from_score(lstm)},
        {"name": "GRU sequence worker", "probability": probability_from_score(gru)},
        {"name": "Prophet trend worker", "probability": probability_from_score(prophet)},
        {"name": "ARIMA return worker", "probability": probability_from_score(arima)},
    ]


def weighted_average(probabilities, weights):
    total_weight = 0.0
    weighted_sum = 0.0
    for item in probabilities:
        weight = weights.get(item["name"], 1.0)
        total_weight += weight
        weighted_sum += item["probability"] * weight
    return weighted_sum / total_weight if total_weight else statistics.mean(item["probability"] for item in probabilities)


def level_one_feature_vector(rows, end=None):
    features = feature_pack(rows, end)
    probabilities = model_probabilities(features)
    average = statistics.mean(item["probability"] for item in probabilities)
    agreement = directional_agreement(probabilities)
    bullish_count = sum(1 for item in probabilities if item["probability"] >= 55)
    bearish_count = sum(1 for item in probabilities if item["probability"] <= 45)
    model_spread = max(item["probability"] for item in probabilities) - min(item["probability"] for item in probabilities)
    direction = direction_from_score(average, probabilities)

    return {
        "direction": direction,
        "features": [
            average / 100.0,
            abs(average - 50.0) / 50.0,
            agreement["count"] / max(len(probabilities), 1),
            bullish_count / max(len(probabilities), 1),
            bearish_count / max(len(probabilities), 1),
            model_spread / 100.0,
            features["rsi"] / 100.0,
            clamp(features["volume_ratio"], 0.0, 5.0) / 5.0,
            clamp(features["volatility"], 0.0, 8.0) / 8.0,
            clamp(features["short_volatility"], 0.0, 8.0) / 8.0,
            features["range_position"],
            clamp(features["regime_trend"], -8.0, 8.0) / 8.0,
            1.0 if regime_name(features) == "trend" else 0.0,
            1.0 if regime_name(features) == "volatile" else 0.0,
        ],
    }


def build_level_one_samples(rows):
    samples = []
    for end in range(70, len(rows) - 3):
        item = level_one_feature_vector(rows, end)
        if item["direction"] not in ("BUY", "SELL"):
            continue

        current = safe_number(rows[end - 1].get("close"))
        future = safe_number(rows[end + 2].get("close"))
        if not current or not future:
            continue

        success = future > current if item["direction"] == "BUY" else future < current
        samples.append({"features": item["features"], "label": 1 if success else 0})

    return samples


def train_logistic_filter(samples, feature_count):
    weights = [0.0] * (feature_count + 1)
    rate = 0.06
    for _epoch in range(180):
        for sample in samples:
            values = [1.0] + sample["features"]
            prediction = sigmoid(sum(weight * value for weight, value in zip(weights, values)))
            error = sample["label"] - prediction
            for index, value in enumerate(values):
                weights[index] += rate * error * value
    return weights


def predict_logistic_filter(weights, features):
    return sigmoid(sum(weight * value for weight, value in zip(weights, [1.0] + features)))


def xgboost_filter_probability(samples, features):
    if len(samples) < 18 or len({sample["label"] for sample in samples}) < 2:
        raise RuntimeError("Not enough mixed pass/fail examples for XGBoost false-signal training.")

    from xgboost import XGBClassifier

    model = XGBClassifier(
        n_estimators=45,
        max_depth=2,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=1,
        random_state=7,
    )
    model.fit([sample["features"] for sample in samples], [sample["label"] for sample in samples])
    return float(model.predict_proba([features])[0][1])


def validate_level_one_filter(rows):
    checks = []
    if len(rows) < 110:
        return {"samples": 0, "accuracy": 0}

    for end in range(92, len(rows) - 3, 5):
        train_rows = rows[:end]
        train_samples = build_level_one_samples(train_rows)
        item = level_one_feature_vector(rows, end)
        if item["direction"] not in ("BUY", "SELL") or len(train_samples) < 14 or len({sample["label"] for sample in train_samples}) < 2:
            continue

        current = safe_number(rows[end - 1].get("close"))
        future = safe_number(rows[end + 2].get("close"))
        actual = future > current if item["direction"] == "BUY" else future < current
        weights = train_logistic_filter(train_samples, len(item["features"]))
        probability = predict_logistic_filter(weights, item["features"])
        checks.append(1 if (probability >= 0.54) == actual else 0)

    return {
        "samples": len(checks),
        "accuracy": round((sum(checks) / len(checks)) * 100.0) if checks else 0,
    }


def level_one_false_signal_filter(rows, score, direction):
    action = "BUY" if direction == "BULLISH" else "SELL" if direction == "BEARISH" else "HOLD"
    validation_result = validate_level_one_filter(rows)
    if action == "HOLD":
        return {
            "level": 1,
            "name": "XGBoost false-signal filter",
            "status": "PASS",
            "passes": True,
            "probability": 50,
            "model": "not-needed",
            "validation": validation_result,
            "reason": "No directional ML signal needed filtering."
        }

    latest = level_one_feature_vector(rows)
    samples = build_level_one_samples(rows)
    warnings = []
    model_name = "XGBoost false-signal filter"
    try:
        probability = xgboost_filter_probability(samples, latest["features"])
    except Exception as error:
        warnings.append(f"XGBoost filter unavailable: {error}")
        if len(samples) >= 14 and len({sample["label"] for sample in samples}) >= 2:
            weights = train_logistic_filter(samples, len(latest["features"]))
            probability = predict_logistic_filter(weights, latest["features"])
            model_name = "Logistic false-signal fallback"
        else:
            probability = 0.58 if abs(score - 50) >= 14 else 0.52
            model_name = "Rule-based false-signal fallback"

    probability_score = round(probability * 100.0)
    if probability_score < 52:
        status = "BLOCK"
        passes = False
        reason = f"Level 1 estimates only {probability_score}% odds that this {action} signal follows through."
    elif probability_score < 62:
        status = "CAUTION"
        passes = True
        reason = f"Level 1 allows the signal but marks follow-through odds as modest at {probability_score}%."
    else:
        status = "PASS"
        passes = True
        reason = f"Level 1 confirms the {action} signal with {probability_score}% estimated follow-through odds."

    return {
        "level": 1,
        "name": "XGBoost false-signal filter",
        "status": status,
        "passes": passes,
        "probability": probability_score,
        "model": model_name,
        "sampleCount": len(samples),
        "validation": validation_result,
        "warnings": warnings,
        "reason": reason
    }


def directional_agreement(probabilities):
    bullish = sum(1 for item in probabilities if item["probability"] >= 55)
    bearish = sum(1 for item in probabilities if item["probability"] <= 45)
    if bullish >= bearish:
        return {"direction": "BULLISH", "count": bullish}
    return {"direction": "BEARISH", "count": bearish}


def validation(rows):
    ensemble_checks = []
    selective_checks = []
    brier_values = []
    model_checks = {}
    if len(rows) < 90:
        return {"samples": 0, "accuracy": 0, "selectiveSamples": 0, "selectiveAccuracy": 0, "brierScore": 0.25, "modelAccuracy": {}, "modelWeights": {}}

    for end in range(70, len(rows) - 3, 5):
        features = feature_pack(rows, end)
        probabilities = model_probabilities(features)
        average = statistics.mean(item["probability"] for item in probabilities)
        current = safe_number(rows[end - 1].get("close"))
        future = safe_number(rows[end + 2].get("close"))
        actual = 1 if future >= current else 0
        predicted = 1 if average >= 50 else 0
        correct = 1 if actual == predicted else 0
        ensemble_checks.append(correct)
        brier_values.append(((average / 100.0) - actual) ** 2)
        if abs(average - 50) >= 6:
            selective_checks.append(correct)
        for item in probabilities:
            model_checks.setdefault(item["name"], []).append(1 if (item["probability"] >= 50) == bool(actual) else 0)

    model_accuracy = {
        name: round((sum(values) / len(values)) * 100.0) if values else 0
        for name, values in model_checks.items()
    }
    model_weights = {
        name: clamp(0.6 + max(0.0, accuracy - 50.0) / 18.0, 0.6, 2.8)
        for name, accuracy in model_accuracy.items()
    }

    return {
        "samples": len(ensemble_checks),
        "accuracy": round((sum(ensemble_checks) / len(ensemble_checks)) * 100.0) if ensemble_checks else 0,
        "selectiveSamples": len(selective_checks),
        "selectiveAccuracy": round((sum(selective_checks) / len(selective_checks)) * 100.0) if selective_checks else 0,
        "brierScore": round(statistics.mean(brier_values), 4) if brier_values else 0.25,
        "modelAccuracy": model_accuracy,
        "modelWeights": model_weights,
    }


def analyze(rows):
    clean_rows = [row for row in rows if safe_number(row.get("close")) > 0]
    if len(clean_rows) < 70:
        return {
            "score": 50,
            "direction": "NEUTRAL",
            "confidence": 30,
            "models": [],
            "validation": {"samples": 0, "accuracy": 0},
            "warnings": ["Not enough historical rows for the Python ML worker."],
            "engine": "python-ml-worker",
        }

    features = feature_pack(clean_rows)
    check = validation(clean_rows)
    probabilities = model_probabilities(features)
    score = weighted_average(probabilities, check.get("modelWeights", {}))
    edge = abs(score - 50.0) * 2.0
    agreement = directional_agreement(probabilities)
    validation_accuracy = max(check.get("accuracy", 0), check.get("selectiveAccuracy", 0))
    confidence = clamp(
        28.0 + (edge * 0.42) + (max(0, validation_accuracy - 50) * 0.38) + agreement["count"] * 2.5,
        30.0,
        92.0,
    )
    if check.get("selectiveSamples", 0) < 8:
        confidence = min(confidence, 68.0)
    if score >= 57 and agreement["direction"] == "BULLISH" and agreement["count"] >= 4:
        direction = "BULLISH"
    elif score <= 43 and agreement["direction"] == "BEARISH" and agreement["count"] >= 4:
        direction = "BEARISH"
    else:
        direction = "NEUTRAL"
    level_one_filter = level_one_false_signal_filter(clean_rows, score, direction)
    warnings = [] if validation_accuracy >= 55 else ["Walk-forward accuracy is weak; this ML score should be treated as low-confidence."]
    warnings.extend(level_one_filter.get("warnings", []))

    return {
        "score": round(score),
        "direction": direction,
        "confidence": round(confidence),
        "models": [{"name": item["name"], "probability": round(item["probability"])} for item in probabilities],
        "level1Filter": level_one_filter,
        "validation": check,
        "warnings": warnings,
        "engine": "python-ml-worker",
        "regime": regime_name(features),
        "agreement": agreement,
        "note": "Python worker combines market models, then applies a Level 1 false-signal filter using XGBoost when available.",
    }


def main():
    payload = json.load(sys.stdin)
    print(json.dumps(analyze(payload.get("data", []))))


if __name__ == "__main__":
    main()
