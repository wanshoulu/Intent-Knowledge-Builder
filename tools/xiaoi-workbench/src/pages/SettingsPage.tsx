import { SaveOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
  message
} from 'antd';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ConditionRecordEditor } from '../components/ConditionRecordEditor';
import { useWorkbench } from '../state/WorkbenchProvider';
import type { RecognitionModule } from '../domain/types';

export function SettingsPage() {
  const {
    state,
    updateContext,
    updateEvaluationPolicy,
    updateRecognitionModule,
    resetDemo
  } = useWorkbench();
  const [messageApi, contextHolder] = message.useMessage();
  const [channel, setChannel] = useState(state.context.channel);
  const [forceRegression, setForceRegression] = useState(
    state.evaluationPolicy?.forceRegression ?? true
  );
  const [requireServerRun, setRequireServerRun] = useState(
    state.evaluationPolicy?.requireServerRun ?? false
  );
  const [requireFullRun, setRequireFullRun] = useState(
    state.evaluationPolicy?.requireFullRun ?? true
  );
  const [dirty, setDirty] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState(
    state.modules?.[0]?.id
  );
  const [moduleDrafts, setModuleDrafts] = useState<
    Record<string, RecognitionModule>
  >(
    () =>
      Object.fromEntries(
        (state.modules ?? []).map((module) => [module.id, module])
      )
  );
  const moduleDraft = selectedModuleId
    ? moduleDrafts[selectedModuleId]
    : undefined;
  const setModuleDraft = (next: RecognitionModule) => {
    setModuleDrafts((current) => ({
      ...current,
      [next.id]: next
    }));
  };

  const handleSave = () => {
    updateContext({ channel });
    updateEvaluationPolicy({
      requireServerRun,
      requireFullRun,
      forceRegression
    });
    Object.values(moduleDrafts).forEach((module) => {
      updateRecognitionModule(module.id, module);
    });
    setDirty(false);
    messageApi.success('设置已保存');
  };

  const updateThreshold = (
    key: keyof RecognitionModule['thresholds'],
    value: number | null
  ) => {
    if (!moduleDraft || value === null) return;
    setModuleDraft({
      ...moduleDraft,
      thresholds: {
        ...moduleDraft.thresholds,
        [key]: value
      }
    });
    setDirty(true);
  };

  const selectModule = (moduleId: string) => {
    setSelectedModuleId(moduleId);
  };

  return (
    <div>
      {contextHolder}
      <PageHeader
        title="平台设置"
        description="管理工作空间、机器人上下文、渠道策略与演示数据"
        actions={
          <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} onClick={handleSave}>
            保存设置
          </Button>
        }
      />
      <div className="settings-grid">
        <Card title="当前上下文">
          <Descriptions bordered column={1}>
            <Descriptions.Item label="知识空间">{state.context.workspaceName}</Descriptions.Item>
            <Descriptions.Item label="机器人">{state.context.projectName}</Descriptions.Item>
            <Descriptions.Item label="环境">{state.context.environment}</Descriptions.Item>
            <Descriptions.Item label="发布版本">{state.context.releaseVersion}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="渠道与治理策略">
          <Form layout="vertical">
            <Form.Item label="默认渠道">
              <Select
                value={channel}
                onChange={(v) => { setChannel(v); setDirty(true); }}
                options={[{ value: '手机银行' }, { value: 'Web' }, { value: '微信' }]}
              />
            </Form.Item>
            <Form.Item label="发布前强制回归">
              <Space>
                <Switch checked={forceRegression} onChange={(v) => { setForceRegression(v); setDirty(true); }} />
                <Tag color={forceRegression ? 'green' : 'default'}>{forceRegression ? '已开启' : '已关闭'}</Tag>
              </Space>
            </Form.Item>
            <Form.Item
              label="服务端评测门禁"
              extra="开启后，发布必须绑定当前草稿 revision 的成功评测运行。"
            >
              <Space>
                <Switch
                  aria-label="服务端评测门禁"
                  checked={requireServerRun}
                  onChange={(value) => {
                    setRequireServerRun(value);
                    setDirty(true);
                  }}
                />
                <Tag color={requireServerRun ? 'green' : 'default'}>
                  {requireServerRun ? '已开启' : '已关闭'}
                </Tag>
              </Space>
            </Form.Item>
            <Form.Item
              label="门禁要求全量评测"
              extra="关闭后，增量评测通过也可作为发布证据。"
            >
              <Space>
                <Switch
                  aria-label="门禁要求全量评测"
                  checked={requireFullRun}
                  disabled={!requireServerRun}
                  onChange={(value) => {
                    setRequireFullRun(value);
                    setDirty(true);
                  }}
                />
                <Tag color={requireServerRun && requireFullRun ? 'green' : 'default'}>
                  {requireServerRun && requireFullRun ? '要求全量' : '允许增量'}
                </Tag>
              </Space>
            </Form.Item>
            <Alert
              type="info"
              showIcon
              message="高风险变更双人审核尚未启用"
              description="该能力需要先接入用户身份、角色权限和独立审批人校验；当前不会伪装成已生效的治理开关。"
            />
          </Form>
          <Divider />
          <Space>
            <Button
              danger
              onClick={() => {
                resetDemo();
                messageApi.success('演示数据已恢复');
              }}
            >
              恢复演示数据
            </Button>
          </Space>
        </Card>
        <Card title="模块与五项阈值">
          {moduleDraft ? (
            <Form layout="vertical">
              <Form.Item label="识别模块">
                <Select
                  aria-label="识别模块"
                  value={selectedModuleId}
                  onChange={selectModule}
                  options={(state.modules ?? []).map((module) => ({
                    value: module.id,
                    label: `${module.name} · 优先级 ${
                      moduleDrafts[module.id]?.priority ?? module.priority
                    }`
                  }))}
                />
              </Form.Item>
              <Space size="large" wrap>
                <Form.Item label="启用模块">
                  <Switch
                    checked={moduleDraft.enabled}
                    onChange={(enabled) => {
                      setModuleDraft({ ...moduleDraft, enabled });
                      setDirty(true);
                    }}
                  />
                </Form.Item>
                <Form.Item label="模块优先级">
                  <InputNumber
                    aria-label="模块优先级"
                    min={0}
                    precision={0}
                    value={moduleDraft.priority}
                    onChange={(priority) => {
                      if (priority === null) return;
                      setModuleDraft({ ...moduleDraft, priority });
                      setDirty(true);
                    }}
                  />
                </Form.Item>
              </Space>
              <Divider orientation="left">模块范围与运行条件</Divider>
              <Form.Item label="知识点范围">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="留空时按知识点所属模块执行"
                  value={moduleDraft.knowledgePointIds}
                  options={state.knowledgeItems.map((item) => ({
                    value: item.id,
                    label: item.name
                  }))}
                  onChange={(knowledgePointIds) => {
                    setModuleDraft({ ...moduleDraft, knowledgePointIds });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Form.Item label="适用渠道">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="留空表示不限制渠道"
                  value={
                    Array.isArray(moduleDraft.dimensionConditions?.channel)
                      ? moduleDraft.dimensionConditions.channel
                      : moduleDraft.dimensionConditions?.channel
                        ? [moduleDraft.dimensionConditions.channel]
                        : []
                  }
                  options={[
                    { value: '手机银行' },
                    { value: 'Web' },
                    { value: '微信' }
                  ]}
                  onChange={(channels) => {
                    const dimensionConditions = {
                      ...moduleDraft.dimensionConditions
                    };
                    if (channels.length) {
                      dimensionConditions.channel = channels;
                    } else {
                      delete dimensionConditions.channel;
                    }
                    setModuleDraft({
                      ...moduleDraft,
                      dimensionConditions
                    });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Form.Item label="适用知识类别">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="留空表示不限制类别"
                  value={moduleDraft.categoryConditions}
                  options={[...new Set(
                    state.knowledgeItems.map((item) => item.category)
                  )].map((category) => ({
                    value: category,
                    label: category
                  }))}
                  onChange={(categoryConditions) => {
                    setModuleDraft({ ...moduleDraft, categoryConditions });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Form.Item label="忽略输入类别">
                <Switch
                  checked={moduleDraft.ignoreCategoryMatch}
                  onChange={(ignoreCategoryMatch) => {
                    setModuleDraft({ ...moduleDraft, ignoreCategoryMatch });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Form.Item
                label="其他业务维度"
                extra="例如按地区或客群限制模块运行；多个允许值使用逗号分隔。"
              >
                <ConditionRecordEditor
                  key={`dimensions-${selectedModuleId}`}
                  value={Object.fromEntries(
                    Object.entries(moduleDraft.dimensionConditions ?? {})
                      .filter(([key]) => key !== 'channel')
                  )}
                  addButtonLabel="添加业务维度条件"
                  nameLabel="业务维度名称"
                  valueLabel="业务维度允许值"
                  commonKeys={[
                    { key: 'region', label: '地区' },
                    { key: 'segment', label: '客群' }
                  ]}
                  onChange={(otherDimensions) => {
                    const channelCondition =
                      moduleDraft.dimensionConditions?.channel;
                    setModuleDraft({
                      ...moduleDraft,
                      dimensionConditions: {
                        ...(channelCondition
                          ? { channel: channelCondition }
                          : {}),
                        ...otherDimensions
                      }
                    });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Form.Item
                label="会话上下文条件"
                extra="只有会话状态满足全部条件时才运行本模块。"
              >
                <ConditionRecordEditor
                  key={`context-${selectedModuleId}`}
                  value={moduleDraft.contextConditions}
                  addButtonLabel="添加上下文条件"
                  nameLabel="上下文名称"
                  valueLabel="上下文允许值"
                  commonKeys={[
                    { key: 'scene', label: '会话场景' },
                    { key: 'previousIntent', label: '上一意图' },
                    { key: 'sessionStage', label: '会话阶段' }
                  ]}
                  onChange={(contextConditions) => {
                    setModuleDraft({
                      ...moduleDraft,
                      contextConditions
                    });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Divider orientation="left">答案与候选决策</Divider>
              <Form.Item
                label="普通问题评分策略"
                extra="兼容 Dice 保持历史结果；词类混合会同时计算字符相似、词类覆盖和词序一致，切换前应运行标注回归集。"
              >
                <Select
                  aria-label="普通问题评分策略"
                  value={
                    moduleDraft.ordinarySimilarityStrategy ??
                    'weighted-lexicon-dice-v1'
                  }
                  disabled
                  options={[
                    {
                      value: 'weighted-lexicon-dice-v1',
                      label: '有效词加权 Dice v1（当前运行公式）'
                    },
                    {
                      value: 'dice-bigram-v1',
                      label: '兼容 Dice（二元字符）'
                    },
                    {
                      value: 'lexicon-hybrid-v1',
                      label: '词类混合 v1（可校准）'
                    }
                  ]}
                  onChange={(ordinarySimilarityStrategy) => {
                    setModuleDraft({
                      ...moduleDraft,
                      ordinarySimilarityStrategy
                    });
                    setDirty(true);
                  }}
                />
              </Form.Item>
              <Space size="large" wrap>
                <Form.Item label="答案阈值">
                  <InputNumber
                    aria-label="答案阈值"
                    min={0}
                    max={1}
                    step={0.01}
                    value={moduleDraft.thresholds.answerThreshold}
                    onChange={(value) => updateThreshold('answerThreshold', value)}
                  />
                </Form.Item>
                <Form.Item label="搜索阈值">
                  <InputNumber
                    aria-label="搜索阈值"
                    min={0}
                    max={1}
                    step={0.01}
                    value={moduleDraft.thresholds.searchThreshold}
                    onChange={(value) => updateThreshold('searchThreshold', value)}
                  />
                </Form.Item>
                <Form.Item label="最小答案阈值">
                  <InputNumber
                    aria-label="最小答案阈值"
                    min={0}
                    max={1}
                    step={0.01}
                    value={moduleDraft.thresholds.minimumAnswerThreshold}
                    onChange={(value) =>
                      updateThreshold('minimumAnswerThreshold', value)
                    }
                  />
                </Form.Item>
                <Form.Item label="最大相似差异">
                  <InputNumber
                    aria-label="最大相似差异"
                    min={0}
                    max={1}
                    step={0.01}
                    value={moduleDraft.thresholds.maximumSimilarityDifference}
                    onChange={(value) =>
                      updateThreshold('maximumSimilarityDifference', value)
                    }
                  />
                </Form.Item>
                <Form.Item label="最小相似差异">
                  <InputNumber
                    aria-label="最小相似差异"
                    min={0}
                    max={1}
                    step={0.01}
                    value={moduleDraft.thresholds.minimumSimilarityDifference}
                    onChange={(value) =>
                      updateThreshold('minimumSimilarityDifference', value)
                    }
                  />
                </Form.Item>
              </Space>
              <Alert
                type="info"
                showIcon
                message="模块按优先级逐个运行"
                description="当前模块未达到答案、建议问或其他有效输出条件时，才进入下一模块。"
              />
            </Form>
          ) : (
            <Alert type="warning" showIcon message="当前工作区没有可用识别模块" />
          )}
        </Card>
      </div>
    </div>
  );
}
