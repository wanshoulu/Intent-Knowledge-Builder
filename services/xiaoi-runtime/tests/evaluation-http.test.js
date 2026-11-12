const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRuntimeServer } = require('../src/http');

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'evaluation-tester',
      ...options.headers
    }
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

function state(answer = 'Card answer') {
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
      standardAnswer: answer,
      expandedQuestions: [],
      channels: ['mobile'],
      actionIds: []
    }],
    lexicons: [],
    expressions: [],
    actions: []
  };
}

test('evaluation HTTP API persists datasets and executes a workspace run', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoi-eval-http-'));
  const runtime = createRuntimeServer({
    databasePath: path.join(directory, 'runtime.db')
  });
  await runtime.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${runtime.address().port}`;

  try {
    const draft = await request(
      baseUrl,
      '/api/v1/workspaces/retail-finance/draft',
      {
        method: 'PUT',
        body: JSON.stringify({
          project_id: 'mobile-banking',
          expected_revision: 0,
          content: state()
        })
      }
    );
    assert.equal(draft.status, 200);

    const created = await request(
      baseUrl,
      '/api/v1/evaluation-datasets',
      {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: 'retail-finance',
          project_id: 'mobile-banking',
          name: 'Core regression',
          description: 'Core samples'
        })
      }
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.data.version, 1);
    const datasetId = created.body.data.id;

    const samples = await request(
      baseUrl,
      `/api/v1/evaluation-datasets/${datasetId}/samples`,
      {
        method: 'PUT',
        body: JSON.stringify({
          expected_version: 1,
          samples: [{
            id: 'sample-card',
            query: 'check my card',
            enabled: true,
            expectedDecision: 'matched',
            expectedKnowledgePointId: 'ki-card',
            expectedAnswerContains: 'Card answer',
            channel: 'mobile',
            source: 'manual',
            relatedObjectIds: ['ki-card']
          }]
        })
      }
    );
    assert.equal(samples.status, 200);
    assert.equal(samples.body.data.version, 2);

    const run = await request(baseUrl, '/api/v1/evaluation-runs', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: datasetId,
        dataset_version: 2,
        mode: 'full',
        target_type: 'workspace',
        workspace_id: 'retail-finance',
        project_id: 'mobile-banking',
        target_revision: draft.body.data.revision
      })
    });
    assert.equal(run.status, 201);
    assert.equal(run.body.data.status, 'passed');

    const results = await request(
      baseUrl,
      `/api/v1/evaluation-runs/${run.body.data.id}/results`
    );
    assert.equal(results.status, 200);
    assert.equal(results.body.data.length, 1);
    assert.equal(results.body.data[0].passed, true);

    const datasets = await request(
      baseUrl,
      '/api/v1/evaluation-datasets?workspace_id=retail-finance&project_id=mobile-banking'
    );
    assert.equal(datasets.status, 200);
    assert.equal(datasets.body.data.length, 1);

    const runs = await request(
      baseUrl,
      '/api/v1/evaluation-runs?workspace_id=retail-finance&project_id=mobile-banking'
    );
    assert.equal(runs.status, 200);
    assert.equal(runs.body.data[0].id, run.body.data.id);
  } finally {
    await runtime.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed evaluation results create one real ticket and verify by rerunning', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoi-ticket-http-'));
  const runtime = createRuntimeServer({
    databasePath: path.join(directory, 'runtime.db')
  });
  await runtime.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${runtime.address().port}`;

  try {
    const draft = await request(
      baseUrl,
      '/api/v1/workspaces/retail-finance/draft',
      {
        method: 'PUT',
        body: JSON.stringify({
          project_id: 'mobile-banking',
          expected_revision: 0,
          content: state('Old answer')
        })
      }
    );
    const created = await request(
      baseUrl,
      '/api/v1/evaluation-datasets',
      {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: 'retail-finance',
          project_id: 'mobile-banking',
          name: 'Ticket regression'
        })
      }
    );
    const datasetId = created.body.data.id;
    const samples = await request(
      baseUrl,
      `/api/v1/evaluation-datasets/${datasetId}/samples`,
      {
        method: 'PUT',
        body: JSON.stringify({
          expected_version: 1,
          samples: [{
            id: 'sample-answer',
            query: 'check my card',
            enabled: true,
            expectedDecision: 'matched',
            expectedKnowledgePointId: 'ki-card',
            expectedAnswerContains: 'Fixed answer',
            channel: 'mobile',
            source: 'manual',
            relatedObjectIds: ['ki-card']
          }]
        })
      }
    );
    const run = await request(baseUrl, '/api/v1/evaluation-runs', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: datasetId,
        dataset_version: samples.body.data.version,
        mode: 'full',
        target_type: 'workspace',
        workspace_id: 'retail-finance',
        project_id: 'mobile-banking',
        target_revision: draft.body.data.revision
      })
    });
    assert.equal(run.body.data.status, 'failed');

    const ticketA = await request(
      baseUrl,
      `/api/v1/evaluation-runs/${run.body.data.id}/results/sample-answer/ticket`,
      { method: 'POST', body: '{}' }
    );
    const ticketB = await request(
      baseUrl,
      `/api/v1/evaluation-runs/${run.body.data.id}/results/sample-answer/ticket`,
      { method: 'POST', body: '{}' }
    );
    assert.equal(ticketA.status, 201);
    assert.equal(ticketB.status, 200);
    assert.equal(ticketB.body.data.id, ticketA.body.data.id);

    await request(
      baseUrl,
      '/api/v1/workspaces/retail-finance/draft',
      {
        method: 'PUT',
        body: JSON.stringify({
          project_id: 'mobile-banking',
          expected_revision: 1,
          content: state('Fixed answer')
        })
      }
    );
    const verified = await request(
      baseUrl,
      `/api/v1/feedback-tickets/${ticketA.body.data.id}/verify`,
      { method: 'POST', body: '{}' }
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.ticket.status, 'resolved');
    assert.equal(verified.body.data.verification.passed, true);

    const tickets = await request(
      baseUrl,
      '/api/v1/feedback-tickets?workspace_id=retail-finance&project_id=mobile-banking'
    );
    assert.equal(tickets.body.data.length, 1);
  } finally {
    await runtime.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('evaluation HTTP API rejects malformed samples without partial writes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoi-eval-http-'));
  const runtime = createRuntimeServer({
    databasePath: path.join(directory, 'runtime.db')
  });
  await runtime.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${runtime.address().port}`;

  try {
    const created = await request(
      baseUrl,
      '/api/v1/evaluation-datasets',
      {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: 'retail-finance',
          project_id: 'mobile-banking',
          name: 'Invalid samples'
        })
      }
    );
    const datasetId = created.body.data.id;
    const rejected = await request(
      baseUrl,
      `/api/v1/evaluation-datasets/${datasetId}/samples`,
      {
        method: 'PUT',
        body: JSON.stringify({
          expected_version: 1,
          samples: [{
            id: 'invalid',
            query: 'query',
            expectedDecision: 'unknown'
          }]
        })
      }
    );
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'VALIDATION_FAILED');

    const dataset = await request(
      baseUrl,
      `/api/v1/evaluation-datasets/${datasetId}`
    );
    assert.equal(dataset.body.data.version, 1);
    assert.deepEqual(dataset.body.data.samples, []);
  } finally {
    await runtime.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
