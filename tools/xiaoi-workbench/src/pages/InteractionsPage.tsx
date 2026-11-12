import {
  EditOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { buildActionInvocation } from '../../../../packages/xiaoi-core';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  List,
  Segmented,
  Space,
  Tag,
  message
} from 'antd';
import { useEffect, useState } from 'react';
import { ActionEditorModal } from '../components/ActionEditorModal';
import { InspectorPanel } from '../components/InspectorPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import type {
  ActionInputMapping,
  ActionInvocation,
  InteractionAction
} from '../domain/types';
import { useWorkbench } from '../state/WorkbenchProvider';

type TestValues = Record<string, string>;

function mappingLabel(mapping: ActionInputMapping) {
  const sourceNames = {
    slot: '知识点槽位',
    dimension: '业务维度',
    context: '会话上下文',
    literal: '固定值'
  };
  return `${mapping.parameter} ← ${sourceNames[mapping.source]}：${
    mapping.source === 'literal'
      ? mapping.literalValue
      : mapping.sourceKey
  }`;
}

function sourceValues(
  mappings: ActionInputMapping[],
  values: TestValues
) {
  const sources: Record<string, Record<string, string>> = {
    slot: {},
    dimension: {},
    context: {}
  };
  for (const mapping of mappings) {
    if (mapping.source === 'literal') continue;
    const key = mapping.sourceKey ?? mapping.parameter;
    const value = values[`${mapping.source}:${key}`];
    if (value) sources[mapping.source][key] = value;
  }
  return sources;
}

export function InteractionsPage() {
  const { state, addAction, updateAction } = useWorkbench();
  const [selectedId, setSelectedId] = useState(state.actions[0]?.id);
  const [channel, setChannel] = useState('手机银行');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<
    InteractionAction | undefined
  >();
  const [testValues, setTestValues] = useState<TestValues>({});
  const [executeResult, setExecuteResult] = useState<ActionInvocation>();
  const [messageApi, contextHolder] = message.useMessage();
  const selected = state.actions.find((action) => action.id === selectedId);
  const mappings = selected?.inputMappings ?? [];

  useEffect(() => {
    setTestValues({});
    setExecuteResult(undefined);
  }, [selectedId, channel]);

  const openCreate = () => {
    setEditingAction(undefined);
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditingAction(selected);
    setEditorOpen(true);
  };

  const saveAction = (action: InteractionAction) => {
    if (editingAction) {
      updateAction(editingAction.id, action);
      messageApi.success('动作配置已保存');
    } else {
      addAction(action);
      setSelectedId(action.id);
      messageApi.success('动作已创建');
    }
    setEditorOpen(false);
  };

  const handleValidate = () => {
    if (!selected) return;
    const invocation = buildActionInvocation(
      selected,
      sourceValues(mappings, testValues),
      channel
    ) as ActionInvocation;
    setExecuteResult(invocation);
    if (invocation.valid) {
      messageApi.success('动作参数解析通过');
    }
  };

  return (
    <div>
      {contextHolder}
      <PageHeader
        title="交互编排"
        description="维护知识命中后的导航、指令及其参数映射，并在发布前验证可执行性"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建动作
          </Button>
        }
      />
      <div className="interaction-grid">
        <section className="action-library">
          <div className="panel-heading">动作库</div>
          <List
            dataSource={state.actions}
            renderItem={(action) => (
              <List.Item
                className={
                  action.id === selectedId
                    ? 'action-item active'
                    : 'action-item'
                }
                onClick={() => setSelectedId(action.id)}
              >
                <List.Item.Meta
                  title={action.name}
                  description={`${action.type} · ${action.channels.join('、')}`}
                />
                <StatusTag status={action.status} />
              </List.Item>
            )}
          />
        </section>

        <section className="action-config">
          {selected ? (
            <>
              <Card
                title="动作配置"
                size="small"
                extra={
                  <Button icon={<EditOutlined />} onClick={openEdit}>
                    编辑动作
                  </Button>
                }
              >
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="动作编码">
                    <code>{selected.actionCode}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="动作类型">
                    {selected.type}
                  </Descriptions.Item>
                  <Descriptions.Item label="载荷模板">
                    <code>{JSON.stringify(selected.payload)}</code>
                  </Descriptions.Item>
                  <Descriptions.Item label="生效渠道">
                    {selected.channels.map((item) => (
                      <Tag key={item}>{item}</Tag>
                    ))}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              <Card
                title={`参数映射（${mappings.length}）`}
                size="small"
                className="section-card"
              >
                {mappings.length ? (
                  <List
                    size="small"
                    dataSource={mappings}
                    renderItem={(mapping) => (
                      <List.Item>
                        <code>{mappingLabel(mapping)}</code>
                        {mapping.required ? <Tag color="red">必填</Tag> : null}
                      </List.Item>
                    )}
                  />
                ) : (
                  <Alert
                    type="info"
                    showIcon
                    message="该动作不需要动态参数"
                    description="如路径中包含占位符，请编辑动作并建立参数映射。"
                  />
                )}
              </Card>

              <Card title="执行链路" size="small" className="section-card">
                <div className="flow-strip">
                  <span>知识点命中</span>
                  <b>→</b>
                  <span>槽位与条件取值</span>
                  <b>→</b>
                  <span>参数映射校验</span>
                  <b>→</b>
                  <span>生成动作调用</span>
                </div>
              </Card>
            </>
          ) : null}
        </section>

        <InspectorPanel title="动作解析测试">
          <Segmented
            block
            value={channel}
            options={['手机银行', 'Web', '微信']}
            onChange={(value) => setChannel(String(value))}
          />
          <div className="phone-preview">
            <div className="phone-preview-title">
              <MobileOutlined /> {channel}
            </div>
            {mappings
              .filter((mapping) => mapping.source !== 'literal')
              .map((mapping) => {
                const sourceKey = mapping.sourceKey ?? mapping.parameter;
                const valueKey = `${mapping.source}:${sourceKey}`;
                return (
                  <label className="action-test-field" key={valueKey}>
                    <span>
                      {mapping.parameter}
                      {mapping.required ? ' *' : ''}
                    </span>
                    <Input
                      aria-label={`测试参数 ${mapping.parameter}`}
                      placeholder={`输入 ${sourceKey}`}
                      value={testValues[valueKey]}
                      onChange={(event) =>
                        setTestValues((current) => ({
                          ...current,
                          [valueKey]: event.target.value
                        }))
                      }
                    />
                  </label>
                );
              })}
            <Button
              type="primary"
              block
              icon={<PlayCircleOutlined />}
              onClick={handleValidate}
            >
              解析并校验
            </Button>
            {executeResult ? (
              <Alert
                style={{ marginTop: 10 }}
                type={executeResult.valid ? 'success' : 'error'}
                showIcon
                message={
                  executeResult.valid
                    ? '动作调用可执行'
                    : '动作调用不可执行'
                }
                description={
                  <Space direction="vertical" size={4}>
                    {executeResult.errors.map((error) => (
                      <span key={error}>{error}</span>
                    ))}
                    <code>{JSON.stringify(executeResult.payload)}</code>
                    <code>{JSON.stringify(executeResult.parameters)}</code>
                  </Space>
                }
              />
            ) : null}
          </div>
        </InspectorPanel>
      </div>

      <ActionEditorModal
        action={editingAction}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onSave={saveAction}
      />
    </div>
  );
}
