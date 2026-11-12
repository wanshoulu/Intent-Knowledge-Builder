const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRuntimeServer } = require('../src/http');

function state(answer) {
  return {
    knowledgeItems: [{
      id: 'ki-card',
      name: '信用卡查询',
      targetType: 'faq',
      status: 'draft',
      standardQuestion: '怎么查询信用卡',
      standardAnswer: answer,
      expandedQuestions: ['查一下信用卡'],
      channels: ['mobile-banking'],
      answerVariants: [{
        id: 'answer-shanghai-vip',
        channel: 'mobile-banking',
        region: '上海',
        segment: '贵宾客户',
        content: `${answer}（上海贵宾）`,
        actionIds: []
      }],
      expressionIds: [],
      lexiconIds: [],
      actionIds: []
    }],
    lexicons: [],
    expressions: [],
    actions: [],
    modules: [{
      id: 'default-module',
      name: '信用卡条件模块',
      enabled: true,
      priority: 100,
      dimensionConditions: { region: ['上海', '江苏'] },
      categoryConditions: ['信用卡'],
      contextConditions: { scene: 'repayment' },
      thresholds: {
        answerThreshold: 0.58,
        searchThreshold: 0.35,
        minimumAnswerThreshold: 0.48,
        maximumSimilarityDifference: 0.16,
        minimumSimilarityDifference: 0.08
      }
    }],
    engineProfile: {
      answerThreshold: 0.58,
      suggestionThreshold: 0.35,
      ambiguityDelta: 0.08,
      defaultReply: '未找到答案'
    }
  };
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'test-user',
      ...options.headers
    }
  });
  return {
    status: response.status,
    body: await response.json()
  };
}

test('HTTP API persists, publishes, recognizes and rolls back immutable releases', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoi-http-'));
  const runtime = createRuntimeServer({
    databasePath: path.join(directory, 'runtime.db')
  });
  await runtime.listen(0, '127.0.0.1');
  const address = runtime.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await request(baseUrl, '/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.data.status, 'ok');

    const draftA = await request(
      baseUrl,
      '/api/v1/workspaces/retail-finance/draft',
      {
        method: 'PUT',
        body: JSON.stringify({
          project_id: 'mobile-banking',
          expected_revision: 0,
          content: state('答案 A')
        })
      }
    );
    assert.equal(draftA.status, 200);
    assert.equal(draftA.body.data.revision, 1);

    const unpublishedStatus = await request(
      baseUrl,
      '/api/v1/applications/mobile-banking-assistant/runtime-status?environment=production'
    );
    assert.equal(unpublishedStatus.status, 200);
    assert.equal(unpublishedStatus.body.data.status, 'unpublished');
    assert.equal(unpublishedStatus.body.data.releaseId, null);

    const conflict = await request(
      baseUrl,
      '/api/v1/workspaces/retail-finance/draft',
      {
        method: 'PUT',
        body: JSON.stringify({
          project_id: 'mobile-banking',
          expected_revision: 0,
          content: state('错误覆盖')
        })
      }
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'VERSION_CONFLICT');

    const changeA = await request(baseUrl, '/api/v1/change-sets', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: 'retail-finance',
        project_id: 'mobile-banking',
        application_id: 'mobile-banking-assistant',
        title: '答案 A',
        draft_revision: 1
      })
    });
    const changeAId = changeA.body.data.id;
    const gateA = await request(
      baseUrl,
      `/api/v1/change-sets/${changeAId}/check`,
      { method: 'POST', body: '{}' }
    );
    assert.equal(gateA.body.data.passed, true);
    await request(baseUrl, `/api/v1/change-sets/${changeAId}/approve`, {
      method: 'POST',
      body: '{}'
    });
    const publishedA = await request(baseUrl, '/api/v1/releases', {
      method: 'POST',
      body: JSON.stringify({
        change_set_id: changeAId,
        application_id: 'mobile-banking-assistant',
        environment: 'production'
      })
    });
    assert.equal(publishedA.status, 201);
    assert.equal(publishedA.body.data.version, 1);

    const activeStatus = await request(
      baseUrl,
      '/api/v1/applications/mobile-banking-assistant/runtime-status?environment=production'
    );
    assert.equal(activeStatus.status, 200);
    assert.equal(activeStatus.body.data.status, 'active');
    assert.equal(activeStatus.body.data.releaseId, publishedA.body.data.id);
    assert.equal(activeStatus.body.data.releaseVersion, 1);

    await request(baseUrl, '/api/v1/workspaces/retail-finance/draft', {
      method: 'PUT',
      body: JSON.stringify({
        project_id: 'mobile-banking',
        expected_revision: 1,
        content: state('答案 B')
      })
    });
    const beforePublishB = await request(baseUrl, '/api/v1/runtime/recognize', {
      method: 'POST',
      body: JSON.stringify({
        application_id: 'mobile-banking-assistant',
        environment: 'production',
        channel: 'mobile-banking',
        category: '信用卡',
        dimensions: { region: '上海' },
        context: { scene: 'repayment' },
        query: '查一下信用卡'
      })
    });
    assert.equal(beforePublishB.body.data.answer, '答案 A');
    assert.equal(beforePublishB.body.data.releaseVersion, 1);

    const dimensionalAnswer = await request(baseUrl, '/api/v1/runtime/recognize', {
      method: 'POST',
      body: JSON.stringify({
        application_id: 'mobile-banking-assistant',
        environment: 'production',
        channel: 'mobile-banking',
        category: '信用卡',
        dimensions: { region: '上海', segment: '贵宾客户' },
        context: { scene: 'repayment' },
        query: '查一下信用卡'
      })
    });
    assert.equal(dimensionalAnswer.body.data.answer, '答案 A（上海贵宾）');
    assert.equal(
      dimensionalAnswer.body.data.trace.answerSelection.selectedVariantId,
      'answer-shanghai-vip'
    );

    const releases = await request(
      baseUrl,
      '/api/v1/releases?workspace_id=retail-finance&project_id=mobile-banking'
    );
    assert.equal(releases.body.data.length, 1);

    const rollback = await request(
      baseUrl,
      '/api/v1/applications/mobile-banking-assistant/rollback',
      {
        method: 'POST',
        body: JSON.stringify({
          environment: 'production',
          release_id: publishedA.body.data.id
        })
      }
    );
    assert.equal(rollback.status, 200);
    assert.equal(rollback.body.data.releaseVersion, 1);
  } finally {
    await runtime.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
