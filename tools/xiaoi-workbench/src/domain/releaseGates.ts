import type { ReleaseGateInput } from './types';

export interface ReleaseGateResult {
  blocked: boolean;
  reasons: string[];
}

export function evaluateReleaseGates(input: ReleaseGateInput): ReleaseGateResult {
  const reasons: string[] = [];

  if (!input.requiredFieldsComplete) reasons.push('必填信息不完整');
  if (!input.referencesValid) reasons.push('存在无效引用');
  if (input.blockingConflicts > 0) reasons.push(`存在 ${input.blockingConflicts} 个阻断冲突`);
  if (!input.regressionPassed) reasons.push('关键回归未通过');
  if (!input.reviewApproved) reasons.push('审批尚未完成');

  return {
    blocked: reasons.length > 0,
    reasons
  };
}
