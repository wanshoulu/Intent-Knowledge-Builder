'use strict';

function addFailure(failures, stage, message) {
  failures.push({ stage, message });
}

function evaluateRecognitionExpectation(expected = {}, actual = {}) {
  const failures = [];

  if (
    expected.expectedDecision &&
    actual.decision !== expected.expectedDecision
  ) {
    addFailure(
      failures,
      'threshold',
      `Expected decision ${expected.expectedDecision}, received ${actual.decision ?? 'none'}`
    );
  }

  if (
    expected.expectedKnowledgePointId &&
    actual.knowledgePointId !== expected.expectedKnowledgePointId
  ) {
    addFailure(
      failures,
      'threshold',
      `Expected knowledge point ${expected.expectedKnowledgePointId}, received ${actual.knowledgePointId ?? 'none'}`
    );
  }

  if (
    expected.expectedAnswerContains &&
    !String(actual.answer ?? '').includes(expected.expectedAnswerContains)
  ) {
    addFailure(
      failures,
      'answer',
      `Answer does not contain ${expected.expectedAnswerContains}`
    );
  }

  for (const [name, value] of Object.entries(
    expected.expectedSlotValues ?? {}
  )) {
    if (actual.extractedSlots?.[name] !== value) {
      addFailure(
        failures,
        'slot',
        `Expected slot ${name}=${value}, received ${actual.extractedSlots?.[name] ?? 'missing'}`
      );
    }
  }

  for (const actionId of expected.expectedActionIds ?? []) {
    if (!actual.actionIds?.includes(actionId)) {
      addFailure(
        failures,
        'action',
        `Expected action ${actionId} was not resolved`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failedStage: failures[0]?.stage ?? null,
    failureReasons: failures.map((failure) => failure.message)
  };
}

module.exports = {
  evaluateRecognitionExpectation
};
