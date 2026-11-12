import { ExperimentOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  List,
  Segmented,
  Space,
  Tag,
  message
} from 'antd';
import { useState } from 'react';
import { DebugConditionPanel } from '../components/DebugConditionPanel';
import { ExpressionRuleEditor } from '../components/ExpressionRuleEditor';
import { PageHeader } from '../components/PageHeader';
import { RecognitionDecisionSummary } from '../components/RecognitionDecisionSummary';
import { RecognitionProcessPanel } from '../components/RecognitionProcessPanel';
import { RegexRuleEditor } from '../components/RegexRuleEditor';
import { StatusTag } from '../components/StatusTag';
import { TextPipelineTracePanel } from '../components/TextPipelineTracePanel';
import { createDefaultBusinessConfig } from '../domain/expressionBusiness';
import type { RecognitionResult } from '../domain/types';
import { recognize } from '../engine/ruleEngine';
import { useWorkbench } from '../state/WorkbenchProvider';

type Workspace = 'lexicons' | 'expressions' | 'debug';

export function LanguageRulesPage() {
  const {
    state,
    addLexicon,
    updateLexicon,
    addExpression,
    updateExpression
  } = useWorkbench();
  const [workspace, setWorkspace] = useState<Workspace>('lexicons');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [debugCategory, setDebugCategory] = useState('');
  const [debugDimensions, setDebugDimensions] = useState<Record<string, string>>({});
  const [debugContext, setDebugContext] = useState<Record<string, string>>({});
  const [messageApi, contextHolder] = message.useMessage();

  const selectedLexicon = state.lexicons.find((item) => item.id === selectedId);
  const selectedExpression = state.expressions.find((item) => item.id === selectedId);
  const selectedAsset = selectedLexicon ?? selectedExpression;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredLexicons = state.lexicons.filter((lexicon) =>
    !normalizedSearch ||
    [lexicon.name, lexicon.standardTerm, lexicon.description, ...lexicon.aliases]
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  );
  const filteredExpressions = state.expressions.filter((expression) =>
    !normalizedSearch ||
    [expression.name, expression.visualSummary, expression.dsl]
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  );
  const resultForSelectedLexicon = selectedLexicon && result
    ? result.tokens.filter((token) => token.lexiconId === selectedLexicon.id)
    : [];
  const selectedExpressionTrace = selectedExpression && result
    ? result.expressionTraces.find((trace) => trace.expressionId === selectedExpression.id)
    : undefined;
  const labMode = selectedLexicon
    ? 'lexicon'
    : selectedExpression
      ? 'expression'
      : 'pipeline';
  const labActionLabel = labMode === 'lexicon'
    ? '验证当前词类'
    : labMode === 'expression'
      ? '验证当前表达式'
      : '解释命中';
  const changeWorkspace = (value: string | number) => {
    const next = String(value) as Workspace;
    setWorkspace(next);
    setSearch('');
    setResult(null);
    if (
      (next === 'lexicons' && selectedExpression) ||
      (next === 'expressions' && selectedLexicon)
    ) {
      setSelectedId(null);
    }
  };

  const createAsset = () => {
    const creatingLexicon = workspace === 'lexicons';
    const id = `${creatingLexicon ? 'lex' : 'exp'}-${Date.now()}`;
    if (creatingLexicon) {
      addLexicon({
        id,
        name: '未命名词类',
        description: '',
        standardTerm: '新词',
        aliases: [],
        dynamic: false,
        posType: 'noun',
        weight: 1,
        status: 'draft',
        lexiconType: 'general'
      });
    } else {
      addExpression({
        id,
        name: '未命名表达式',
        dsl: '',
        visualSummary: '',
        lexiconIds: [],
        knowledgeItemIds: [],
        priority: 100,
        status: 'draft',
        polarity: 'positive',
        testCases: [],
        businessConfig: createDefaultBusinessConfig('positive'),
        revision: 0
      });
    }
    setSelectedId(id);
    setEditorOpen(true);
  };

  const openEditor = (id: string) => {
    setSelectedId(id);
    setEditorOpen(true);
    setResult(null);
  };

  const explain = () => {
    setResult(recognize(query, state, {
      channel: state.context.channel,
      category: debugCategory || undefined,
      dimensions: debugDimensions,
      context: debugContext
    }));
  };

  return (
    <div>
      {contextHolder}
      <PageHeader
        title="语言规则"
        description="分区维护词类、语义表达式，并用共享规则内核解释完整识别过程"
        actions={
          workspace !== 'debug' ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={createAsset}>
              新建{workspace === 'lexicons' ? '词类' : '表达式'}
            </Button>
          ) : null
        }
      />

      <div className="language-workspace-nav">
        <Segmented
          block
          value={workspace}
          options={[
            { label: `词类资产 ${state.lexicons.length}`, value: 'lexicons' },
            { label: `表达式资产 ${state.expressions.length}`, value: 'expressions' },
            { label: '命中调试', value: 'debug' }
          ]}
          onChange={changeWorkspace}
        />
      </div>

      {workspace !== 'debug' ? (
        <section className="language-asset-workspace">
          <div className="language-asset-toolbar">
            <div>
              <strong>{workspace === 'lexicons' ? '词类库' : '语义表达式库'}</strong>
              <p>
                {workspace === 'lexicons'
                  ? '统一维护标准词、同义表达、动态词和词权重。'
                  : '维护肯定、否定和候补模板，并绑定知识点。'}
              </p>
            </div>
            <Input.Search
              aria-label={`搜索${workspace === 'lexicons' ? '词类' : '表达式'}`}
              placeholder={`搜索${workspace === 'lexicons' ? '词类、标准词或别名' : '表达式或 DSL'}`}
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {workspace === 'lexicons' ? (
            <List
              dataSource={filteredLexicons}
              locale={{ emptyText: '没有符合条件的词类' }}
              renderItem={(lexicon) => (
                <List.Item className="rule-list-item">
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <strong>{lexicon.name}</strong>
                        <StatusTag status={lexicon.status} />
                        {lexicon.dynamic ? <Tag color="purple">动态词类</Tag> : null}
                        <Tag>{lexicon.lexiconType ?? 'general'}</Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <p>{lexicon.description}</p>
                        <Space wrap>
                          <Tag>标准词：{lexicon.standardTerm}</Tag>
                          {lexicon.aliases.map((alias) => <Tag key={alias}>{alias}</Tag>)}
                        </Space>
                      </div>
                    }
                  />
                  <div className="rule-metric">
                    <strong>权重 {lexicon.weight}</strong>
                    <span>{lexicon.posType === 'noun' ? '名词' : '动词'}</span>
                    <Button
                      size="small"
                      aria-label={`编辑${lexicon.name}`}
                      onClick={() => openEditor(lexicon.id)}
                    >
                      编辑
                    </Button>
                  </div>
                </List.Item>
              )}
            />
          ) : (
            <List
              dataSource={filteredExpressions}
              locale={{ emptyText: '没有符合条件的表达式' }}
              renderItem={(expression) => (
                <List.Item className="rule-list-item">
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <strong>{expression.name}</strong>
                        <StatusTag status={expression.status} />
                        <Tag color={expression.polarity === 'negative' ? 'red' : 'green'}>
                          {expression.polarity === 'negative' ? '否定规则' : '肯定规则'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <>
                        <p>{expression.visualSummary || '尚未配置业务条件'}</p>
                        <Space wrap>
                          <Tag>
                            {expression.businessConfig?.editorMode === 'expert'
                              ? '专家规则'
                              : '中文条件'}
                          </Tag>
                          <code>{expression.dsl || '尚未生成 DSL'}</code>
                        </Space>
                      </>
                    }
                  />
                  <div className="rule-metric">
                    <strong>优先级 {expression.priority}</strong>
                    <span>引用 {expression.knowledgeItemIds.length}</span>
                    <Button
                      size="small"
                      aria-label={`编辑${expression.name}`}
                      onClick={() => openEditor(expression.id)}
                    >
                      编辑
                    </Button>
                  </div>
                </List.Item>
              )}
            />
          )}
        </section>
      ) : (
        <section className="language-debug-workspace">
          <Card
            title={<Space><ExperimentOutlined />命中解释实验室</Space>}
            extra={
              <Space>
                {selectedAsset ? (
                  <>
                    <Tag color="blue">
                      当前资产：{selectedAsset.name}
                    </Tag>
                    <Button
                      size="small"
                      onClick={() => {
                        setSelectedId(null);
                        setResult(null);
                      }}
                    >
                      切换为完整链路
                    </Button>
                  </>
                ) : (
                  <Tag color="blue">完整识别链路</Tag>
                )}
              </Space>
            }
          >
            <div className="language-debug-input">
              <Input.TextArea
                aria-label="规则测试语句"
                value={query}
                rows={2}
                placeholder="输入用户问法，例如：查一下信用卡还款日期"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setResult(null);
                }}
              />
              <Button
                type="primary"
                aria-label={labActionLabel}
                className="lab-run-button"
                onClick={explain}
              >
                {labActionLabel}
              </Button>
            </div>
            <DebugConditionPanel
              channel={state.context.channel}
              category={debugCategory}
              dimensions={debugDimensions}
              context={debugContext}
              onCategoryChange={setDebugCategory}
              onDimensionsChange={setDebugDimensions}
              onContextChange={setDebugContext}
              onInvalidateResult={() => setResult(null)}
            />
            {result ? (
              <div className="hit-trace">
                {result.diagnostics?.length ? (
                  <Alert
                    className="editor-alert"
                    type="error"
                    showIcon
                    message="部分规则编译失败，已安全跳过"
                    description={result.diagnostics.join('；')}
                  />
                ) : null}
                {labMode === 'pipeline' ? (
                  <>
                    <RecognitionDecisionSummary result={result} />
                    <RecognitionProcessPanel result={result} />
                  </>
                ) : (
                  <>
                    {labMode === 'lexicon' ? (
                      <Alert
                        type={resultForSelectedLexicon.length > 0 ? 'success' : 'warning'}
                        showIcon
                        message={resultForSelectedLexicon.length > 0 ? '词类命中成功' : '未命中当前词类'}
                        description={
                          resultForSelectedLexicon.length > 0
                            ? `输入已识别为词类「${selectedLexicon?.name}」。当前仅验证词类，不要求命中完整知识目标。`
                            : `输入未识别为当前词类「${selectedLexicon?.name}」，请检查标准词、别名或预处理规则。`
                        }
                      />
                    ) : (
                      <Alert
                        type={selectedExpressionTrace?.matched ? 'success' : 'warning'}
                        showIcon
                        message={selectedExpressionTrace?.matched ? '表达式命中成功' : '当前表达式未命中'}
                        description={
                          selectedExpressionTrace?.matched
                            ? `输入已命中表达式「${selectedExpression?.name}」。当前仅验证表达式，不要求知识目标达到回答阈值。`
                            : selectedExpressionTrace?.details.join('；') || `输入未满足表达式「${selectedExpression?.name}」。`
                        }
                      />
                    )}
                    <TextPipelineTracePanel trace={result.pipelineTrace} />
                  </>
                )}
              </div>
            ) : (
              <Empty
                className="language-debug-empty"
                description="输入真实用户问法后运行，可查看规范化、分词、模板、候选和阈值决策"
              />
            )}
          </Card>
        </section>
      )}

      <Drawer
        aria-label={`编辑${selectedLexicon ? '词类' : '表达式'}`}
        className="language-editor-drawer"
        title={`编辑${selectedLexicon ? '词类' : '表达式'} · ${selectedAsset?.name ?? ''}`}
        width="76vw"
        open={editorOpen && Boolean(selectedAsset)}
        closable={false}
        destroyOnHidden
        onClose={() => setEditorOpen(false)}
        extra={
          <Button aria-label="关闭编辑" onClick={() => setEditorOpen(false)}>
            关闭编辑
          </Button>
        }
      >
        {selectedLexicon ? (
          <RegexRuleEditor
            lexicon={selectedLexicon}
            onSave={(patch) => {
              updateLexicon(selectedLexicon.id, patch);
              messageApi.success('词类规则已保存');
            }}
          />
        ) : selectedExpression ? (
          <ExpressionRuleEditor
            expression={selectedExpression}
            lexicons={state.lexicons}
            knowledgeItems={state.knowledgeItems}
            preprocessRules={state.preprocessRules}
            onCreateLexicon={addLexicon}
            workbenchState={state}
            onSave={(patch) => {
              updateExpression(selectedExpression.id, patch);
              messageApi.success('表达式规则已保存');
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
