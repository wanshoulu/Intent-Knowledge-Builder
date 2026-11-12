import type { LexiconClass } from '../domain/types';
import { parseExpression } from './dslParser';
import {
  testExpression,
  validateDsl,
  validateExpressionReferences
} from './ruleTesting';

export interface DslInspectionCase {
  query: string;
  kind: 'positive' | 'negative';
  passed: boolean;
}

export interface DslInspection {
  valid: boolean;
  syntaxValid: boolean;
  referencesValid: boolean;
  explanation: string;
  passed: number;
  failed: number;
  issues: string[];
  cases: DslInspectionCase[];
}

const modeLabels = {
  normal: '普通规则',
  boost: '增强匹配',
  exact: '完全匹配',
  fallback: '候补匹配'
} as const;

function explainDsl(dsl: string): string {
  const parsed = parseExpression(dsl);
  const terms = parsed.terms.map((term) => {
    const names = term.alternatives.join(' 或 ');
    return term.optional ? `${names}（可选）` : names;
  });
  return `需要识别：${terms.join('、')}；${
    parsed.ordered ? '要求按配置顺序出现' : '业务词顺序不限'
  }；采用${modeLabels[parsed.mode]}。`;
}

export function inspectDsl(
  dsl: string,
  lexicons: LexiconClass[],
  positiveExamples: string[],
  negativeExamples: string[]
): DslInspection {
  const syntax = validateDsl(dsl);
  if (!syntax.valid) {
    return {
      valid: false,
      syntaxValid: false,
      referencesValid: false,
      explanation: '',
      passed: 0,
      failed: positiveExamples.length + negativeExamples.length,
      issues: [syntax.error ?? 'DSL 语法无效'],
      cases: []
    };
  }

  const references = validateExpressionReferences(dsl, lexicons);
  if (!references.valid) {
    return {
      valid: false,
      syntaxValid: true,
      referencesValid: false,
      explanation: explainDsl(dsl),
      passed: 0,
      failed: positiveExamples.length + negativeExamples.length,
      issues: [references.error ?? '业务词引用无效'],
      cases: []
    };
  }

  const positiveCases = positiveExamples.map((query): DslInspectionCase => ({
    query,
    kind: 'positive',
    passed: testExpression(dsl, query, lexicons).matched
  }));
  const negativeCases = negativeExamples.map((query): DslInspectionCase => ({
    query,
    kind: 'negative',
    passed: !testExpression(dsl, query, lexicons).matched
  }));
  const cases = [...positiveCases, ...negativeCases];
  const issues = cases
    .filter((item) => !item.passed)
    .map((item) =>
      item.kind === 'positive'
        ? `正例未命中：${item.query}`
        : `反例被错误命中：${item.query}`
    );

  return {
    valid: issues.length === 0,
    syntaxValid: true,
    referencesValid: true,
    explanation: explainDsl(dsl),
    passed: cases.filter((item) => item.passed).length,
    failed: cases.filter((item) => !item.passed).length,
    issues,
    cases
  };
}
