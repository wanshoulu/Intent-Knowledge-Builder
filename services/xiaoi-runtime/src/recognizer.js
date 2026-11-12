const {
  diceSimilarity,
  normalizeText,
  recognizeKnowledge
} = require('../../../packages/xiaoi-core');

function textScore(query, candidate) {
  const left = normalizeText(query);
  const right = normalizeText(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  return diceSimilarity(left, right);
}

function recognizeSnapshot(release, { query, channel, category, dimensions, context }) {
  if (!release?.snapshot) throw new Error('A release snapshot is required');

  const result = recognizeKnowledge(release.snapshot, {
    query,
    channel,
    category,
    dimensions,
    context,
    scope: 'published'
  });

  const candidates = result.trace.modules
    .flatMap((module) => module.candidates ?? [])
    .map((candidate) => ({
      knowledgeItemId: candidate.knowledgePointId,
      name: candidate.knowledgePointName,
      score: candidate.score,
      excluded: candidate.blockedByNegativeTemplate
    }));

  return {
    releaseId: release.id,
    releaseVersion: release.version,
    decision: result.decision,
    knowledgeItemId: result.knowledgePointId,
    answer: result.answer,
    actionIds: result.actionIds,
    actionInvocations: result.actionInvocations,
    extractedSlots: result.extractedSlots,
    missingSlots: result.missingSlots,
    score: result.score,
    candidates,
    suggestions: result.suggestions,
    trace: result.trace,
    normalizedText: result.normalizedText,
    tokens: result.tokens,
    diagnostics: result.diagnostics
  };
}

module.exports = {
  normalizeText,
  recognizeSnapshot,
  textScore
};
