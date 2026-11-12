import type { ExpressionTestCase } from './expressionBusiness';
import type {
  EvaluationSampleResult,
  SemanticExpression,
  WorkbenchState
} from './types';
import { recognize } from '../engine/ruleEngine';
import { testExpression } from '../engine/ruleTesting';

export interface WorkspaceRegressionResult {
  total: number;
  passed: number;
  failed: number;
  status: 'passed' | 'failed';
  samples: EvaluationSampleResult[];
}

function expressionCases(expression: SemanticExpression): ExpressionTestCase[] {
  if (expression.testCases?.length) {
    return expression.testCases.filter((testCase) => testCase.enabled);
  }
  return (expression.testExamples ?? []).map((query, index) => ({
    id: `${expression.id}-legacy-${index + 1}`,
    query,
    expectation: expression.polarity === 'negative' ? 'exclude' : 'match',
    enabled: true,
    source: 'regression'
  }));
}

function expectedLabel(testCase: ExpressionTestCase) {
  if (testCase.expectation === 'match') return '规则应命中';
  if (testCase.expectation === 'not_match') return '规则不应命中';
  if (testCase.expectation === 'exclude') return '排除规则应命中';
  return `目标：${testCase.expectedTargetId ?? '未配置'}`;
}

function runCase(
  expression: SemanticExpression,
  testCase: ExpressionTestCase,
  state: WorkbenchState
): EvaluationSampleResult {
  if (testCase.expectation === 'target') {
    const result = recognize(testCase.query, state, {
      channel: state.context.channel
    });
    const actualTarget = result.target?.id;
    const passed =
      Boolean(testCase.expectedTargetId) &&
      actualTarget === testCase.expectedTargetId;
    return {
      expressionId: expression.id,
      expressionName: expression.name,
      testCaseId: testCase.id,
      query: testCase.query,
      expectation: testCase.expectation,
      expected: expectedLabel(testCase),
      actual: `目标：${actualTarget ?? '未命中'}`,
      passed
    };
  }

  const result = testExpression(
    expression.dsl,
    testCase.query,
    state.lexicons,
    state.preprocessRules
  );
  const passed =
    testCase.expectation === 'not_match'
      ? !result.matched
      : testCase.expectation === 'exclude'
        ? result.matched && expression.polarity === 'negative'
        : result.matched && expression.polarity !== 'negative';
  return {
    expressionId: expression.id,
    expressionName: expression.name,
    testCaseId: testCase.id,
    query: testCase.query,
    expectation: testCase.expectation,
    expected: expectedLabel(testCase),
    actual: result.valid
      ? result.matched ? '规则已命中' : '规则未命中'
      : `规则无效：${result.error}`,
    passed
  };
}

export function runWorkspaceRegression(
  state: WorkbenchState
): WorkspaceRegressionResult {
  const samples = state.expressions
    .filter(
      (expression) =>
        expression.status !== 'disabled' && expression.status !== 'archived'
    )
    .flatMap((expression) =>
      expressionCases(expression).map((testCase) =>
        runCase(expression, testCase, state)
      )
    );
  const passed = samples.filter((sample) => sample.passed).length;
  const failed = samples.length - passed;
  return {
    total: samples.length,
    passed,
    failed,
    status: samples.length > 0 && failed === 0 ? 'passed' : 'failed',
    samples
  };
}
