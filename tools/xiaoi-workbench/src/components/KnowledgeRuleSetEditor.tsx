import {
  CopyOutlined,
  DisconnectOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { Button, Card, Drawer, Empty, Space, Tag, message } from 'antd';
import { useState } from 'react';
import { createDefaultBusinessConfig } from '../domain/expressionBusiness';
import type {
  KnowledgeItem,
  SemanticExpression
} from '../domain/types';
import {
  compileBusinessExpression,
  roundTripBusinessExpression
} from '../engine/expressionBusinessCompiler';
import { useWorkbench } from '../state/WorkbenchProvider';
import { ExpressionRuleEditor } from './ExpressionRuleEditor';
import { StatusTag } from './StatusTag';

interface KnowledgeRuleSetEditorProps {
  knowledgeItem: KnowledgeItem;
  purpose: 'positive' | 'negative';
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function explainExpression(
  expression: SemanticExpression,
  lexicons: ReturnType<typeof useWorkbench>['state']['lexicons']
): string {
  if (expression.businessConfig?.schemaVersion === 2) {
    try {
      return compileBusinessExpression(expression.businessConfig, lexicons)
        .explanation;
    } catch {
      return expression.visualSummary;
    }
  }

  const conversion = roundTripBusinessExpression(
    expression.dsl,
    lexicons,
    expression.polarity ?? 'positive'
  );
  if (conversion.convertible) {
    try {
      return compileBusinessExpression(conversion.config, lexicons).explanation;
    } catch {
      return expression.visualSummary;
    }
  }
  return expression.visualSummary;
}

export function KnowledgeRuleSetEditor({
  knowledgeItem,
  purpose
}: KnowledgeRuleSetEditorProps) {
  const {
    state,
    addExpression,
    addLexicon,
    updateExpression
  } = useWorkbench();
  const [editingId, setEditingId] = useState<string>();
  const [creatingId, setCreatingId] = useState<string>();
  const [messageApi, contextHolder] = message.useMessage();
  const expressions = state.expressions.filter(
    (expression) =>
      expression.knowledgeItemIds.includes(knowledgeItem.id) &&
      (expression.polarity ?? 'positive') === purpose
  );
  const editingExpression = state.expressions.find(
    (expression) => expression.id === editingId
  );
  const noun = purpose === 'positive' ? '识别规则' : '排除规则';
  const legacyName = purpose === 'positive' ? '肯定模板' : '否定模板';

  const createExpression = () => {
    const id = createId('exp');
    const config = createDefaultBusinessConfig(purpose);
    if (purpose === 'positive' && knowledgeItem.lexiconIds[0]) {
      config.requiredLexiconIds = [knowledgeItem.lexiconIds[0]];
    }
    const expression: SemanticExpression = {
      id,
      name: `未命名${noun}`,
      dsl: '',
      visualSummary: '',
      lexiconIds: [...config.requiredLexiconIds],
      knowledgeItemIds: [knowledgeItem.id],
      priority: 100,
      status: 'draft',
      polarity: purpose,
      testCases: [],
      businessConfig: config,
      revision: 0
    };
    addExpression(expression);
    setCreatingId(id);
    setEditingId(id);
  };

  const duplicateExpression = (expression: SemanticExpression) => {
    const id = createId('exp');
    addExpression({
      ...expression,
      id,
      name: `${expression.name} 副本`,
      status: 'draft',
      revision: 0,
      businessConfig: expression.businessConfig
        ? structuredClone(expression.businessConfig)
        : undefined,
      testCases: expression.testCases?.map((testCase) => ({
        ...testCase,
        id: createId('case')
      }))
    });
    messageApi.success('已复制为草稿规则');
  };

  const unbindExpression = (expression: SemanticExpression) => {
    updateExpression(expression.id, {
      knowledgeItemIds: expression.knowledgeItemIds.filter(
        (id) => id !== knowledgeItem.id
      )
    });
    messageApi.success('已从当前知识点解绑');
  };

  return (
    <div className="rule-set-panel">
      {contextHolder}
      <div className="structured-list-header">
        <div>
          <h3>{noun}（{legacyName}）</h3>
          <p>
            {purpose === 'positive'
              ? '定义用户怎样表达时命中当前知识点，对应小 i 的肯定模板。'
              : '定义哪些说法需要排除当前知识点，对应小 i 的否定模板。'}
          </p>
        </div>
        <Button
          type="primary"
          aria-label={`新建${noun}`}
          icon={<PlusOutlined />}
          onClick={createExpression}
        >
          新建
        </Button>
      </div>

      {expressions.length ? (
        <div className="expression-rule-card-list">
          {expressions.map((expression) => (
            <Card
              key={expression.id}
              size="small"
              className="expression-rule-card"
              title={
                <Space wrap>
                  <span>{expression.name}</span>
                  <StatusTag status={expression.status} />
                </Space>
              }
              extra={<Tag>优先级 {expression.priority}</Tag>}
            >
              <p className="expression-business-summary">
                {explainExpression(expression, state.lexicons) ||
                  '尚未生成业务说明，请进入编辑器完善条件。'}
              </p>
              <Space wrap>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => setEditingId(expression.id)}
                >
                  编辑
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => duplicateExpression(expression)}
                >
                  复制
                </Button>
                <Button
                  icon={<PauseCircleOutlined />}
                  disabled={expression.status === 'disabled'}
                  onClick={() =>
                    updateExpression(expression.id, { status: 'disabled' })
                  }
                >
                  停用
                </Button>
                <Button
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={() => unbindExpression(expression)}
                >
                  解绑
                </Button>
              </Space>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`当前知识点暂无${noun}`}
        />
      )}

      <Drawer
        title={editingId === creatingId ? `新建${noun}` : '规则编辑'}
        width={720}
        open={Boolean(editingExpression)}
        destroyOnClose
        onClose={() => {
          setEditingId(undefined);
          setCreatingId(undefined);
        }}
      >
        {editingExpression ? (
          <ExpressionRuleEditor
            expression={editingExpression}
            lexicons={state.lexicons}
            preprocessRules={state.preprocessRules}
            knowledgeItems={state.knowledgeItems}
            onCreateLexicon={addLexicon}
            workbenchState={state}
            onSave={(patch) => {
              updateExpression(editingExpression.id, patch);
              messageApi.success('规则草稿已保存');
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
