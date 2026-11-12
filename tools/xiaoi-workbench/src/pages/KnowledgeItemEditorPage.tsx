import {
  ArrowLeftOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Select,
  Space,
  Tabs,
  Tag,
  message
} from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { InspectorPanel } from '../components/InspectorPanel';
import {
  KnowledgeMetadataEditor,
  type KnowledgeMetadataValue
} from '../components/KnowledgeMetadataEditor';
import { KnowledgeRuleSetEditor } from '../components/KnowledgeRuleSetEditor';
import { OrdinaryQuestionManager } from '../components/OrdinaryQuestionManager';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import type {
  AnswerVariant,
  ExpandedQuestion,
  IntentSlot,
  RecognitionResult
} from '../domain/types';
import { deriveKnowledgeLexiconIds } from '../domain/expressionBindings';
import {
  getOrdinaryExpandedQuestions,
  syncOrdinaryExpandedQuestionDefinitions
} from '../domain/expandedQuestions';
import { recognize } from '../engine/ruleEngine';
import { useWorkbench } from '../state/WorkbenchProvider';

interface KnowledgeItemEditorPageProps {
  embedded?: boolean;
  onClose?: () => void;
  knowledgeItemId?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

function metadataFromItem(item: ReturnType<typeof useWorkbench>['state']['knowledgeItems'][number] | undefined): KnowledgeMetadataValue {
  return {
    categoryPath: item?.categoryPath ?? [item?.domain, item?.category].filter(Boolean) as string[],
    businessInstanceName: item?.businessInstanceName ?? item?.scene ?? '',
    knowledgeAttribute: item?.knowledgeAttribute ?? '',
    channels: item?.channels ?? [],
    recommended: item?.recommended ?? false,
    validFrom: item?.validFrom ?? '',
    validTo: item?.validTo ?? '',
    sourceInstruction: item?.sourceInstruction ?? '',
    materialRefs: item?.materialRefs ?? []
  };
}

export function KnowledgeItemEditorPage({
  embedded = false,
  onClose,
  knowledgeItemId,
  onDirtyChange
}: KnowledgeItemEditorPageProps = {}) {
  const { id: routeId } = useParams();
  const id = knowledgeItemId ?? routeId;
  const navigate = useNavigate();
  const { state, updateKnowledgeItem, addToChangeSet } = useWorkbench();
  const item = state.knowledgeItems.find((knowledge) => knowledge.id === id);
  const [standardQuestion, setStandardQuestion] = useState(item?.standardQuestion ?? '');
  const [standardAnswer, setStandardAnswer] = useState(item?.standardAnswer ?? '');
  const [expandedQuestions, setExpandedQuestions] = useState<ExpandedQuestion[]>(
    item ? getOrdinaryExpandedQuestions(item) : []
  );
  const [answerVariants, setAnswerVariants] = useState(item?.answerVariants ?? []);
  const [slots, setSlots] = useState(item?.slots ?? []);
  const [metadata, setMetadata] = useState<KnowledgeMetadataValue>(() => metadataFromItem(item));
  const [testQuery, setTestQuery] = useState(item?.standardQuestion ?? '');
  const [testRegion, setTestRegion] = useState('');
  const [testSegment, setTestSegment] = useState('');
  const [testResult, setTestResult] = useState<RecognitionResult | null>(null);
  const [testedFingerprint, setTestedFingerprint] = useState('');
  const [testError, setTestError] = useState('');
  const [changeSetId, setChangeSetId] = useState('');
  const [messageApi, contextHolder] = message.useMessage();
  const dirty = item
    ? standardQuestion !== item.standardQuestion ||
      standardAnswer !== item.standardAnswer ||
      JSON.stringify(expandedQuestions) !== JSON.stringify(getOrdinaryExpandedQuestions(item)) ||
      JSON.stringify(answerVariants) !== JSON.stringify(item.answerVariants ?? []) ||
      JSON.stringify(slots) !== JSON.stringify(item.slots ?? []) ||
      JSON.stringify(metadata) !== JSON.stringify(metadataFromItem(item))
    : false;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!item) return;
    setStandardQuestion(item.standardQuestion);
    setStandardAnswer(item.standardAnswer);
    setExpandedQuestions(getOrdinaryExpandedQuestions(item));
    setAnswerVariants(item.answerVariants ?? []);
    setSlots(item.slots ?? []);
    setMetadata(metadataFromItem(item));
    setTestQuery(item.standardQuestion);
    setTestRegion('');
    setTestSegment('');
    setTestResult(null);
    setTestedFingerprint('');
    setTestError('');
  }, [item?.id]);

  if (!item) {
    return (
      <Empty description="未找到该知识点">
        <Button onClick={() => navigate('/knowledge-items')}>返回知识点列表</Button>
      </Empty>
    );
  }

  const testFingerprint = JSON.stringify({
    knowledgeItemId: item.id,
    query: testQuery.trim(),
    region: testRegion.trim(),
    segment: testSegment.trim(),
    channel: state.context.channel,
    standardQuestion,
    standardAnswer,
    expandedQuestions,
    answerVariants,
    slots,
    metadata,
    expressions: state.expressions
      .filter((expression) =>
        (expression.knowledgeItemIds ?? []).includes(item.id) ||
        item.expressionIds.includes(expression.id) ||
        (item.positiveExpressionIds ?? []).includes(expression.id) ||
        (item.negativeExpressionIds ?? []).includes(expression.id)
      )
      .map((expression) => ({
        id: expression.id,
        dsl: expression.dsl,
        priority: expression.priority,
        status: expression.status
      })),
    lexicons: state.lexicons
      .filter((lexicon) => item.lexiconIds.includes(lexicon.id))
      .map((lexicon) => ({
        id: lexicon.id,
        standardTerm: lexicon.standardTerm,
        aliases: lexicon.aliases,
        weight: lexicon.weight,
        status: lexicon.status
      }))
  });
  const testResultIsCurrent =
    Boolean(testResult) && testedFingerprint === testFingerprint;
  const testResultIsStale =
    Boolean(testResult) && testedFingerprint !== testFingerprint;
  const testedCandidate = testResult?.candidates.find(
    (candidate) => candidate.targetId === testResult.target?.id
  );

  const saveDraft = () => {
    const synchronizedQuestions = syncOrdinaryExpandedQuestionDefinitions(
      item,
      expandedQuestions
    );
    const normalizedVariants = answerVariants.filter(
      (variant) => variant.channel.trim() && variant.content.trim()
    );
    const normalizedSlots = slots.filter(
      (slot) => slot.name.trim() && slot.lexiconId
    );
    updateKnowledgeItem(item.id, {
      name:
        item.targetType !== 'task' && item.name === item.standardQuestion
          ? standardQuestion
          : item.name,
      standardQuestion,
      standardAnswer,
      ...synchronizedQuestions,
      answerVariants: normalizedVariants,
      slots: normalizedSlots,
      categoryPath: metadata.categoryPath,
      businessInstanceName: metadata.businessInstanceName,
      knowledgeAttribute: metadata.knowledgeAttribute,
      recommended: metadata.recommended,
      validFrom: metadata.validFrom || undefined,
      validTo: metadata.validTo || undefined,
      sourceInstruction: metadata.sourceInstruction,
      materialRefs: metadata.materialRefs,
      channels: [
        ...new Set([
          ...metadata.channels,
          ...normalizedVariants.map((variant) => variant.channel.trim())
        ])
      ],
      status: 'draft'
    });
    messageApi.success('草稿已保存');
  };

  const runTest = () => {
    if (!testQuery.trim()) {
      setTestResult(null);
      setTestError('测试失败：测试问法不能为空');
      return;
    }

    const testState = {
      ...state,
      knowledgeItems: state.knowledgeItems.map((knowledge) =>
        knowledge.id === item.id
          ? {
              ...knowledge,
              standardQuestion,
              standardAnswer,
              ...syncOrdinaryExpandedQuestionDefinitions(knowledge, expandedQuestions),
              answerVariants,
              slots,
              ...metadata,
              validFrom: metadata.validFrom || undefined,
              validTo: metadata.validTo || undefined
            }
          : knowledge
      )
    };
    const result = recognize(testQuery, testState, {
      channel: state.context.channel,
      dimensions: {
        ...(testRegion.trim() ? { region: testRegion.trim() } : {}),
        ...(testSegment.trim() ? { segment: testSegment.trim() } : {})
      }
    });
    setTestError('');
    setTestResult(result);
    setTestedFingerprint(testFingerprint);
  };

  const joinChangeSet = () => {
    saveDraft();
    setChangeSetId(addToChangeSet(item.id));
  };

  const contentTab = (
    <Form layout="vertical" className="editor-form">
      <Form.Item label="标准问" required>
        <Input
          value={standardQuestion}
          onChange={(event) => setStandardQuestion(event.target.value)}
        />
      </Form.Item>
      <Form.Item label="标准答案" required>
        <Input.TextArea
          aria-label="标准答案"
          value={standardAnswer}
          rows={8}
          onChange={(event) => setStandardAnswer(event.target.value)}
        />
      </Form.Item>
      <Descriptions size="small" bordered column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="识别目标">
          {item.targetType === 'task' ? '任务意图' : 'FAQ 问答'}
        </Descriptions.Item>
        <Descriptions.Item label="识别编码">{item.intentCode ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="业务领域">{item.domain}</Descriptions.Item>
        <Descriptions.Item label="知识分类">{item.category}</Descriptions.Item>
        <Descriptions.Item label="场景">{item.scene}</Descriptions.Item>
        <Descriptions.Item label="适用渠道">
          {item.channels.join('、')}
        </Descriptions.Item>
      </Descriptions>
      <KnowledgeMetadataEditor
        value={metadata}
        onChange={(patch) => setMetadata((current) => ({ ...current, ...patch }))}
      />
    </Form>
  );

  const referenceTab = (title: string, values: string[]) => (
    <div className="tab-list-panel">
      <h3>{title}</h3>
      <List
        bordered
        dataSource={values}
        locale={{ emptyText: '暂无关联对象' }}
        renderItem={(value) => <List.Item>{value}</List.Item>}
      />
    </div>
  );

  const updateAnswerVariant = (
    index: number,
    patch: Partial<AnswerVariant>
  ) => {
    setAnswerVariants((current) =>
      current.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant
      )
    );
  };

  const updateSlot = (index: number, patch: Partial<IntentSlot>) => {
    setSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot
      )
    );
  };

  const expansionsTab = (
    <OrdinaryQuestionManager
      knowledgePointId={item.id}
      value={expandedQuestions}
      onChange={setExpandedQuestions}
    />
  );

  const answerVariantsTab = (
    <div className="structured-editor-panel">
      <div className="structured-list-header">
        <div>
          <h3>多维答案</h3>
          <p>按渠道、地区和客群选择最具体的适配答案；无适配变体时使用标准答案。</p>
        </div>
        <Button
          aria-label="新增答案变体"
          icon={<PlusOutlined />}
          onClick={() =>
            setAnswerVariants((current) => [
              ...current,
              {
                id: `answer-${Date.now().toString(36)}`,
                channel: '',
                content: '',
                actionIds: []
              }
            ])
          }
        >
          新增答案变体
        </Button>
      </div>
      <Card size="small" title="答案选择测试条件">
        <p>
          当前渠道：{state.context.channel}。填写地区或客群后，点击页面上方“运行测试”验证实际返回答案。
        </p>
        <div className="structured-card-grid">
          <Form.Item label="测试地区">
            <Input
              aria-label="测试答案地区"
              value={testRegion}
              placeholder="例如：上海"
              onChange={(event) => setTestRegion(event.target.value)}
            />
          </Form.Item>
          <Form.Item label="测试客群">
            <Input
              aria-label="测试答案客群"
              value={testSegment}
              placeholder="例如：贵宾客户"
              onChange={(event) => setTestSegment(event.target.value)}
            />
          </Form.Item>
        </div>
      </Card>
      <div className="structured-card-list">
        {answerVariants.length ? (
          answerVariants.map((variant, index) => (
            <Card
              key={variant.id}
              size="small"
              className="structured-card"
              title={`答案变体 ${index + 1}`}
              extra={
                <Button
                  type="text"
                  danger
                  aria-label={`删除答案变体 ${index + 1}`}
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    setAnswerVariants((current) =>
                      current.filter((_, variantIndex) => variantIndex !== index)
                    )
                  }
                />
              }
            >
              <div className="structured-card-grid">
                <Form.Item label="渠道">
                  <Input
                    aria-label={`答案渠道 ${index + 1}`}
                    value={variant.channel}
                    placeholder="例如：手机银行"
                    onChange={(event) =>
                      updateAnswerVariant(index, { channel: event.target.value })
                    }
                  />
                </Form.Item>
                <Form.Item label="地区">
                  <Input
                    aria-label={`答案地区 ${index + 1}`}
                    value={variant.region}
                    placeholder="可选"
                    onChange={(event) =>
                      updateAnswerVariant(index, { region: event.target.value })
                    }
                  />
                </Form.Item>
                <Form.Item label="客群">
                  <Input
                    aria-label={`答案客群 ${index + 1}`}
                    value={variant.segment}
                    placeholder="可选，例如：贵宾客户"
                    onChange={(event) =>
                      updateAnswerVariant(index, { segment: event.target.value })
                    }
                  />
                </Form.Item>
              </div>
              <Form.Item label="答案内容">
                <Input.TextArea
                  aria-label={`答案内容 ${index + 1}`}
                  value={variant.content}
                  rows={5}
                  onChange={(event) =>
                    updateAnswerVariant(index, { content: event.target.value })
                  }
                />
              </Form.Item>
            </Card>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无答案变体" />
        )}
      </div>
    </div>
  );

  const slotsTab = (
    <div className="structured-editor-panel">
      <div className="structured-list-header">
        <div>
          <h3>意图槽位</h3>
          <p>绑定动态词类，识别后提取业务参数；必填槽位缺失时触发追问。</p>
        </div>
        <Button
          aria-label="新增槽位"
          icon={<PlusOutlined />}
          onClick={() =>
            setSlots((current) => [
              ...current,
              {
                id: `slot-${Date.now().toString(36)}`,
                name: '',
                lexiconId:
                  state.lexicons.find((lexicon) => lexicon.id === 'lex-datetime')?.id ??
                  state.lexicons.find((lexicon) => lexicon.dynamic)?.id ??
                  '',
                required: true,
                clarificationQuestion: ''
              }
            ])
          }
        >
          新增槽位
        </Button>
      </div>
      <div className="structured-card-list">
        {slots.length ? (
          slots.map((slot, index) => (
            <Card
              key={slot.id}
              size="small"
              className="structured-card"
              title={`槽位 ${index + 1}`}
              extra={
                <Button
                  type="text"
                  danger
                  aria-label={`删除槽位 ${index + 1}`}
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    setSlots((current) =>
                      current.filter((_, slotIndex) => slotIndex !== index)
                    )
                  }
                />
              }
            >
              <div className="structured-card-grid">
                <Form.Item label="槽位名称">
                  <Input
                    aria-label={`槽位名称 ${index + 1}`}
                    value={slot.name}
                    placeholder="例如：appointment_time"
                    onChange={(event) => updateSlot(index, { name: event.target.value })}
                  />
                </Form.Item>
                <Form.Item label="绑定词类">
                  <Select
                    aria-label={`槽位词类 ${index + 1}`}
                    value={slot.lexiconId || undefined}
                    placeholder="选择动态词类"
                    options={state.lexicons
                      .filter((lexicon) => lexicon.dynamic)
                      .map((lexicon) => ({ label: lexicon.name, value: lexicon.id }))}
                    onChange={(lexiconId) => updateSlot(index, { lexiconId })}
                  />
                </Form.Item>
              </div>
              <Form.Item>
                <Checkbox
                  checked={slot.required}
                  onChange={(event) => updateSlot(index, { required: event.target.checked })}
                >
                  必填槽位
                </Checkbox>
              </Form.Item>
              <Form.Item label="缺失追问">
                <Input
                  aria-label={`槽位追问 ${index + 1}`}
                  value={slot.clarificationQuestion}
                  placeholder="例如：请问您准备预约什么时间？"
                  onChange={(event) =>
                    updateSlot(index, { clarificationQuestion: event.target.value })
                  }
                />
              </Form.Item>
            </Card>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无意图槽位" />
        )}
      </div>
    </div>
  );

  const positiveRuleCount = state.expressions.filter(
    (expression) =>
      expression.knowledgeItemIds.includes(item.id) &&
      (expression.polarity ?? 'positive') === 'positive'
  ).length;
  const negativeRuleCount = state.expressions.filter(
    (expression) =>
      expression.knowledgeItemIds.includes(item.id) &&
      expression.polarity === 'negative'
  ).length;
  const linkedTemplates = item.conceptTemplateIds
    .map((templateId) =>
      state.templates.find((template) => template.id === templateId)
    )
    .filter((template) => template !== undefined);
  const derivedLexiconIds = deriveKnowledgeLexiconIds(item, state);
  const templatesTab = (
    <div className="structured-editor-panel">
      <div className="structured-list-header">
        <div>
          <h3>问答内容模板</h3>
          <p>
            复用标准问和答案骨架，不参与命中；小 i 的肯定/否定模板请在识别规则和排除规则中维护。
          </p>
        </div>
      </div>
      {linkedTemplates.length ? (
        <div className="structured-card-list">
          {linkedTemplates.map((template) => (
            <Card
              key={template.id}
              size="small"
              className="structured-card"
              title={
                template.id === 'tpl-query-time'
                  ? '时间查询模板'
                  : template.name
              }
              extra={<StatusTag status={template.status} />}
            >
              <p><strong>问法骨架：</strong>{template.questionTemplate}</p>
              <p><strong>答案骨架：</strong>{template.answerTemplate}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无问答内容模板" />
      )}
    </div>
  );

  return (
    <div>
      {contextHolder}
      <PageHeader
        title={item.name}
        description={`${item.domain} / ${item.category} / ${item.scene}`}
        actions={
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={onClose ?? (() => navigate('/knowledge-items'))}
            >
              {embedded ? '关闭编辑' : '返回列表'}
            </Button>
            <Button aria-label="保存草稿" icon={<SaveOutlined />} onClick={saveDraft}>保存草稿</Button>
            <Button
              type="primary"
              aria-label="加入变更集"
              icon={<SendOutlined />}
              onClick={joinChangeSet}
            >
              加入变更集
            </Button>
          </Space>
        }
      />
      <div className="editor-summary">
        <Space wrap>
          <StatusTag status={item.status} />
          <Tag>草稿 v{item.draftVersion}</Tag>
          <Tag>线上 v{item.publishedVersion ?? '-'}</Tag>
          <span>负责人：{item.owner}</span>
          <span>质量分：{item.qualityScore}</span>
        </Space>
      </div>
      <div className="inline-test-bar">
        <Input
          aria-label="测试问法"
          value={testQuery}
          placeholder="输入测试问法，验证当前知识点能否被规则命中"
          onChange={(event) => setTestQuery(event.target.value)}
          onPressEnter={runTest}
        />
        <Button
          aria-label="运行知识点整链路测试"
          icon={<ExperimentOutlined />}
          onClick={runTest}
        >
          运行知识点整链路测试
        </Button>
      </div>
      {testError ? (
        <Alert
          className="editor-alert"
          type="error"
          showIcon
          message={testError}
          closable
          onClose={() => setTestError('')}
        />
      ) : null}
      {testResultIsStale ? (
        <Alert
          className="editor-alert"
          type="warning"
          showIcon
          message="测试条件已变化，请重新运行"
          description="当前展示内容、测试问法或业务维度已变化，旧测试结果已失效。"
        />
      ) : null}
      {testResult && testResultIsCurrent ? (
        <Alert
          className="editor-alert"
          type={
            testResult.target?.id === item.id && testResult.decision === 'matched'
              ? 'success'
              : testResult.decision === 'clarification'
                ? 'info'
                : 'warning'
          }
          showIcon
          message={
            testResult.target?.id === item.id
              ? testResult.decision === 'clarification'
                ? '整链路已定位当前知识点，等待补充槽位'
                : '整链路命中当前知识点'
              : '整链路未命中当前知识点'
          }
          description={
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="决策">
                <Tag>{testResult.decision}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="目标">
                {testResult.target?.name ?? '未确定目标'}
              </Descriptions.Item>
              <Descriptions.Item label="算分明细">
                {testedCandidate ? (
                  <Space wrap>
                    <Tag>竞争最高分 {testedCandidate.reasons[0]?.replace('表达竞争最高分 ', '') ?? '-'}</Tag>
                    <Tag>{testedCandidate.reasons[1] ?? '胜出表达 -'}</Tag>
                    <Tag color="blue">最终 {testedCandidate.score.toFixed(2)}</Tag>
                  </Space>
                ) : (
                  '无有效候选'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="答案">
                {testResult.answer ?? '未返回答案'}
              </Descriptions.Item>
              <Descriptions.Item label="槽位">
                {Object.keys(testResult.extractedSlots).length ? (
                  <Space wrap>
                    {Object.entries(testResult.extractedSlots).map(([name, value]) => (
                      <Tag key={name}>{name}：{value}</Tag>
                    ))}
                  </Space>
                ) : testResult.missingSlots.length ? (
                  <Space wrap>
                    {testResult.missingSlots.map((slot) => (
                      <Tag color="orange" key={slot.id}>
                        缺少 {slot.name}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  '未提取槽位'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="动作">
                {testResult.actionInvocations.length ? (
                  <Space direction="vertical" size={0}>
                    {testResult.actionInvocations.map((invocation, index) => (
                      <span key={`${invocation.actionId ?? 'action'}-${index}`}>
                        {invocation.actionCode ?? invocation.actionId ?? '未知动作'}
                        {invocation.valid
                          ? '（可执行）'
                          : `（不可执行：${invocation.errors.join('；')}）`}
                      </span>
                    ))}
                  </Space>
                ) : testResult.actionIds.length ? (
                  testResult.actionIds.join('、')
                ) : (
                  '未生成动作'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="说明">
                {testResult.explanation}
              </Descriptions.Item>
            </Descriptions>
          }
          closable
          onClose={() => {
            setTestResult(null);
            setTestedFingerprint('');
          }}
        />
      ) : null}
      {changeSetId ? (
        <Alert
          className="editor-alert"
          type="info"
          showIcon
          message={`已加入变更集 ${changeSetId}`}
          closable
          onClose={() => setChangeSetId('')}
        />
      ) : null}
      <div className="editor-grid">
        <section className="editor-main">
          <Tabs
            items={[
              { key: 'content', label: '基础信息', children: contentTab },
              {
                key: 'expansions',
                label: `扩展问 (${expandedQuestions.length})`,
                children: expansionsTab
              },
              { key: 'dimensions', label: `多维答案 (${answerVariants.length})`, children: answerVariantsTab },
              {
                key: 'positive-rules',
                label: `识别规则 (肯定模板) (${positiveRuleCount})`,
                children: (
                  <KnowledgeRuleSetEditor
                    knowledgeItem={item}
                    purpose="positive"
                  />
                )
              },
              {
                key: 'negative-rules',
                label: `排除规则 (否定模板) (${negativeRuleCount})`,
                children: (
                  <KnowledgeRuleSetEditor
                    knowledgeItem={item}
                    purpose="negative"
                  />
                )
              },
              {
                key: 'templates',
                label: `问答内容模板 (${linkedTemplates.length})`,
                children: templatesTab
              },
              {
                key: 'slots',
                label: `意图槽位 (${slots.length})`,
                children: slotsTab
              },
              {
                key: 'actions',
                label: '交互动作',
                children: referenceTab('关联动作', item.actionIds)
              },
              {
                key: 'quality',
                label: `测试与质量 (${item.issues.length})`,
                children: referenceTab('质量检查结果', item.issues.map((issue) => issue.message))
              },
              {
                key: 'versions',
                label: '版本记录',
                children: referenceTab('版本', [
                  `草稿版本 v${item.draftVersion}`,
                  `线上版本 v${item.publishedVersion ?? '-'}`
                ])
              }
            ]}
          />
        </section>
        <InspectorPanel title="质量与引用">
          <div className="inspector-score">
            <strong>{item.qualityScore}</strong>
            <span>综合质量分</span>
          </div>
          <div className="inspector-section">
            <div className="inspector-label">质量提示</div>
            {item.issues.length ? (
              <List
                size="small"
                dataSource={item.issues}
                renderItem={(issue) => (
                  <List.Item>
                    <Tag color={issue.level === 'blocking' ? 'red' : 'orange'}>
                      {issue.level === 'blocking' ? '阻断' : '提示'}
                    </Tag>
                    {issue.message}
                  </List.Item>
                )}
              />
            ) : (
              <p>当前未发现质量问题。</p>
            )}
          </div>
          <div className="inspector-section">
            <div className="inspector-label">对象引用</div>
            <p>业务词 {derivedLexiconIds.length} · 规则 {positiveRuleCount + negativeRuleCount}</p>
            <p>问答内容模板 {item.conceptTemplateIds.length} · 动作 {item.actionIds.length}</p>
          </div>
        </InspectorPanel>
      </div>
    </div>
  );
}
