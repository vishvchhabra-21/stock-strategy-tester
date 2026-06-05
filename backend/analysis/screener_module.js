function rankCandidate(candidate) {
  const ai = candidate.aiAnalysis;
  if (!ai) return candidate;

  return {
    ...candidate,
    aiScore: ai.signal.combinedScore,
    score: Math.round((candidate.score || 0) * 0.45 + ai.signal.combinedScore * 0.55),
    technicalScore: ai.technical.score,
    fundamentalScore: ai.fundamental.score,
    mlScore: ai.ml.score,
    sentimentScore: ai.sentiment.score
  };
}

function rankScreenerResults(candidates = []) {
  return candidates
    .map(rankCandidate)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

module.exports = {
  rankScreenerResults
};
