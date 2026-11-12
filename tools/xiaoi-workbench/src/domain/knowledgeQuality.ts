import type { KnowledgeItem, QualityIssue, WorkbenchState } from './types';

export function evaluateKnowledgeQuality(item: KnowledgeItem, state: WorkbenchState) {
  const issues: QualityIssue[] = [];
  let score = 100;
  const add = (id: string, points: number, level: QualityIssue['level'], message: string) => {
    score -= points;
    issues.push({ id: `${item.id}-${id}`, level, message });
  };
  if (!item.standardQuestion.trim()) add('question', 40, 'blocking', '缺少标准问题');
  if (item.targetType !== 'task' && !item.standardAnswer.trim()) add('answer', 30, 'blocking', '缺少标准答案');
  if (item.validFrom && item.validTo && item.validFrom > item.validTo) add('validity', 20, 'blocking', '有效期开始时间晚于结束时间');
  const expressionIds = new Set(state.expressions.map((expression) => expression.id));
  if (item.expressionIds.some((id) => !expressionIds.has(id))) add('expression-ref', 10, 'blocking', '存在无效表达式引用');
  const hasTests = (item.expandedQuestionDefinitions ?? []).some((question) => question.testExamples?.length);
  if (!hasTests) add('tests', 10, 'warning', '尚未配置扩展问测试样例');
  return { score: Math.max(0, score), issues };
}
