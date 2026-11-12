import { seedState } from '../src/data/seed';
import { applyExpressionUpdate } from '../src/domain/expressionBindings';

describe('表达式与知识目标绑定', () => {
  it('原子同步表达式和知识点的正负引用', () => {
    const state = structuredClone(seedState);
    const next = applyExpressionUpdate(state, 'exp-credit-repayment-date', {
      knowledgeItemIds: ['ki-payroll-detail'],
      polarity: 'negative'
    });
    const oldTarget = next.knowledgeItems.find(
      (item) => item.id === 'ki-credit-repayment-date'
    )!;
    const newTarget = next.knowledgeItems.find(
      (item) => item.id === 'ki-payroll-detail'
    )!;
    const expression = next.expressions.find(
      (item) => item.id === 'exp-credit-repayment-date'
    )!;

    expect(expression.knowledgeItemIds).toEqual(['ki-payroll-detail']);
    expect(oldTarget.expressionIds).not.toContain('exp-credit-repayment-date');
    expect(oldTarget.positiveExpressionIds).not.toContain('exp-credit-repayment-date');
    expect(newTarget.expressionIds).toContain('exp-credit-repayment-date');
    expect(newTarget.negativeExpressionIds).toContain('exp-credit-repayment-date');
    expect(newTarget.positiveExpressionIds).not.toContain('exp-credit-repayment-date');
  });
});
