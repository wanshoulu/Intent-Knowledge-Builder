const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateRecognitionExpectation
} = require('../../../packages/xiaoi-core');

const actual = {
  decision: 'matched',
  knowledgePointId: 'ki-branch-appointment',
  answer: 'Appointment is ready.',
  extractedSlots: {
    appointment_time: 'tomorrow afternoon'
  },
  actionIds: ['action-open-appointment']
};

test('compares all configured recognition expectations', () => {
  const result = evaluateRecognitionExpectation({
    expectedDecision: 'matched',
    expectedKnowledgePointId: 'ki-branch-appointment',
    expectedAnswerContains: 'ready',
    expectedSlotValues: {
      appointment_time: 'tomorrow afternoon'
    },
    expectedActionIds: ['action-open-appointment']
  }, actual);

  assert.deepEqual(result, {
    passed: true,
    failedStage: null,
    failureReasons: []
  });
});

test('classifies a decision or target mismatch as a threshold failure', () => {
  const result = evaluateRecognitionExpectation({
    expectedDecision: 'clarification',
    expectedKnowledgePointId: 'ki-other'
  }, actual);

  assert.equal(result.passed, false);
  assert.equal(result.failedStage, 'threshold');
  assert.deepEqual(result.failureReasons, [
    'Expected decision clarification, received matched',
    'Expected knowledge point ki-other, received ki-branch-appointment'
  ]);
});

test('classifies answer, slot and action mismatches in execution order', () => {
  const result = evaluateRecognitionExpectation({
    expectedDecision: 'matched',
    expectedAnswerContains: 'cancelled',
    expectedSlotValues: {
      appointment_time: 'next week'
    },
    expectedActionIds: ['action-cancel-appointment']
  }, actual);

  assert.equal(result.passed, false);
  assert.equal(result.failedStage, 'answer');
  assert.deepEqual(result.failureReasons, [
    'Answer does not contain cancelled',
    'Expected slot appointment_time=next week, received tomorrow afternoon',
    'Expected action action-cancel-appointment was not resolved'
  ]);
});

test('supports a rejected expectation without a target', () => {
  const result = evaluateRecognitionExpectation({
    expectedDecision: 'rejected'
  }, {
    decision: 'rejected',
    knowledgePointId: null,
    answer: 'No answer',
    extractedSlots: {},
    actionIds: []
  });

  assert.equal(result.passed, true);
});
