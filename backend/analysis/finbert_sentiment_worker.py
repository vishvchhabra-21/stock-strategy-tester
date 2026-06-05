import json
import math
import re
import sys


MODEL_NAME = "ProsusAI/finbert"
POSITIVE_HINTS = {
    "upgrade", "beats", "beat", "growth", "profit", "surge", "rally", "order",
    "expansion", "record", "strong", "buy", "outperform", "raises", "guidance",
    "margin", "contract", "approval", "dividend", "cashflow", "earnings"
}
NEGATIVE_HINTS = {
    "downgrade", "loss", "fraud", "probe", "fall", "decline", "weak", "sell",
    "default", "debt", "fire", "resigns", "miss", "cuts", "lawsuit", "warning",
    "recall", "layoff", "bankruptcy", "penalty", "slump"
}


def clean_text(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:512]


def direction_from_score(score):
    if score >= 58:
        return "BULLISH"
    if score <= 42:
        return "BEARISH"
    return "NEUTRAL"


def softmax(values):
    peak = max(values)
    exps = [math.exp(value - peak) for value in values]
    total = sum(exps) or 1.0
    return [value / total for value in exps]


def fallback_label(text):
    lower = text.lower()
    positive = sum(1 for word in POSITIVE_HINTS if word in lower)
    negative = sum(1 for word in NEGATIVE_HINTS if word in lower)
    if positive > negative:
        return {"label": "positive", "score": min(0.95, 0.56 + positive * 0.08)}
    if negative > positive:
        return {"label": "negative", "score": min(0.95, 0.58 + negative * 0.08)}
    return {"label": "neutral", "score": 0.62}


def load_finbert():
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    import torch

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    model.eval()
    return tokenizer, model, torch


def classify_with_finbert(items):
    tokenizer, model, torch = load_finbert()
    labels = [model.config.id2label[index].lower() for index in range(model.config.num_labels)]
    texts = [item["text"] for item in items]
    encoded = tokenizer(texts, padding=True, truncation=True, max_length=128, return_tensors="pt")
    with torch.no_grad():
        logits = model(**encoded).logits.detach().cpu().tolist()

    outputs = []
    for row in logits:
        probabilities = softmax(row)
        best_index = max(range(len(probabilities)), key=lambda index: probabilities[index])
        outputs.append({
            "label": labels[best_index],
            "score": probabilities[best_index],
            "scores": {
                labels[index]: probabilities[index]
                for index in range(len(probabilities))
            }
        })
    return outputs


def score_items(classifications):
    weighted = 0.0
    total_weight = 0.0
    flags = []

    for index, item in enumerate(classifications):
        label = item["label"].lower()
        confidence = float(item.get("score") or 0.5)
        recency_weight = max(0.55, 1.0 - index * 0.07)
        total_weight += recency_weight

        if label == "positive":
            value = 50.0 + confidence * 42.0
        elif label == "negative":
            value = 50.0 - confidence * 46.0
            flags.append(f"Negative FinBERT context: {item['title']}")
        else:
            value = 50.0

        weighted += value * recency_weight

    return max(0.0, min(100.0, weighted / total_weight if total_weight else 50.0)), flags


def analyze(news):
    rows = []
    for item in news[:8]:
        title = clean_text(item.get("title"))
        summary = clean_text(item.get("summary") or item.get("description"))
        text = clean_text(f"{title}. {summary}" if summary else title)
        if text:
            rows.append({
                "title": title,
                "publisher": item.get("publisher") or "",
                "link": item.get("link") or "",
                "providerPublishTime": item.get("providerPublishTime"),
                "text": text,
            })

    if not rows:
        return {
            "score": 50,
            "contextScore": 50,
            "direction": "NEUTRAL",
            "flags": [],
            "headlines": [],
            "model": "ProsusAI/finbert",
            "level": 3,
            "warnings": ["No recent news was available for FinBERT context."]
        }

    warnings = []
    try:
        classifications = classify_with_finbert(rows)
        model_name = "ProsusAI/finbert"
    except Exception as error:
        classifications = [fallback_label(row["text"]) for row in rows]
        model_name = "finance-lexicon-fallback"
        warnings.append(f"FinBERT model unavailable: {error}")

    enriched = []
    for row, classification in zip(rows, classifications):
        enriched.append({
            "title": row["title"],
            "publisher": row["publisher"],
            "link": row["link"],
            "providerPublishTime": row["providerPublishTime"],
            "finbertLabel": classification["label"].upper(),
            "finbertConfidence": round(float(classification.get("score") or 0) * 100),
            "scores": classification.get("scores")
        })

    score, flags = score_items([
        {**classification, "title": row["title"]}
        for row, classification in zip(rows, classifications)
    ])
    rounded_score = round(score)

    return {
        "score": rounded_score,
        "contextScore": rounded_score,
        "direction": direction_from_score(rounded_score),
        "flags": flags[:3],
        "headlines": enriched[:5],
        "model": model_name,
        "level": 3,
        "warnings": warnings,
        "note": "Level 3 context uses FinBERT financial-news sentiment when the transformers model is available."
    }


def main():
    payload = json.load(sys.stdin)
    print(json.dumps(analyze(payload.get("news", []))))


if __name__ == "__main__":
    main()
