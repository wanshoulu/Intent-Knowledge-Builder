import { classifyEvaluationSample, disabledSampleReason } from '../src/domain/evaluationSampleClassification';
import type { PersistedEvaluationSample } from '../src/domain/types';

const sample = (patch: Partial<PersistedEvaluationSample>): PersistedEvaluationSample => ({
  id: 'sample-1', query: '测试', enabled: true, expectedDecision: 'matched',
  source: 'imported', relatedObjectIds: [], tags: [], ...patch
});

describe('评测样例分类', () => {
  it('区分真实、模板、拒识和混淆样例', () => {
    expect(classifyEvaluationSample(sample({ tags: ['real-test-example'] }))).toBe('真实测试样例');
    expect(classifyEvaluationSample(sample({ tags: ['template-derived'] }))).toBe('模板结构样例');
    expect(classifyEvaluationSample(sample({ expectedDecision: 'rejected' }))).toBe('拒识样例');
    expect(classifyEvaluationSample(sample({ tags: ['confusion-case'] }))).toBe('混淆样例');
  });

  it('解释被暂停样例的原因', () => {
    expect(disabledSampleReason(sample({ enabled: false, tags: ['blocked-source-dsl'] })))
      .toBe('来源 DSL 不完整，等待修复');
  });
});
