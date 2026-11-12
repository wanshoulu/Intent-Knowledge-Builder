import type { PersistedEvaluationSample } from './types';

export type EvaluationSampleCategory =
  | '真实测试样例'
  | '模板结构样例'
  | '拒识样例'
  | '混淆样例'
  | '标准问题样例';

export function classifyEvaluationSample(
  sample: PersistedEvaluationSample
): EvaluationSampleCategory {
  const tags = new Set(sample.tags ?? []);
  if (sample.expectedDecision === 'rejected') return '拒识样例';
  if (tags.has('confusion-case') || tags.has('confusion')) return '混淆样例';
  if (tags.has('real-test-example')) return '真实测试样例';
  if (tags.has('template-derived')) return '模板结构样例';
  return '标准问题样例';
}

export function disabledSampleReason(sample: PersistedEvaluationSample) {
  if (sample.enabled !== false) return '';
  const tags = new Set(sample.tags ?? []);
  if (tags.has('blocked-source-dsl')) return '来源 DSL 不完整，等待修复';
  if (tags.has('invalid-source-test-example')) return '来源测试样例无效';
  const reason = (sample.tags ?? []).find((tag) => tag.startsWith('disabled-reason:'));
  return reason?.slice('disabled-reason:'.length) || '样例已停用，未提供原因';
}
