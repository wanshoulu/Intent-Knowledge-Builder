import type {
  SemanticExpression,
  WorkbenchState
} from './types';
import { parseExpression } from '../engine/dslParser';
import { recognize } from '../engine/ruleEngine';
import { testExpression } from '../engine/ruleTesting';

export interface ExpressionQualityResult {
  blocking: string[];
  warnings: string[];
  passed: number;
  failed: number;
}

export type ExpressionConflictType =
  | 'duplicate'
  | 'positive_negative_overlap'
  | 'cross_target_overlap'
  | 'invalid_reference'
  | 'fallback_suppressed';

export interface ExpressionConflict {
  type: ExpressionConflictType;
  level: 'blocking' | 'warning';
  message: string;
  relatedExpressionId?: string;
}

export interface LexiconImpact {
  expressionCount: number;
  slotCount: number;
  knowledgeItemCount: number;
  expressionIds: string[];
  knowledgeItemIds: string[];
}

export function validateExpressionTestCases(
  expression: SemanticExpression,
  state: WorkbenchState
): ExpressionQualityResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  let passed = 0;
  let failed = 0;
  const testCases = (expression.testCases ?? []).filter((testCase) => testCase.enabled);
  if (!testCases.length) {
    warnings.push('尚未配置规则测试样例');
  }

  const testState: WorkbenchState = {
    ...state,
    expressions: state.expressions.some((item) => item.id === expression.id)
      ? state.expressions.map((item) =>
          item.id === expression.id ? expression : item
        )
      : [expression, ...state.expressions]
  };

  for (const testCase of testCases) {
    const single = testExpression(
      expression.dsl,
      testCase.query,
      state.lexicons,
      state.preprocessRules
    );
    let casePassed = false;
    let error = '';
    if (testCase.expectation === 'match') {
      casePassed = single.matched && expression.polarity !== 'negative';
      const missingRequiredTerms = single.terms
        .filter((term) => !term.optional && !term.matched)
        .map((term) => term.label);
      error = `关键正例未命中：${testCase.query}${
        missingRequiredTerms.length
          ? `；缺少必选业务词：${missingRequiredTerms.join('、')}`
          : ''
      }`;
    } else if (testCase.expectation === 'not_match') {
      casePassed = !single.matched;
      error = `反例被规则误命中：${testCase.query}`;
    } else if (testCase.expectation === 'exclude') {
      casePassed = single.matched && expression.polarity === 'negative';
      error = `排除样例未触发：${testCase.query}`;
    } else {
      const result = recognize(testCase.query, testState);
      casePassed = result.target?.id === testCase.expectedTargetId;
      error = `整链路目标不符合预期：${testCase.query}`;
    }

    if (casePassed) {
      passed += 1;
    } else {
      failed += 1;
      blocking.push(error);
    }
  }

  return { blocking, warnings, passed, failed };
}

function sameTargetSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id) => right.includes(id))
  );
}

function sharesTarget(left: string[], right: string[]): boolean {
  return left.some((id) => right.includes(id));
}

export function analyzeExpressionConflicts(
  candidate: SemanticExpression,
  state: WorkbenchState
): ExpressionConflict[] {
  const conflicts: ExpressionConflict[] = [];
  const knownLexicons = new Set(state.lexicons.map((lexicon) => lexicon.id));
  const missing = candidate.lexiconIds.filter((id) => !knownLexicons.has(id));
  if (missing.length) {
    conflicts.push({
      type: 'invalid_reference',
      level: 'blocking',
      message: `引用了不存在的业务词：${missing.join('、')}`
    });
  }

  for (const expression of state.expressions) {
    if (expression.id === candidate.id || expression.dsl !== candidate.dsl) continue;
    const samePolarity =
      (expression.polarity ?? 'positive') ===
      (candidate.polarity ?? 'positive');
    if (
      samePolarity &&
      sameTargetSet(expression.knowledgeItemIds, candidate.knowledgeItemIds)
    ) {
      conflicts.push({
        type: 'duplicate',
        level: 'warning',
        message: `与规则“${expression.name}”完全重复`,
        relatedExpressionId: expression.id
      });
    } else if (
      !samePolarity &&
      sharesTarget(expression.knowledgeItemIds, candidate.knowledgeItemIds)
    ) {
      conflicts.push({
        type: 'positive_negative_overlap',
        level: 'blocking',
        message: `与规则“${expression.name}”形成正负完全冲突`,
        relatedExpressionId: expression.id
      });
    } else if (
      samePolarity &&
      !sharesTarget(expression.knowledgeItemIds, candidate.knowledgeItemIds)
    ) {
      conflicts.push({
        type: 'cross_target_overlap',
        level: 'warning',
        message: `与其他知识目标规则“${expression.name}”条件相同`,
        relatedExpressionId: expression.id
      });
    }
  }

  try {
    if (parseExpression(candidate.dsl).mode === 'fallback') {
      const hasPrimary = state.expressions.some((expression) => {
        if (
          expression.id === candidate.id ||
          !sharesTarget(expression.knowledgeItemIds, candidate.knowledgeItemIds)
        ) {
          return false;
        }
        try {
          return parseExpression(expression.dsl).mode !== 'fallback';
        } catch {
          return false;
        }
      });
      if (hasPrimary) {
        conflicts.push({
          type: 'fallback_suppressed',
          level: 'warning',
          message: '当前目标已有主规则，候补规则只会在主规则均未命中时生效'
        });
      }
    }
  } catch {
    conflicts.push({
      type: 'invalid_reference',
      level: 'blocking',
      message: '技术表达式语法无效'
    });
  }

  return conflicts;
}

export function analyzeLexiconImpact(
  lexiconId: string,
  state: WorkbenchState
): LexiconImpact {
  const expressions = state.expressions.filter((expression) =>
    expression.lexiconIds.includes(lexiconId)
  );
  const slotItems = state.knowledgeItems.filter((item) =>
    (item.slots ?? []).some((slot) => slot.lexiconId === lexiconId)
  );
  const knowledgeItemIds = new Set([
    ...expressions.flatMap((expression) => expression.knowledgeItemIds),
    ...slotItems.map((item) => item.id)
  ]);
  return {
    expressionCount: expressions.length,
    slotCount: slotItems.reduce(
      (count, item) =>
        count +
        (item.slots ?? []).filter((slot) => slot.lexiconId === lexiconId).length,
      0
    ),
    knowledgeItemCount: knowledgeItemIds.size,
    expressionIds: expressions.map((expression) => expression.id),
    knowledgeItemIds: [...knowledgeItemIds]
  };
}
