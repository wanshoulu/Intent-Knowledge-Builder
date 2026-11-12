const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideCandidates,
  evaluateTemplate,
  recognizeKnowledge
} = require('../../../packages/xiaoi-core');

const thresholds = {
  answerThreshold: 0.75,
  searchThreshold: 0.6,
  minimumAnswerThreshold: 0.65,
  maximumSimilarityDifference: 0.1,
  minimumSimilarityDifference: 0.05
};

function appointmentSnapshot() {
  return {
    engineVersion: 'xiaoi-core-v1',
    modules: [
      {
        id: 'module-branch',
        name: '网点服务',
        enabled: true,
        priority: 100,
        thresholds
      }
    ],
    lexicons: [
      {
        id: 'lex-appointment',
        name: '预约',
        standardTerm: '预约',
        aliases: ['约', '预约'],
        status: 'published'
      },
      {
        id: 'lex-time',
        name: '@时间',
        standardTerm: '@时间',
        aliases: [],
        dynamic: true,
        pattern: '(今天|明天|后天)(上午|下午|晚上)?',
        status: 'published'
      },
      {
        id: 'lex-branch',
        name: '网点',
        standardTerm: '网点',
        aliases: ['网点', '营业网点', '营业厅'],
        status: 'published'
      },
      {
        id: 'lex-cancel',
        name: '取消',
        standardTerm: '取消',
        aliases: ['取消', '不想'],
        status: 'published'
      }
    ],
    knowledgeItems: [
      {
        id: 'kp-appointment',
        name: '网点预约',
        moduleId: 'module-branch',
        status: 'published',
        standardQuestion: '怎么预约银行网点',
        standardAnswer: '您可以选择网点和时间提交预约。',
        expandedQuestions: [
          {
            id: 'eq-ordinary',
            kind: 'ordinary',
            content: '帮我约明天下午的网点',
            enabled: true
          },
          {
            id: 'eq-template',
            kind: 'template',
            content: '([预约][@时间][网点])',
            enabled: true,
            templateConfig: {
              polarity: 'positive',
              mode: 'base'
            }
          },
          {
            id: 'eq-negative',
            kind: 'template',
            content: '[取消][预约][网点]',
            enabled: true,
            templateConfig: {
              polarity: 'negative',
              mode: 'base'
            }
          }
        ]
      },
      {
        id: 'kp-cancel',
        name: '取消网点预约',
        moduleId: 'module-branch',
        status: 'published',
        standardQuestion: '怎么取消网点预约',
        standardAnswer: '请进入预约记录取消。',
        expandedQuestions: [
          {
            id: 'eq-cancel-template',
            kind: 'template',
            content: '[取消][预约][网点]',
            enabled: true,
            templateConfig: {
              polarity: 'positive',
              mode: 'base'
            }
          }
        ]
      }
    ]
  };
}

test('ordinary questions and positive templates compete inside one knowledge point', () => {
  const result = recognizeKnowledge(
    appointmentSnapshot(),
    { query: '帮我约一下明天下午的网点' }
  );

  assert.equal(result.decision, 'matched');
  assert.equal(result.knowledgePointId, 'kp-appointment');
  assert.equal(result.trace.modules[0].candidates[0].knowledgePointId, 'kp-appointment');
  assert.ok(result.trace.modules[0].candidates[0].ordinaryScore > 0);
  assert.ok(result.trace.modules[0].candidates[0].templateScore > 0);
});

test('future knowledge is excluded unless inactive knowledge is explicitly included', () => {
  const snapshot = appointmentSnapshot();
  snapshot.knowledgeItems[0].validFrom = '2027-01-01';

  const excluded = recognizeKnowledge(snapshot, {
    query: '帮我约一下明天下午的网点',
    now: '2026-08-03T00:00:00.000Z'
  });
  assert.notEqual(excluded.knowledgePointId, 'kp-appointment');

  const included = recognizeKnowledge(snapshot, {
    query: '帮我约一下明天下午的网点',
    now: '2026-08-03T00:00:00.000Z',
    includeInactive: true
  });
  assert.equal(included.knowledgePointId, 'kp-appointment');
});

test('template scoring preserves differences and reserves 1.00 for exact mode', () => {
  const requiredTokens = [
    { text: '信用卡', lexiconName: '信用卡', weight: 1.2, start: 0, end: 3 },
    { text: '还款日', lexiconName: '还款时间', weight: 1, start: 3, end: 6 }
  ];
  const optionalToken = {
    text: '查询',
    lexiconName: '查询动作',
    weight: 0.8,
    start: 6,
    end: 8
  };
  const unrelatedToken = {
    text: '取消',
    lexiconName: '取消',
    weight: 1,
    start: 8,
    end: 10
  };
  const template = {
    id: 'template-boost',
    kind: 'template',
    content: '&[信用卡][还款时间][查询动作?]',
    templateConfig: { polarity: 'positive' }
  };

  const requiredOnly = evaluateTemplate(template, requiredTokens);
  const withOptional = evaluateTemplate(
    template,
    [...requiredTokens, optionalToken]
  );
  const withNoise = evaluateTemplate(
    template,
    [...requiredTokens, optionalToken, unrelatedToken]
  );
  const exact = evaluateTemplate(
    { ...template, content: '&&[信用卡][还款时间][查询动作?]' },
    [...requiredTokens, optionalToken]
  );

  assert.ok(requiredOnly.score > 0 && requiredOnly.score < 1);
  assert.equal(withOptional.score, requiredOnly.score);
  assert.ok(withNoise.score < withOptional.score);
  assert.equal(exact.score, 1);
  assert.equal(exact.exactCoverage, true);
});

test('a negative template blocks only its own knowledge point', () => {
  const result = recognizeKnowledge(
    appointmentSnapshot(),
    { query: '帮我取消网点预约' }
  );

  assert.equal(result.decision, 'matched');
  assert.equal(result.knowledgePointId, 'kp-cancel');
  const appointment = result.trace.modules[0].candidates.find(
    (candidate) => candidate.knowledgePointId === 'kp-appointment'
  );
  assert.equal(appointment.blockedByNegativeTemplate, true);
});

test('a lower priority module runs only after the current module has no valid output', () => {
  const snapshot = appointmentSnapshot();
  snapshot.modules = [
    {
      id: 'module-high',
      name: '高优先级模块',
      enabled: true,
      priority: 200,
      thresholds
    },
    {
      id: 'module-branch',
      name: '网点服务',
      enabled: true,
      priority: 100,
      thresholds
    }
  ];
  snapshot.knowledgeItems.unshift({
    id: 'kp-weather',
    name: '天气查询',
    moduleId: 'module-high',
    status: 'published',
    standardQuestion: '今天天气怎么样',
    standardAnswer: '天气答案',
    expandedQuestions: []
  });

  const result = recognizeKnowledge(
    snapshot,
    { query: '帮我约一下明天下午的网点' }
  );

  assert.equal(result.knowledgePointId, 'kp-appointment');
  assert.deepEqual(
    result.trace.modules.map((module) => module.moduleId),
    ['module-high', 'module-branch']
  );
  assert.equal(result.trace.modules[0].decision, 'continue');
  assert.equal(result.trace.modules[1].decision, 'matched');
});

test('a module with unmet dimension, category or context conditions is skipped', () => {
  const snapshot = appointmentSnapshot();
  const baseModule = snapshot.modules[0];
  snapshot.modules = [
    {
      ...baseModule,
      id: 'module-restricted',
      name: '受限模块',
      priority: 200,
      dimensionConditions: { channel: ['wechat'] },
      categoryConditions: ['vip'],
      contextConditions: { scene: 'appointment' }
    },
    {
      ...baseModule,
      id: 'module-default',
      name: '默认模块',
      priority: 100
    }
  ];
  snapshot.knowledgeItems[0].moduleId = undefined;
  snapshot.modules[1].knowledgePointIds = ['kp-appointment'];

  const result = recognizeKnowledge(snapshot, {
    query: '帮我约明天下午的网点',
    dimensions: { channel: 'mobile' },
    category: 'general',
    context: { scene: 'other' },
    scope: 'workspace'
  });

  assert.equal(result.knowledgePointId, 'kp-appointment');
  assert.equal(result.trace.modules[0].moduleId, 'module-restricted');
  assert.equal(result.trace.modules[0].decision, 'skipped');
  assert.equal(result.trace.modules[0].conditions.matched, false);
  assert.deepEqual(
    result.trace.modules[0].conditions.failures.map((item) => item.type),
    ['dimension', 'category', 'context']
  );
  assert.equal(result.trace.modules[1].moduleId, 'module-default');
});

test('formal expanded questions replace legacy strings and honor weight and publish status', () => {
  const snapshot = appointmentSnapshot();
  const item = snapshot.knowledgeItems[0];
  item.standardQuestion = '完全无关的问题';
  item.expandedQuestions = ['帮我约明天下午的网点'];
  item.expandedQuestionDefinitions = [
    {
      id: 'eq-weighted',
      kind: 'ordinary',
      content: '帮我约明天下午的网点',
      enabled: true,
      weight: 0.5,
      status: 'published'
    },
    {
      id: 'eq-draft',
      kind: 'ordinary',
      content: '帮我约明天下午的网点',
      enabled: true,
      weight: 1,
      status: 'draft'
    }
  ];
  item.expandedQuestions.push('不应重复进入计算');

  const workspaceResult = recognizeKnowledge(snapshot, {
    query: '帮我约明天下午的网点',
    scope: 'workspace'
  });
  const publishedResult = recognizeKnowledge(snapshot, {
    query: '帮我约明天下午的网点',
    scope: 'published'
  });
  const workspaceComparisons =
    workspaceResult.trace.modules[0].candidates[0].ordinaryComparisons;
  const publishedComparisons =
    publishedResult.trace.modules[0].candidates[0].ordinaryComparisons;

  assert.deepEqual(
    workspaceComparisons.map((comparison) => comparison.id),
    [`${item.id}-standard`, 'eq-weighted', 'eq-draft']
  );
  assert.deepEqual(
    publishedComparisons.map((comparison) => comparison.id),
    [`${item.id}-standard`, 'eq-weighted']
  );
  assert.equal(
    publishedComparisons.find((comparison) => comparison.id === 'eq-weighted')
      .score,
    1
  );
});

test('ordinary-question boost weight cannot turn a non-exact match into 1.00', () => {
  const snapshot = appointmentSnapshot();
  const item = snapshot.knowledgeItems[0];
  item.standardQuestion = '完全无关';
  item.expandedQuestionDefinitions = [{
    id: 'eq-boosted',
    kind: 'ordinary',
    content: '帮我约明天下午的网点',
    enabled: true,
    weight: 2,
    status: 'published'
  }];

  const result = recognizeKnowledge(snapshot, {
    query: '请帮我预约明天下午网点',
    scope: 'published'
  });
  const comparison =
    result.trace.modules[0].candidates[0].ordinaryComparisons.find(
      (item) => item.id === 'eq-boosted'
    );

  assert.ok(comparison.rawScore > 0 && comparison.rawScore <= 1);
  assert.ok(comparison.score >= comparison.rawScore);
  assert.ok(comparison.score <= 1);
});

test('v1 scoring follows weighted ordinary and template formulas', () => {
  const snapshot = {
    engineProfile: { ...thresholds },
    lexicons: [
      {
        id: 'appointment',
        name: '\u9884\u7ea6',
        standardTerm: '\u9884\u7ea6',
        aliases: ['\u7ea6'],
        weight: 1.2,
        posType: 'verb',
        status: 'published'
      },
      {
        id: 'time',
        name: '@\u65f6\u95f4',
        standardTerm: '@\u65f6\u95f4',
        aliases: [],
        dynamic: true,
        pattern: '(\u4eca\u5929|\u660e\u5929|\u540e\u5929)(\u4e0a\u5348|\u4e0b\u5348|\u665a\u4e0a)?',
        weight: 1,
        status: 'published'
      },
      {
        id: 'branch',
        name: '\u7f51\u70b9',
        standardTerm: '\u7f51\u70b9',
        aliases: ['\u94f6\u884c\u7f51\u70b9'],
        weight: 1.2,
        posType: 'noun',
        status: 'published'
      }
    ],
    knowledgeItems: [{
      id: 'kp-branch-appointment',
      name: '\u7f51\u70b9\u9884\u7ea6',
      status: 'published',
      standardQuestion: '\u600e\u4e48\u9884\u7ea6\u94f6\u884c\u7f51\u70b9',
      standardAnswer: 'ok',
      expandedQuestionDefinitions: [
        {
          id: 'ordinary-appointment',
          kind: 'ordinary',
          content: '\u5e2e\u6211\u9884\u7ea6\u7f51\u70b9',
          enabled: true,
          status: 'published'
        },
        {
          id: 'template-appointment',
          kind: 'template',
          content: '([\u9884\u7ea6][@\u65f6\u95f4][\u7f51\u70b9])',
          enabled: true,
          status: 'published',
          templateConfig: { polarity: 'positive' }
        }
      ]
    }]
  };
  const result = recognizeKnowledge(snapshot, {
    query: '\u5e2e\u6211\u7ea6\u4e00\u4e0b\u660e\u5929\u4e0b\u5348\u7684\u7f51\u70b9',
    scope: 'published'
  });
  const candidate = result.trace.modules[0].candidates[0];
  const standard = candidate.ordinaryComparisons.find(
    (comparison) => comparison.type === 'standard'
  );
  const ordinary = candidate.ordinaryComparisons.find(
    (comparison) => comparison.type === 'ordinary'
  );
  const template = candidate.templateTraces[0];

  assert.ok(Math.abs(standard.rawScore - 0.8) < 0.000001);
  assert.ok(Math.abs(ordinary.rawScore - (4.8 / 5.8)) < 0.000001);
  assert.ok(Math.abs(ordinary.score - 0.840764331210191) < 0.000001);
  assert.ok(Math.abs(template.score - 0.92) < 0.000001);
  assert.equal(candidate.winningCandidate.expressionId, 'template-appointment');
  assert.ok(Math.abs(candidate.score - 0.92) < 0.000001);
});

test('negative templates require both structure and the negative threshold', () => {
  const names = ['\u53d6\u6d88', '\u9884\u7ea6', '\u4f59\u989d', '\u8d26\u5355', '\u7f51\u70b9', '\u65f6\u95f4'];
  const snapshot = {
    engineProfile: { ...thresholds, negativeTemplateThreshold: 0.85 },
    lexicons: names.map((name, index) => ({
      id: `lex-${index}`,
      name,
      standardTerm: name,
      aliases: [],
      weight: 1,
      status: 'published'
    })),
    knowledgeItems: [{
      id: 'kp-negative-threshold',
      name: 'target',
      status: 'published',
      standardQuestion: '\u9884\u7ea6',
      standardAnswer: 'ok',
      expandedQuestionDefinitions: [{
        id: 'negative-template',
        kind: 'template',
        content: '[\u53d6\u6d88][\u9884\u7ea6]',
        enabled: true,
        status: 'published',
        templateConfig: { polarity: 'negative' }
      }]
    }]
  };
  const result = recognizeKnowledge(snapshot, {
    query: names.join(''),
    scope: 'published'
  });
  const candidate = result.trace.modules[0].candidates[0];
  const negative = candidate.templateTraces[0];

  assert.equal(negative.matched, true);
  assert.ok(negative.score < negative.negativeThreshold);
  assert.equal(candidate.blockedByNegativeTemplate, false);
});

test('fallback suppression is scoped to its own knowledge point', () => {
  const snapshot = {
    engineProfile: { ...thresholds },
    lexicons: [
      { id: 'appointment', name: '\u9884\u7ea6', standardTerm: '\u9884\u7ea6', aliases: [], status: 'published' },
      { id: 'branch', name: '\u7f51\u70b9', standardTerm: '\u7f51\u70b9', aliases: [], status: 'published' }
    ],
    knowledgeItems: [
      {
        id: 'kp-primary', name: 'primary', status: 'published',
        standardQuestion: '\u5176\u4ed6', standardAnswer: 'primary',
        expandedQuestionDefinitions: [{
          id: 'primary-template', kind: 'template', content: '[\u9884\u7ea6]',
          enabled: true, status: 'published', templateConfig: { polarity: 'positive' }
        }]
      },
      {
        id: 'kp-fallback', name: 'fallback', status: 'published',
        standardQuestion: '\u65e0\u5173', standardAnswer: 'fallback',
        expandedQuestionDefinitions: [{
          id: 'fallback-template', kind: 'template', content: '&+[\u7f51\u70b9]',
          enabled: true, status: 'published', templateConfig: { polarity: 'positive' }
        }]
      }
    ]
  };
  const result = recognizeKnowledge(snapshot, {
    query: '\u9884\u7ea6\u7f51\u70b9',
    scope: 'published'
  });
  const fallback = result.trace.modules[0].candidates.find(
    (candidate) => candidate.knowledgePointId === 'kp-fallback'
  );

  assert.equal(fallback.templateTraces[0].matched, true);
  assert.equal(fallback.templateTraces[0].suppressed, false);
  assert.equal(fallback.expressionCandidates.find(
    (candidate) => candidate.expressionId === 'fallback-template'
  ).active, true);
});

test('five-threshold decision returns an answer below answer threshold when lead is sufficient', () => {
  const decision = decideCandidates(
    [
      { knowledgePointId: 'kp-a', score: 0.7 },
      { knowledgePointId: 'kp-b', score: 0.55 }
    ],
    thresholds
  );

  assert.equal(decision.decision, 'matched');
  assert.equal(decision.knowledgePointId, 'kp-a');
  assert.equal(decision.reason, 'minimum-answer-with-clear-lead');
});

test('five-threshold decision returns ambiguity for close candidates above answer threshold', () => {
  const decision = decideCandidates(
    [
      { knowledgePointId: 'kp-a', score: 0.81 },
      { knowledgePointId: 'kp-b', score: 0.78 }
    ],
    thresholds
  );

  assert.equal(decision.decision, 'ambiguous');
  assert.equal(decision.reason, 'high-score-candidates-too-close');
});

test('two exact candidates with equal priority remain ambiguous', () => {
  const decision = decideCandidates(
    [
      { knowledgePointId: 'kp-a', score: 1, rulePriority: 100 },
      { knowledgePointId: 'kp-b', score: 1, rulePriority: 100 }
    ],
    thresholds
  );

  assert.equal(decision.decision, 'ambiguous');
  assert.deepEqual(decision.candidateIds, ['kp-a', 'kp-b']);
});

test('five-threshold decision returns suggestions when no answer condition is met', () => {
  const decision = decideCandidates(
    [
      { knowledgePointId: 'kp-a', score: 0.63 },
      { knowledgePointId: 'kp-b', score: 0.58 }
    ],
    thresholds
  );

  assert.equal(decision.decision, 'suggested');
  assert.deepEqual(decision.suggestionIds, ['kp-a']);
});

function actionableAppointmentSnapshot() {
  return {
    engineVersion: 'xiaoi-core-v1',
    modules: [{
      id: 'module-appointment',
      name: 'Appointment',
      enabled: true,
      priority: 100,
      thresholds
    }],
    lexicons: [{
      id: 'lex-time',
      name: '@time',
      standardTerm: '@time',
      aliases: [],
      dynamic: true,
      pattern: 'tomorrow(?:morning|afternoon)?',
      status: 'published'
    }],
    knowledgeItems: [{
      id: 'kp-book-branch',
      name: 'Book branch',
      moduleId: 'module-appointment',
      status: 'published',
      standardQuestion: 'book a branch',
      standardAnswer: 'Please confirm the appointment.',
      expandedQuestions: ['book a branch tomorrow afternoon'],
      channels: ['mobile'],
      slots: [{
        id: 'slot-time',
        name: 'appointment_time',
        lexiconId: 'lex-time',
        required: true,
        clarificationQuestion: 'What time would you like to book?'
      }],
      actionIds: ['action-book-branch']
    }],
    actions: [{
      id: 'action-book-branch',
      name: 'Open appointment',
      type: 'navigation',
      actionCode: 'open_branch_appointment',
      payload: {
        path: '/branch/appointment?time={appointment_time}'
      },
      inputMappings: [{
        parameter: 'appointment_time',
        source: 'slot',
        sourceKey: 'appointment_time',
        required: true
      }],
      channels: ['mobile'],
      status: 'published'
    }]
  };
}

test('a matched knowledge point asks for a missing required slot before resolving actions', () => {
  const result = recognizeKnowledge(actionableAppointmentSnapshot(), {
    query: 'book a branch',
    channel: 'mobile'
  });

  assert.equal(result.decision, 'clarification');
  assert.equal(result.knowledgePointId, 'kp-book-branch');
  assert.equal(result.answer, 'What time would you like to book?');
  assert.deepEqual(result.extractedSlots, {});
  assert.deepEqual(
    result.missingSlots.map((slot) => slot.name),
    ['appointment_time']
  );
  assert.deepEqual(result.actionIds, []);
  assert.deepEqual(result.actionInvocations, []);
});

test('slot values are mapped into a validated action invocation', () => {
  const result = recognizeKnowledge(actionableAppointmentSnapshot(), {
    query: 'book a branch tomorrow afternoon',
    channel: 'mobile'
  });

  assert.equal(result.decision, 'matched');
  assert.deepEqual(result.extractedSlots, {
    appointment_time: 'tomorrowafternoon'
  });
  assert.deepEqual(result.missingSlots, []);
  assert.deepEqual(result.actionIds, ['action-book-branch']);
  assert.deepEqual(result.actionInvocations, [{
    actionId: 'action-book-branch',
    actionCode: 'open_branch_appointment',
    type: 'navigation',
    parameters: {
      appointment_time: 'tomorrowafternoon'
    },
    payload: {
      path: '/branch/appointment?time=tomorrowafternoon'
    },
    valid: true,
    errors: []
  }]);
});
