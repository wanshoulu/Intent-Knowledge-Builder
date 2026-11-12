const test = require('node:test');
const assert = require('node:assert/strict');

const { recognizeSnapshot } = require('../src/recognizer');

function releaseWithAnswer(answer, version = 1) {
  return {
    id: `rel-${version}`,
    version,
    snapshot: {
      knowledgeItems: [
        {
          id: 'ki-repayment-date',
          name: '查询信用卡还款日',
          status: 'published',
          standardQuestion: '怎么查询信用卡还款日',
          standardAnswer: answer,
          expandedQuestions: ['查一下信用卡还款日期'],
          channels: ['mobile-banking'],
          answerVariants: [
            {
              id: 'answer-web',
              channel: 'web',
              content: 'Web 专用答案',
              actionIds: []
            }
          ],
          actionIds: ['action-open-bill']
        }
      ],
      actions: [
        {
          id: 'action-open-bill',
          status: 'published',
          channels: ['mobile-banking']
        }
      ],
      engineProfile: {
        answerThreshold: 0.58,
        suggestionThreshold: 0.35,
        ambiguityDelta: 0.08,
        defaultReply: '未找到答案'
      }
    }
  };
}

test('recognition response includes the immutable release identity', () => {
  const result = recognizeSnapshot(releaseWithAnswer('答案 A', 7), {
    query: '查一下信用卡还款日期',
    channel: 'mobile-banking'
  });

  assert.equal(result.decision, 'matched');
  assert.equal(result.knowledgeItemId, 'ki-repayment-date');
  assert.equal(result.answer, '答案 A');
  assert.deepEqual(result.actionIds, ['action-open-bill']);
  assert.equal(result.releaseId, 'rel-7');
  assert.equal(result.releaseVersion, 7);
});

test('channel mismatch does not leak another channel answer', () => {
  const result = recognizeSnapshot(releaseWithAnswer('通用答案'), {
    query: '怎么查询信用卡还款日',
    channel: 'wechat'
  });

  assert.equal(result.decision, 'rejected');
  assert.equal(result.answer, '未找到答案');
  assert.deepEqual(result.actionIds, []);
});

test('low confidence query is rejected with candidate diagnostics', () => {
  const result = recognizeSnapshot(releaseWithAnswer('答案 A'), {
    query: '今天天气怎么样',
    channel: 'mobile-banking'
  });

  assert.equal(result.decision, 'rejected');
  assert.equal(result.answer, '未找到答案');
  assert.ok(result.candidates[0].score < 0.58);
});

test('selects the most specific answer variant by channel, region and segment', () => {
  const release = releaseWithAnswer('通用答案');
  release.snapshot.knowledgeItems[0].answerVariants = [
    {
      id: 'answer-mobile',
      channel: 'mobile-banking',
      content: '手机银行通用答案',
      actionIds: []
    },
    {
      id: 'answer-shanghai-vip',
      channel: 'mobile-banking',
      region: '上海',
      segment: '贵宾客户',
      content: '上海贵宾专属答案',
      actionIds: ['action-vip-service']
    }
  ];
  release.snapshot.actions.push({
    id: 'action-vip-service',
    status: 'published',
    channels: ['mobile-banking']
  });

  const result = recognizeSnapshot(release, {
    query: '怎么查询信用卡还款日',
    channel: 'mobile-banking',
    dimensions: {
      region: '上海',
      segment: '贵宾客户'
    }
  });

  assert.equal(result.answer, '上海贵宾专属答案');
  assert.deepEqual(result.actionIds, [
    'action-open-bill',
    'action-vip-service'
  ]);
  assert.equal(result.trace.answerSelection.selectedVariantId, 'answer-shanghai-vip');
  assert.equal(result.trace.answerSelection.source, 'variant');
});

test('does not select a dimension-specific answer when request dimensions are absent', () => {
  const release = releaseWithAnswer('通用答案');
  release.snapshot.knowledgeItems[0].answerVariants = [
    {
      id: 'answer-shanghai',
      channel: 'mobile-banking',
      region: '上海',
      content: '上海专属答案',
      actionIds: []
    }
  ];

  const result = recognizeSnapshot(release, {
    query: '怎么查询信用卡还款日',
    channel: 'mobile-banking'
  });

  assert.equal(result.answer, '通用答案');
  assert.equal(result.trace.answerSelection.source, 'standard');
  assert.equal(result.trace.answerSelection.candidates[0].matched, false);
});
