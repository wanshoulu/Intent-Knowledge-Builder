import { Alert, Button, Card, Form, Input, Space, Statistic } from 'antd';
import { useEffect, useState } from 'react';
import type { BusinessConcept } from '../domain/types';
import { validateDsl } from '../engine/ruleTesting';

interface ConceptSemanticEditorProps {
  concept: BusinessConcept;
  referencedKnowledgeCount: number;
  referencedExpressionCount: number;
  onSave: (patch: Partial<BusinessConcept>) => void;
}

type SemanticFields = Pick<
  BusinessConcept,
  'knowledgeAttribute' | 'semanticBlock' | 'auxiliarySemanticBlock' | 'extendedSemanticBlock'
>;

function fieldsFromConcept(concept: BusinessConcept): SemanticFields {
  return {
    knowledgeAttribute: concept.knowledgeAttribute ?? '',
    semanticBlock: concept.semanticBlock ?? '',
    auxiliarySemanticBlock: concept.auxiliarySemanticBlock ?? '',
    extendedSemanticBlock: concept.extendedSemanticBlock ?? ''
  };
}

export function ConceptSemanticEditor({
  concept,
  referencedKnowledgeCount,
  referencedExpressionCount,
  onSave
}: ConceptSemanticEditorProps) {
  const [fields, setFields] = useState<SemanticFields>(() => fieldsFromConcept(concept));

  useEffect(() => setFields(fieldsFromConcept(concept)), [concept.id]);

  const validations = [
    fields.semanticBlock,
    fields.auxiliarySemanticBlock,
    fields.extendedSemanticBlock
  ].filter((value): value is string => Boolean(value)).map(validateDsl);
  const firstError = validations.find((result) => !result.valid)?.error;

  const update = (patch: Partial<SemanticFields>) => {
    setFields((current) => ({ ...current, ...patch }));
  };

  return (
    <Card size="small" title="语义块与知识属性" className="section-card">
      <Alert
        type="info"
        showIcon
        message="这里维护的是小 i 业务概念的可复用语义配置，不是 OWL/RDF 本体，也不会以描述文本直接参与识别。"
      />
      <Form layout="vertical">
        <Form.Item label="知识属性">
          <Input
            aria-label="概念知识属性"
            value={fields.knowledgeAttribute}
            onChange={(event) => update({ knowledgeAttribute: event.target.value })}
          />
        </Form.Item>
        <Form.Item label="主语义块" validateStatus={firstError ? 'error' : undefined} help={firstError}>
          <Input.TextArea
            aria-label="主语义块"
            rows={3}
            value={fields.semanticBlock}
            onChange={(event) => update({ semanticBlock: event.target.value })}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="辅助语义块">
            <Input.TextArea
              aria-label="辅助语义块"
              rows={3}
              value={fields.auxiliarySemanticBlock}
              onChange={(event) => update({ auxiliarySemanticBlock: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="扩展语义块">
            <Input.TextArea
              aria-label="扩展语义块"
              rows={3}
              value={fields.extendedSemanticBlock}
              onChange={(event) => update({ extendedSemanticBlock: event.target.value })}
            />
          </Form.Item>
        </div>
        <Space size="large">
          <Statistic title="引用知识点" value={referencedKnowledgeCount} />
          <Statistic title="引用表达式" value={referencedExpressionCount} />
          <Button
            type="primary"
            disabled={Boolean(firstError)}
            onClick={() => onSave(fields)}
          >
            保存语义配置
          </Button>
        </Space>
      </Form>
    </Card>
  );
}
