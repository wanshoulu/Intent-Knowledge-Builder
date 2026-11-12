const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createReleaseService,
  evaluateDraft
} = require('../src/release-service');
const { createEvaluationService } = require('../src/evaluation-service');

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoi-runtime-'));
  const databasePath = path.join(directory, 'runtime.db');
  const service = createReleaseService({
    databasePath
  });
  return {
    databasePath,
    service,
    close() {
      service.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function createState(answer) {
  return {
    context: {
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      channel: 'mobile-banking',
      environment: 'production',
      releaseVersion: '-'
    },
    knowledgeItems: [
      {
        id: 'ki-repayment-date',
        name: '查询信用卡还款日',
        status: 'draft',
        standardQuestion: '怎么查询信用卡还款日',
        standardAnswer: answer,
        expandedQuestions: ['查一下信用卡还款日期'],
        channels: ['mobile-banking'],
        answerVariants: [],
        actionIds: []
      }
    ],
    lexicons: [],
    expressions: [],
    actions: [],
    preprocessRules: [],
    engineProfile: {
      answerThreshold: 0.58,
      suggestionThreshold: 0.35,
      ambiguityDelta: 0.08,
      defaultReply: '未找到答案'
    }
  };
}

test('release gate validates validity, structured instructions, and materials', () => {
  const state = createState('答案');
  state.knowledgeItems[0] = {
    ...state.knowledgeItems[0],
    validFrom: '2026-09-01',
    validTo: '2026-08-01',
    sourceInstruction: 'rq(不存在的知识)',
    structuredInstructions: [{
      id: 'instruction-1',
      type: 'related_question',
      targetKnowledgeItemIds: ['missing-knowledge'],
      enabled: true
    }],
    materialRefs: [{ id: '', type: 'image' }]
  };

  const result = evaluateDraft(state, 1);

  assert.equal(result.passed, false);
  assert.equal(result.blockingIssues.some((issue) => issue.code === 'VALIDITY'), true);
  assert.equal(result.blockingIssues.some((issue) => issue.code === 'INSTRUCTIONS_VALID'), true);
  assert.equal(result.blockingIssues.some((issue) => issue.code === 'MATERIALS_VALID'), true);
});

test('raw compatibility instruction must be structured before publication', () => {
  const state = createState('答案');
  state.knowledgeItems[0].sourceInstruction = 'rq(相关知识)';

  const result = evaluateDraft(state, 1);

  assert.equal(result.passed, false);
  assert.equal(result.blockingIssues.some(
    (issue) => issue.code === 'INSTRUCTIONS_VALID'
  ), true);
});

test('draft revisions use optimistic concurrency', () => {
  const fixture = createFixture();
  try {
    const first = fixture.service.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: createState('答案 A'),
      actorId: 'editor-a'
    });
    assert.equal(first.revision, 1);

    assert.throws(
      () => fixture.service.saveDraft({
        workspaceId: 'retail-finance',
        projectId: 'mobile-banking',
        expectedRevision: 0,
        content: createState('覆盖答案'),
        actorId: 'editor-b'
      }),
      (error) => error.code === 'VERSION_CONFLICT' && error.statusCode === 409
    );
  } finally {
    fixture.close();
  }
});

test('release gate requires a passed server evaluation for the current revision when enabled', () => {
  const fixture = createFixture();
  const evaluations = createEvaluationService({
    databasePath: fixture.databasePath
  });
  try {
    const state = createState('Repayment answer');
    state.evaluationPolicy = { requireServerRun: true };
    const draft = fixture.service.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: state,
      actorId: 'editor'
    });
    const change = fixture.service.createChangeSet({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      applicationId: 'mobile-banking-assistant',
      title: 'Require server evaluation',
      draftRevision: draft.revision,
      actorId: 'editor'
    });

    const missing = fixture.service.checkChangeSet(change.id, 'reviewer');
    assert.equal(missing.passed, false);
    assert.equal(
      missing.blockingIssues.some(
        (issue) => issue.code === 'SERVER_EVALUATION'
      ),
      true
    );

    const dataset = evaluations.createDataset({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      name: 'Release gate regression',
      actorId: 'tester'
    });
    const withSamples = evaluations.replaceSamples({
      datasetId: dataset.id,
      expectedVersion: dataset.version,
      samples: [{
        id: 'sample-repayment',
        query: state.knowledgeItems[0].standardQuestion,
        enabled: true,
        expectedDecision: 'matched',
        expectedKnowledgePointId: 'ki-repayment-date',
        expectedAnswerContains: 'Repayment answer',
        channel: 'mobile-banking',
        source: 'manual',
        relatedObjectIds: ['ki-repayment-date']
      }],
      actorId: 'tester'
    });
    const run = evaluations.runEvaluation({
      datasetId: withSamples.id,
      datasetVersion: withSamples.version,
      mode: 'full',
      targetType: 'workspace',
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      targetRevision: draft.revision,
      actorId: 'tester'
    });
    const passed = fixture.service.checkChangeSet(
      change.id,
      'reviewer',
      run.id
    );

    assert.equal(run.status, 'passed');
    assert.equal(
      passed.checks.find((check) => check.code === 'SERVER_EVALUATION')
        .passed,
      true
    );
    assert.equal(passed.evaluationRunId, run.id);
  } finally {
    evaluations.close();
    fixture.close();
  }
});

test('editing a draft does not mutate the active release and rollback restores history', () => {
  const fixture = createFixture();
  try {
    const draftA = fixture.service.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: createState('答案 A'),
      actorId: 'editor'
    });
    const changeA = fixture.service.createChangeSet({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      applicationId: 'mobile-banking-assistant',
      title: '发布答案 A',
      draftRevision: draftA.revision,
      actorId: 'editor'
    });
    assert.equal(fixture.service.checkChangeSet(changeA.id, 'reviewer').passed, true);
    fixture.service.approveChangeSet(changeA.id, 'reviewer');
    const releaseA = fixture.service.publishChangeSet({
      changeSetId: changeA.id,
      applicationId: 'mobile-banking-assistant',
      environment: 'production',
      actorId: 'publisher'
    });

    const draftB = fixture.service.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: draftA.revision,
      content: createState('答案 B'),
      actorId: 'editor'
    });
    const stillActive = fixture.service.getActiveRelease(
      'mobile-banking-assistant',
      'production'
    );
    assert.equal(stillActive.id, releaseA.id);
    assert.equal(stillActive.snapshot.knowledgeItems[0].standardAnswer, '答案 A');

    const changeB = fixture.service.createChangeSet({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      applicationId: 'mobile-banking-assistant',
      title: '发布答案 B',
      draftRevision: draftB.revision,
      actorId: 'editor'
    });
    fixture.service.checkChangeSet(changeB.id, 'reviewer');
    fixture.service.approveChangeSet(changeB.id, 'reviewer');
    const releaseB = fixture.service.publishChangeSet({
      changeSetId: changeB.id,
      applicationId: 'mobile-banking-assistant',
      environment: 'production',
      actorId: 'publisher'
    });
    assert.equal(releaseB.version, 2);
    assert.equal(
      fixture.service.getActiveRelease('mobile-banking-assistant', 'production')
        .snapshot.knowledgeItems[0].standardAnswer,
      '答案 B'
    );

    const rollback = fixture.service.rollback({
      applicationId: 'mobile-banking-assistant',
      environment: 'production',
      releaseId: releaseA.id,
      actorId: 'publisher'
    });
    assert.equal(rollback.activeReleaseId, releaseA.id);
    assert.equal(
      fixture.service.getActiveRelease('mobile-banking-assistant', 'production')
        .snapshot.knowledgeItems[0].standardAnswer,
      '答案 A'
    );

    assert.deepEqual(
      fixture.service.listReleases('retail-finance', 'mobile-banking')
        .map((release) => release.id),
      [releaseB.id, releaseA.id]
    );
  } finally {
    fixture.close();
  }
});

test('release snapshots are immutable at the database boundary', () => {
  const fixture = createFixture();
  try {
    const draft = fixture.service.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: createState('答案 A'),
      actorId: 'editor'
    });
    const change = fixture.service.createChangeSet({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      applicationId: 'mobile-banking-assistant',
      title: '不可变快照',
      draftRevision: draft.revision,
      actorId: 'editor'
    });
    fixture.service.checkChangeSet(change.id, 'reviewer');
    fixture.service.approveChangeSet(change.id, 'reviewer');
    const release = fixture.service.publishChangeSet({
      changeSetId: change.id,
      applicationId: 'mobile-banking-assistant',
      environment: 'production',
      actorId: 'publisher'
    });

    assert.throws(
      () => fixture.service.unsafeUpdateReleaseForTest(release.id, '{}'),
      /release snapshots are immutable/
    );
  } finally {
    fixture.close();
  }
});

test('release gate runs deterministic rule samples and blocks a failed regression', () => {
  const state = createState('答案 A');
  state.lexicons = [{
    id: 'lex-credit',
    name: '信用卡',
    standardTerm: '信用卡',
    aliases: ['信用卡'],
    status: 'published'
  }];
  state.knowledgeItems[0].expressionIds = ['exp-credit'];
  state.expressions = [{
    id: 'exp-credit',
    name: '信用卡规则',
    dsl: '[信用卡]',
    lexiconIds: ['lex-credit'],
    knowledgeItemIds: ['ki-repayment-date'],
    status: 'published',
    polarity: 'positive',
    testCases: [{
      id: 'case-should-not-match',
      query: '信用卡',
      expectation: 'not_match',
      enabled: true,
      source: 'manual'
    }]
  }];

  const result = evaluateDraft(state, 1);
  const regression = result.checks.find(
    (check) => check.code === 'REGRESSION_TESTS'
  );

  assert.equal(regression.passed, false);
  assert.equal(result.passed, false);
  assert.equal(
    result.blockingIssues.some(
      (issue) =>
        issue.code === 'REGRESSION_TESTS' &&
        issue.objectId === 'exp-credit'
    ),
    true
  );
});

test('release gate reports failed regression as warnings when enforcement is disabled', () => {
  const state = createState('答案 A');
  state.evaluationPolicy = {
    requireServerRun: false,
    requireFullRun: true,
    forceRegression: false
  };
  state.lexicons = [{
    id: 'lex-credit',
    name: '信用卡',
    standardTerm: '信用卡',
    aliases: ['信用卡'],
    status: 'published'
  }];
  state.knowledgeItems[0].expressionIds = ['exp-credit'];
  state.expressions = [{
    id: 'exp-credit',
    name: '信用卡规则',
    dsl: '[信用卡]',
    lexiconIds: ['lex-credit'],
    knowledgeItemIds: ['ki-repayment-date'],
    status: 'published',
    polarity: 'positive',
    testCases: [{
      id: 'case-should-not-match',
      query: '信用卡',
      expectation: 'not_match',
      enabled: true,
      source: 'manual'
    }]
  }];

  const result = evaluateDraft(state, 1);

  assert.equal(result.passed, true);
  assert.equal(
    result.checks.find((check) => check.code === 'REGRESSION_TESTS').passed,
    false
  );
  assert.equal(
    result.blockingIssues.some((issue) => issue.code === 'REGRESSION_TESTS'),
    false
  );
  assert.equal(
    result.warnings.some((warning) => warning.includes('Regression failed')),
    true
  );
});

test('release gate validates actions referenced only by answer variants', () => {
  const state = createState('还款日答案');
  state.knowledgeItems[0].answerVariants = [{
    id: 'answer-mobile',
    channel: 'mobile-banking',
    content: '手机银行答案',
    actionIds: ['action-missing']
  }];

  const result = evaluateDraft(state, 1);

  assert.equal(result.passed, false);
  assert.equal(
    result.blockingIssues.some(
      (issue) =>
        issue.code === 'REFERENCES_VALID' &&
        issue.message.includes('action-missing')
    ),
    true
  );
});

test('release gate blocks an action mapping that references an undefined slot', () => {
  const state = createState('Repayment answer');
  state.knowledgeItems[0].actionIds = ['action-open'];
  state.knowledgeItems[0].slots = [];
  state.actions = [{
    id: 'action-open',
    name: 'Open page',
    type: 'navigation',
    actionCode: 'open_page',
    payload: { path: '/page?date={repayment_date}' },
    inputMappings: [{
      parameter: 'repayment_date',
      source: 'slot',
      sourceKey: 'repayment_date',
      required: true
    }],
    channels: ['mobile-banking'],
    status: 'draft'
  }];

  const result = evaluateDraft(state, 1);

  assert.equal(result.passed, false);
  assert.equal(
    result.blockingIssues.some(
      (issue) =>
        issue.code === 'REFERENCES_VALID' &&
        issue.message.includes('repayment_date')
    ),
    true
  );
});

test('a release snapshot contains only change-set objects and their dependencies', () => {
  const fixture = createFixture();
  try {
    const state = createState('还款日答案');
    state.knowledgeItems[0].answerVariants = [{
      id: 'answer-mobile',
      channel: 'mobile-banking',
      content: '带动作答案',
      actionIds: ['action-answer']
    }];
    state.actions = [{
      id: 'action-answer',
      name: '打开还款页面',
      status: 'draft',
      channels: ['mobile-banking']
    }];
    state.knowledgeItems.push({
      id: 'ki-unrelated-draft',
      name: '未提交草稿',
      status: 'draft',
      standardQuestion: '未提交的问题',
      standardAnswer: '不应上线',
      expandedQuestions: ['未提交扩展问'],
      channels: ['mobile-banking'],
      answerVariants: [],
      actionIds: []
    });
    const draft = fixture.service.saveDraft({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      expectedRevision: 0,
      content: state,
      actorId: 'editor'
    });
    const change = fixture.service.createChangeSet({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      applicationId: 'mobile-banking-assistant',
      title: '只发布还款日',
      draftRevision: draft.revision,
      objectRefs: ['ki-repayment-date'],
      actorId: 'editor'
    });
    fixture.service.checkChangeSet(change.id, 'reviewer');
    fixture.service.approveChangeSet(change.id, 'reviewer');
    const release = fixture.service.publishChangeSet({
      changeSetId: change.id,
      applicationId: 'mobile-banking-assistant',
      environment: 'production',
      actorId: 'publisher'
    });

    assert.deepEqual(
      release.snapshot.knowledgeItems.map((item) => item.id),
      ['ki-repayment-date']
    );
    assert.equal(release.snapshot.knowledgeItems[0].status, 'published');
    assert.equal(
      release.snapshot.knowledgeItems[0].expandedQuestionDefinitions?.every(
        (question) => question.status === 'published'
      ) ?? true,
      true
    );
    assert.deepEqual(
      release.snapshot.actions.map((action) => action.id),
      ['action-answer']
    );
  } finally {
    fixture.close();
  }
});
