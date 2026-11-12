import { Alert, Form, Input } from 'antd';
import type { LexiconClass } from '../domain/types';
import {
  validateDsl,
  validateExpressionReferences
} from '../engine/ruleTesting';
import { XIAOI_DSL_SYNTAX } from '../domain/ruleSyntax';
import { AiRuleAssistant } from './AiRuleAssistant';

interface ExpressionExpertEditorProps {
  dsl: string;
  visualSummary: string;
  lexicons: LexiconClass[];
  purpose: 'positive' | 'negative';
  description?: string;
  positiveExamples?: string[];
  negativeExamples?: string[];
  conversionReason?: string;
  onDslChange: (dsl: string) => void;
  onAiApply?: (dsl: string) => void;
  onSummaryChange: (visualSummary: string) => void;
}

export function ExpressionExpertEditor({
  dsl,
  visualSummary,
  lexicons,
  purpose,
  description,
  positiveExamples,
  negativeExamples,
  conversionReason,
  onDslChange,
  onAiApply,
  onSummaryChange
}: ExpressionExpertEditorProps) {
  const syntax = validateDsl(dsl);
  const validation = syntax.valid
    ? validateExpressionReferences(dsl, lexicons)
    : syntax;

  return (
    <div className="expert-expression-editor">
      {conversionReason && validation.valid ? (
        <Alert
          type="warning"
          showIcon
          message="该规则保留在专家模式"
          description={conversionReason}
        />
      ) : null}
      <div className="ai-assistant-toolbar">
        <AiRuleAssistant
          kind="dsl"
          value={dsl}
          purpose={purpose}
          description={description}
          lexicons={lexicons}
          positiveExamples={positiveExamples}
          negativeExamples={negativeExamples}
          onApply={onAiApply ?? onDslChange}
        />
        <span>可生成、解释、检查和修复当前 DSL</span>
      </div>
      <Form.Item
        label="小 i 语义规则表达式（DSL）"
        required
        validateStatus={validation.valid ? 'success' : 'error'}
        help={
          validation.valid
            ? 'DSL 语法及业务词引用有效；这是语义规则表达式，不是正则表达式'
            : `DSL 校验失败：${validation.error}`
        }
      >
        <Input.TextArea
          aria-label="DSL 表达式"
          className="dsl-input"
          rows={4}
          value={dsl}
          onChange={(event) => onDslChange(event.target.value)}
        />
      </Form.Item>
      <Form.Item label="规则说明">
        <Input
          aria-label="可视化摘要"
          value={visualSummary}
          onChange={(event) => onSummaryChange(event.target.value)}
        />
      </Form.Item>
      <div className="dsl-help">
        {XIAOI_DSL_SYNTAX.map((item) => (
          <span key={item.symbol}>
            <code>{item.symbol}</code> {item.description}
          </span>
        ))}
      </div>
    </div>
  );
}
