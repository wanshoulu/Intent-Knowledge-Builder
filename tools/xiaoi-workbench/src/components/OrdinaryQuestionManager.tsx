import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined
} from '@ant-design/icons';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag
} from 'antd';
import { useState } from 'react';
import type { ExpandedQuestion } from '../domain/types';

interface OrdinaryQuestionManagerProps {
  knowledgePointId: string;
  value: ExpandedQuestion[];
  onChange: (value: ExpandedQuestion[]) => void;
}

function createOrdinaryQuestion(knowledgePointId: string): ExpandedQuestion {
  return {
    id: `${knowledgePointId}-ordinary-${Date.now().toString(36)}`,
    knowledgePointId,
    kind: 'ordinary',
    content: '',
    enabled: true,
    priority: 100,
    weight: 1,
    status: 'draft',
    source: 'manual',
    revision: 1,
    testExamples: []
  };
}

export function OrdinaryQuestionManager({
  knowledgePointId,
  value,
  onChange
}: OrdinaryQuestionManagerProps) {
  const [editing, setEditing] = useState<ExpandedQuestion>();
  const [form] = Form.useForm<ExpandedQuestion>();

  const openEditor = (question?: ExpandedQuestion) => {
    const next = question ?? createOrdinaryQuestion(knowledgePointId);
    setEditing(next);
    form.setFieldsValue({
      ...next,
      testExamples: next.testExamples ?? []
    });
  };

  const saveQuestion = async () => {
    if (!editing) return;
    const fields = await form.validateFields();
    const samples = Array.isArray(fields.testExamples)
      ? fields.testExamples
      : String(fields.testExamples ?? '').split('\n');
    const next: ExpandedQuestion = {
      ...editing,
      ...fields,
      content: fields.content.trim(),
      source: fields.source ?? 'manual',
      revision: editing.content ? (editing.revision ?? 1) + 1 : 1,
      testExamples: samples.map((sample) => sample.trim()).filter(Boolean)
    };
    const exists = value.some((question) => question.id === next.id);
    onChange(
      exists
        ? value.map((question) => question.id === next.id ? next : question)
        : [...value, next]
    );
    setEditing(undefined);
    form.resetFields();
  };

  const columns = [
    {
      title: '普通问题',
      dataIndex: 'content',
      key: 'content',
      render: (content: string, question: ExpandedQuestion) => (
        <div className="ordinary-question-copy">
          <strong>{content}</strong>
          <span>{question.testExamples?.length ?? 0} 条测试样例</span>
        </div>
      )
    },
    {
      title: '状态',
      key: 'status',
      width: 150,
      render: (_: unknown, question: ExpandedQuestion) => (
        <Space size={6}>
          <Tag color={question.enabled ? 'green' : 'default'}>
            {question.enabled ? '已启用' : '已停用'}
          </Tag>
          <Tag>{question.status === 'published' ? '已发布' : question.status === 'in_review' ? '审核中' : '草稿'}</Tag>
        </Space>
      )
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      width: 76
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 84
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 82,
      render: (source?: ExpandedQuestion['source']) =>
        source === 'imported' ? '导入' : source === 'generated' ? '生成' : '人工'
    },
    {
      title: '操作',
      key: 'actions',
      width: 116,
      render: (_: unknown, question: ExpandedQuestion) => (
        <Space size={2}>
          <Button
            type="text"
            aria-label={`编辑普通问题 ${question.content}`}
            icon={<EditOutlined />}
            onClick={() => openEditor(question)}
          />
          <Popconfirm
            title="删除这条普通问题？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => onChange(value.filter((item) => item.id !== question.id))}
          >
            <Button
              type="text"
              danger
              aria-label={`删除普通问题 ${question.content}`}
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="structured-editor-panel ordinary-question-manager">
      <div className="structured-list-header">
        <div>
          <h3>普通问题</h3>
          <p>逐条维护自然语言问法；状态、权重和优先级会直接参与识别与发布。</p>
        </div>
        <Space>
          <Tag>{value.length} 条</Tag>
          <Button
            type="primary"
            aria-label="新增普通问题"
            icon={<PlusOutlined />}
            onClick={() => openEditor()}
          >
            新增普通问题
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={value}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无普通问题，请增加真实用户问法"
            />
          )
        }}
        scroll={{ x: 760 }}
      />
      <Modal
        title={editing?.content ? '编辑普通问题' : '新增普通问题'}
        open={Boolean(editing)}
        okText="保存普通问题"
        cancelText="取消"
        onOk={saveQuestion}
        onCancel={() => {
          setEditing(undefined);
          form.resetFields();
        }}
        width={680}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="content"
            label="普通问题内容"
            rules={[
              { required: true, whitespace: true, message: '请输入普通问题' },
              {
                validator: (_, content: string) =>
                  value.some(
                    (question) =>
                      question.id !== editing?.id &&
                      question.content.trim() === content?.trim()
                  )
                    ? Promise.reject(new Error('该普通问题已经存在'))
                    : Promise.resolve()
              }
            ]}
          >
            <Input.TextArea
              aria-label="普通问题内容"
              rows={3}
              placeholder="例如：帮我约一下明天下午的网点"
            />
          </Form.Item>
          <div className="structured-card-grid">
            <Form.Item name="weight" label="权重" required>
              <InputNumber
                aria-label="普通问题权重"
                min={0}
                max={10}
                step={0.1}
                precision={2}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item name="priority" label="优先级" required>
              <InputNumber
                aria-label="普通问题优先级"
                min={0}
                max={9999}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>
          <div className="structured-card-grid">
            <Form.Item name="status" label="生命周期状态">
              <Select
                aria-label="普通问题状态"
                options={[
                  { label: '草稿', value: 'draft' },
                  { label: '审核中', value: 'in_review' },
                  { label: '已批准', value: 'approved' },
                  { label: '已发布', value: 'published' },
                  { label: '已归档', value: 'archived' }
                ]}
              />
            </Form.Item>
            <Form.Item name="source" label="来源">
              <Select
                aria-label="普通问题来源"
                options={[
                  { label: '人工维护', value: 'manual' },
                  { label: '批量导入', value: 'imported' },
                  { label: '辅助生成', value: 'generated' }
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="enabled" label="识别状态" valuePropName="checked">
            <Switch
              aria-label="启用普通问题"
              checkedChildren="启用"
              unCheckedChildren="停用"
            />
          </Form.Item>
          <Form.Item
            name="testExamples"
            label="测试样例"
            getValueFromEvent={(event) => event.target.value.split('\n')}
            getValueProps={(samples?: string[]) => ({ value: (samples ?? []).join('\n') })}
            extra="每行一条；用于发布前回归验证该普通问题。"
          >
            <Input.TextArea
              aria-label="普通问题测试样例"
              rows={4}
              placeholder="帮我约一下明天下午的网点"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
