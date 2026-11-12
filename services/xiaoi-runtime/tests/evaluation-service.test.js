const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createEvaluationService } = require('../src/evaluation-service');
const { createReleaseService } = require('../src/release-service');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoi-eval-'));
  const databasePath = path.join(directory, 'runtime.db');
  const releases = createReleaseService({ databasePath });
  const evaluations = createEvaluationService({ databasePath });
  return {
    releases,
    evaluations,
    close() {
      evaluations.close();
      releases.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function workspaceState() {
  return {
    engineVersion: 'xiaoi-core-v1',
    modules: [{
      id: 'module-default',
      name: 'Default',
      enabled: true,
      priority: 100,
      thresholds: {
        answerThreshold: 0.75,
        searchThreshold: 0.6,
        minimumAnswerThreshold: 0.65,
        maximumSimilarityDifference: 0.1,
        minimumSimilarityDifference: 0.05
      }
    }],
    knowledgeItems: [{
      id: 'ki-card',
      name: 'Card',
      moduleId: 'module-default',
      status: 'draft',
      standardQuestion: 'check my card',
      standardAnswer: 'Card answer',
      expandedQuestions: [],
      channels: ['mobile'],
      actionIds: []
    }],
    lexicons: [],
    expressions: [],
    actions: []
  };
}

function createDatasetWithSample(evaluations) {
  const dataset = evaluations.createDataset({
    workspaceId: 'retail-finance',
    projectId: 'mobile-banking',
    name: 'Core regression',
    description: 'Core recognition samples',
    actorId: 'tester'
  });
  return evaluations.replaceSamples({
    datasetId: dataset.id,
    expectedVersion: dataset.version,
    samples: [{
      id: 'sample-card',
      query: 'check my card',
      enabled: true,
      expectedDecision: 'matched',
      expectedKnowledgePointId: 'ki-card',
      expectedAnswerContains: 'Card answer',
      expectedSlotValues: {},
      expectedActionIds: [],
      channel: 'mobile',
      source: 'manual',
      relatedObjectIds: ['ki-card']
    }],
    actorId: 'tester'
  });
}

test('persists a versioned evaluation dataset and its samples', () => {
  const fixture = createFixture();
  try {
    const dataset = createDatasetWithSample(fixture.evaluations);

    assert.equal(dataset.version, 2);
    assert.equal(dataset.samples.length, 1);
    assert.equal(
      fixture.evaluations.listDatasets(
        'retail-finance',
        'mobile-banking'
      )[0].id,
      dataset.id
    );
  } finally {
    fixture.close();
  }
});

test('runs a dataset against the exact workspace revision and persists results', () => {
  const fixture = createFixture();
  try {
    const draft = fixture.releases.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: workspaceState(),
      actorId: 'tester'
    });
    const dataset = createDatasetWithSample(fixture.evaluations);
    const run = fixture.evaluations.runEvaluation({
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      mode: 'full',
      targetType: 'workspace',
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      targetRevision: draft.revision,
      actorId: 'tester'
    });

    assert.equal(run.status, 'passed');
    assert.equal(run.total, 1);
    assert.equal(run.passed, 1);
    assert.equal(run.failed, 0);
    assert.equal(run.targetRevision, draft.revision);
    const results = fixture.evaluations.listRunResults(run.id);
    assert.equal(results.length, 1);
    assert.equal(results[0].passed, true);
    assert.equal(results[0].actual.knowledgePointId, 'ki-card');
  } finally {
    fixture.close();
  }
});

test('rejects an empty dataset and a stale workspace revision', () => {
  const fixture = createFixture();
  try {
    fixture.releases.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: workspaceState(),
      actorId: 'tester'
    });
    const empty = fixture.evaluations.createDataset({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      name: 'Empty',
      actorId: 'tester'
    });
    assert.throws(
      () => fixture.evaluations.runEvaluation({
        datasetId: empty.id,
        datasetVersion: empty.version,
        mode: 'full',
        targetType: 'workspace',
        workspaceId: 'retail-finance',
        projectId: 'mobile-banking',
        targetRevision: 1
      }),
      (error) => error.code === 'EMPTY_EVALUATION_DATASET'
    );

    const dataset = createDatasetWithSample(fixture.evaluations);
    assert.throws(
      () => fixture.evaluations.runEvaluation({
        datasetId: dataset.id,
        datasetVersion: dataset.version,
        mode: 'full',
        targetType: 'workspace',
        workspaceId: 'retail-finance',
        projectId: 'mobile-banking',
        targetRevision: 0
      }),
      (error) =>
        error.code === 'VERSION_CONFLICT' &&
        error.details.currentRevision === 1
    );
  } finally {
    fixture.close();
  }
});
