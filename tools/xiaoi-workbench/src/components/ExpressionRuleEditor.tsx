import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Radio,
  Segmented,
  Select,
  Space,
  Tag
} from 'antd';
import { useEffect, useState } from 'react';
import {
  createDefaultBusinessConfig,
  type ExpressionBusinessConfig,
  type ExpressionPurpose
} from '../domain/expressionBusiness';
import type {
  KnowledgeItem,
  LexiconClass,
  PreprocessRule,
  SemanticExpression
  , WorkbenchState
} from '../domain/types';
import { validateExpressionTestCases } from '../domain/expressionQuality';
import {
  compileBusinessExpression,
  roundTripBusinessExpression
} from '../engine/expressionBusinessCompiler';
import {
  testExpression,
  validateDsl,
  validateExpressionReferences,
  type ExpressionTestResult
} from '../engine/ruleTesting';
import { ExpressionBusinessEditor } from './ExpressionBusinessEditor';
import { ExpressionExpertEditor } from './ExpressionExpertEditor';
import { ExpressionTestCaseEditor } from './ExpressionTestCaseEditor';

interface ExpressionRuleEditorProps {
  expression: SemanticExpression;
  lexicons: LexiconClass[];
  preprocessRules?: PreprocessRule[];
  knowledgeItems: KnowledgeItem[];
  onSave: (patch: Partial<SemanticExpression>) => void;
  onCreateLexicon?: (lexicon: LexiconClass) => void;
  workbenchState?: WorkbenchState;
}

interface InitializedExpression {
  draft: SemanticExpression & { businessConfig: ExpressionBusinessConfig };
  conversionReason: string;
}

function initializeExpression(
  expression: SemanticExpression,
  lexicons: LexiconClass[]
): InitializedExpression {
  const testCases =
    expression.testCases ??
    (expression.testExamples ?? []).map((query, index) => ({
      id: `legacy-${expression.id}-${index + 1}`,
      query,
      expectation:
        expression.polarity === 'negative' ? 'exclude' as const : 'match' as const,
      enabled: true,
      source: 'manual' as const
    }));
  if (expression.businessConfig?.schemaVersion === 2) {
    return {
      draft: {
        ...expression,
        testCases,
        businessConfig: structuredClone(expression.businessConfig)
      },
      conversionReason: ''
    };
  }

  const purpose = expression.polarity ?? 'positive';
  const conversion = roundTripBusinessExpression(
    expression.dsl,
    lexicons,
    purpose
  );
  if (conversion.convertible) {
    return {
      draft: {
        ...expression,
        testCases,
        businessConfig: conversion.config
      },
      conversionReason: ''
    };
  }

  return {
    draft: {
      ...expression,
      testCases,
      businessConfig: {
        ...createDefaultBusinessConfig(purpose),
        editorMode: 'expert',
        customized: true
      }
    },
    conversionReason: conversion.reason
  };
}

function referencedLexiconIds(
  dsl: string,
  lexicons: LexiconClass[]
): string[] {
  const names = new Set(
    dsl
      .match(/\[([^\]]+)\]/g)
      ?.flatMap((value) =>
        value
          .slice(1, -1)
          .replace(/\?$/, '')
          .split('|')
          .map((name) => name.trim())
      ) ?? []
  );
  return lexicons
    .filter((lexicon) => names.has(lexicon.name))
    .map((lexicon) => lexicon.id);
}

export function ExpressionRuleEditor({
  expression,
  lexicons,
  preprocessRules,
  knowledgeItems,
  onSave,
  onCreateLexicon,
  workbenchState
}: ExpressionRuleEditorProps) {
  const initial = initializeExpression(expression, lexicons);
  const [draft, setDraft] = useState(initial.draft);
  const [conversionReason, setConversionReason] = useState(
    initial.conversionReason
  );
  const [testQuery, setTestQuery] = useState(
    expression.testCases?.find((testCase) => testCase.enabled)?.query ??
      expression.testExamples?.[0] ??
      ''
  );
  const [result, setResult] = useState<ExpressionTestResult | null>(null);

  useEffect(() => {
    const next = initializeExpression(expression, lexicons);
    setDraft(next.draft);
    setConversionReason(next.conversionReason);
    setTestQuery(
      expression.testCases?.find((testCase) => testCase.enabled)?.query ??
        expression.testExamples?.[0] ??
        ''
    );
    setResult(null);
  }, [expression, lexicons]);

  const mode = draft.businessConfig.editorMode;
  let businessPreview:
    | ReturnType<typeof compileBusinessExpression>
    | undefined;
  let businessError = '';
  if (mode === 'business') {
    try {
      businessPreview = compileBusinessExpression(
        draft.businessConfig,
        lexicons
      );
    } catch (caught) {
      businessError =
        caught instanceof Error ? caught.message : '业务条件尚未完整';
    }
  }
  const syntax = validateDsl(draft.dsl);
  const expertValidation = syntax.valid
    ? validateExpressionReferences(draft.dsl, lexicons)
    : syntax;
  const saveDisabled =
    !draft.name.trim() ||
    draft.knowledgeItemIds.length === 0 ||
    (mode === 'business' ? !businessPreview : !expertValidation.valid);

  const switchMode = (nextMode: string | number) => {
    if (nextMode === mode) return;
    if (nextMode === 'expert') {
      const compiled = businessPreview;
      setDraft({
        ...draft,
        ...(compiled
          ? {
              dsl: compiled.dsl,
              lexiconIds: compiled.lexiconIds,
              polarity: compiled.polarity,
              visualSummary: compiled.explanation
            }
          : {}),
        businessConfig: {
          ...draft.businessConfig,
          editorMode: 'expert'
        }
      });
      setConversionReason('');
      setResult(null);
      return;
    }

    const conversion = roundTripBusinessExpression(
      draft.dsl,
      lexicons,
      draft.polarity ?? 'positive'
    );
    if (!conversion.convertible) {
      setConversionReason(conversion.reason);
      return;
    }
    setDraft({
      ...draft,
      businessConfig: {
        ...conversion.config,
        editorMode: 'business'
      }
    });
    setConversionReason('');
    setResult(null);
  };

  const changePurpose = (purpose: ExpressionPurpose) => {
    const current = draft.businessConfig;
    setDraft({
      ...draft,
      polarity: purpose,
      businessConfig:
        purpose === 'negative'
          ? {
              ...current,
              purpose,
              contextLexiconIds:
                current.contextLexiconIds?.length
                  ? current.contextLexiconIds
                  : current.requiredLexiconIds,
              exclusionLexiconIds: current.exclusionLexiconIds ?? []
            }
          : { ...current, purpose }
    });
    setResult(null);
  };

  const enabledCases = draft.testCases?.filter((testCase) => testCase.enabled) ?? [];
  const positiveExamples = enabledCases
    .filter(
      (testCase) =>
        testCase.expectation === 'match' || testCase.expectation === 'target'
    )
    .map((testCase) => testCase.query);
  const negativeExamples = enabledCases
    .filter(
      (testCase) =>
        testCase.expectation === 'not_match' ||
        testCase.expectation === 'exclude'
    )
    .map((testCase) => testCase.query);

  const applyAiDsl = (dsl: string) => {
    const conversion = roundTripBusinessExpression(
      dsl,
      lexicons,
      draft.businessConfig.purpose
    );
    setDraft({
      ...draft,
      dsl,
      businessConfig: conversion.convertible
        ? conversion.config
        : {
            ...draft.businessConfig,
            editorMode: 'expert',
            customized: true
          }
    });
    setConversionReason(conversion.convertible ? '' : conversion.reason);
    setResult(null);
  };

  const save = () => {
    if (mode === 'business') {
      if (!businessPreview) return;
      onSave({
        ...draft,
        dsl: businessPreview.dsl,
        lexiconIds: businessPreview.lexiconIds,
        polarity: businessPreview.polarity,
        visualSummary: businessPreview.explanation,
        businessConfig: {
          ...draft.businessConfig,
          editorMode: 'business',
          customized: false
        },
        revision: (draft.revision ?? 0) + 1,
        status: 'draft'
      });
      return;
    }
    if (!expertValidation.valid) return;
    onSave({
      ...draft,
      lexiconIds: referencedLexiconIds(draft.dsl, lexicons),
      businessConfig: {
        ...draft.businessConfig,
        editorMode: 'expert',
        customized: true
      },
      revision: (draft.revision ?? 0) + 1,
      status: 'draft'
    });
  };

  const run = () => {
    const dsl = mode === 'business' ? businessPreview?.dsl ?? '' : draft.dsl;
    setResult(testExpression(dsl, testQuery, lexicons, preprocessRules));
  };

  return (
    <div className="rule-editor expression-rule-workspace">
      <div className="rule-editor-heading">
        <div>
          <Tag color={draft.businessConfig.purpose === 'negative' ? 'red' : 'green'}>
            {draft.businessConfig.purpose === 'negative' ? '排除规则' : '识别规则'}
          </Tag>
          <h3>{draft.name}</h3>
        </div>
        <Button
          type="primary"
          aria-label="保存规则"
          disabled={saveDisabled}
          onClick={save}
        >
          保存规则
        </Button>
      </div>

      <div className="expression-mode-switch">
        <Segmented
          value={mode}
          options={[
            { label: '业务模式', value: 'business' },
            { label: '专家模式', value: 'expert' }
          ]}
          onChange={switchMode}
        />
        <span>
          {mode === 'business'
            ? '使用中文条件维护，系统自动生成技术表达式'
            : '直接维护小 i 技术表达式'}
        </span>
      </div>

      <Form layout="vertical">
        <Form.Item label="规则名称" required>
          <Input
            aria-label="规则名称"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="规则用途">
            <Radio.Group
              aria-label="规则用途"
              value={draft.businessConfig.purpose}
              disabled={mode === 'expert'}
              onChange={(event) => changePurpose(event.target.value)}
            >
              <Radio.Button value="positive">识别规则</Radio.Button>
              <Radio.Button value="negative">排除规则</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="优先级">
            <InputNumber
              aria-label="优先级"
              min={0}
              value={draft.priority}
              onChange={(value) =>
                setDraft({ ...draft, priority: value ?? 100 })
              }
            />
          </Form.Item>
        </div>

        {mode === 'business' ? (
          <ExpressionBusinessEditor
            config={draft.businessConfig}
            lexicons={lexicons}
            description={draft.name}
            positiveExamples={positiveExamples}
            negativeExamples={negativeExamples}
            onCreateLexicon={onCreateLexicon}
            onChange={(businessConfig) => {
              setDraft({ ...draft, businessConfig });
              setResult(null);
            }}
          />
        ) : (
          <ExpressionExpertEditor
            dsl={draft.dsl}
            visualSummary={draft.visualSummary}
            lexicons={lexicons}
            purpose={draft.businessConfig.purpose}
            description={draft.name}
            positiveExamples={positiveExamples}
            negativeExamples={negativeExamples}
            conversionReason={conversionReason}
            onDslChange={(dsl) => {
              setDraft({ ...draft, dsl });
              setConversionReason('');
              setResult(null);
            }}
            onAiApply={applyAiDsl}
            onSummaryChange={(visualSummary) =>
              setDraft({ ...draft, visualSummary })
            }
          />
        )}

        <Form.Item
          label="绑定知识目标"
          required
          help={
            draft.knowledgeItemIds.length
              ? '规则保存后会同步知识目标引用'
              : '至少绑定一个 FAQ 或任务意图'
          }
          validateStatus={draft.knowledgeItemIds.length ? 'success' : 'error'}
        >
          <Select
            aria-label="绑定知识目标"
            mode="multiple"
            showSearch
            optionFilterProp="label"
            value={draft.knowledgeItemIds}
            options={knowledgeItems
              .filter(
                (item) =>
                  item.status !== 'disabled' && item.status !== 'archived'
              )
              .map((item) => ({
                value: item.id,
                label: `${item.name} · ${
                  item.targetType === 'task' ? '任务意图' : 'FAQ'
                }`
              }))}
            onChange={(knowledgeItemIds) =>
              setDraft({ ...draft, knowledgeItemIds })
            }
          />
        </Form.Item>
      </Form>

      <ExpressionTestCaseEditor
        testCases={draft.testCases ?? []}
        knowledgeItems={knowledgeItems}
        onChange={(testCases) => setDraft({ ...draft, testCases })}
        onRunAll={() => {
          const dsl =
            mode === 'business' ? businessPreview?.dsl ?? '' : draft.dsl;
          if (!workbenchState || !dsl) {
            return {
              passed: 0,
              failed: 0,
              blocking: [],
              warnings: ['当前页面缺少整链路测试上下文']
            };
          }
          return validateExpressionTestCases(
            {
              ...draft,
              dsl,
              lexiconIds:
                mode === 'business'
                  ? businessPreview?.lexiconIds ?? []
                  : referencedLexiconIds(dsl, lexicons)
            },
            workbenchState
          );
        }}
      />

      {businessError ? (
        <Alert
          className="editor-alert"
          type="warning"
          showIcon
          message="业务条件尚未完整"
          description={businessError}
        />
      ) : null}

      <div className="single-rule-test">
        <h4>表达式匹配测试</h4>
        <p className="secondary-text">
          仅验证当前表达式是否匹配输入文本，不执行知识点竞争和答案阈值判断。
        </p>
        <Space.Compact block>
          <Input
            aria-label="表达式匹配测试语句"
            value={testQuery}
            placeholder="输入用户可能会说的话"
            onChange={(event) => {
              setTestQuery(event.target.value);
              setResult(null);
            }}
            onPressEnter={run}
          />
          <Button
            aria-label="运行表达式匹配测试"
            disabled={
              !testQuery.trim() ||
              (mode === 'business' ? !businessPreview : !expertValidation.valid)
            }
            onClick={run}
          >
            运行表达式匹配测试
          </Button>
        </Space.Compact>
        {result ? (
          <Alert
            className="rule-test-result"
            type={result.matched ? 'success' : 'warning'}
            showIcon
            message={result.matched ? '规则命中' : '规则未命中'}
            description={
              <div>
                {result.terms
                  .filter((term) => term.matched && !term.optional)
                  .map((term) => (
                    <p key={`matched-${term.label}`}>已满足：{term.label}</p>
                  ))}
                {result.terms
                  .filter((term) => !term.matched && !term.optional)
                  .map((term) => (
                    <p key={`missing-${term.label}`}>还缺少：{term.label}</p>
                  ))}
                {result.terms
                  .filter((term) => term.optional)
                  .map((term) => (
                    <p key={`optional-${term.label}`}>
                      可选内容：{term.label} · {term.matched ? '已出现' : '未出现，不影响命中'}
                    </p>
                  ))}
                <details>
                  <summary>查看技术详情</summary>
                  <p>标准化文本：{result.normalizedText}</p>
                  <p>模板模式：{result.matchMode}</p>
                  <p>模板相似度：{result.scoreDelta.toFixed(2)}</p>
                  {result.rawScore !== undefined &&
                  result.rawScore !== result.scoreDelta ? (
                    <p>增强前基础分：{result.rawScore.toFixed(2)}</p>
                  ) : null}
                  {result.components ? (
                    <p>
                      必选覆盖 {result.components.requiredCoverage.toFixed(2)}
                      {' · '}语义精度 {result.components.semanticPrecision.toFixed(2)}
                      {' · '}可选词覆盖 {result.components.optionalCoverage.toFixed(2)}
                    </p>
                  ) : null}
                </details>
              </div>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
