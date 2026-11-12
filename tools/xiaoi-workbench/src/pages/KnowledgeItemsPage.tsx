import {
  CompressOutlined,
  DownloadOutlined,
  FullscreenOutlined,
  PlusOutlined
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Drawer,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Table,
  Tag
} from 'antd';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { InspectorPanel } from '../components/InspectorPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import type { KnowledgeItem } from '../domain/types';
import { downloadAvWorkbook } from '../services/xiaoiAvExport';
import { useWorkbench } from '../state/WorkbenchProvider';
import { KnowledgeItemEditorPage } from './KnowledgeItemEditorPage';

export function KnowledgeItemsPage() {
  const { state, addKnowledgeItem } = useWorkbench();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: selectedId } = useParams();
  const [editorId, setEditorId] = useState(selectedId);
  const pathEditorId = location.pathname.match(/^\/knowledge-items\/([^/]+)$/)?.[1];
  const activeEditorId = editorId ?? selectedId ?? pathEditorId;
  const [category, setCategory] = useState('全部知识');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [createForm] = Form.useForm();
  const [modalApi, modalContextHolder] = Modal.useModal();
  useEffect(() => {
    if (selectedId) {
      setEditorId(selectedId);
      return;
    }
    if (!window.location.hash.includes('/knowledge-items/')) {
      setEditorId(undefined);
    }
  }, [selectedId]);

  const openEditor = (id: string) => {
    setEditorDirty(false);
    setEditorId(id);
    navigate(`/knowledge-items/${id}`);
  };

  const closeEditor = () => {
    setEditorDirty(false);
    setEditorId(undefined);
    setEditorFullscreen(false);
    navigate('/knowledge-items');
  };

  const requestCloseEditor = () => {
    if (!editorDirty) {
      closeEditor();
      return;
    }
    modalApi.confirm({
      title: '放弃未保存修改？',
      content: '当前知识点还有未保存内容，关闭后这些修改将丢失。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: closeEditor
    });
  };
  const categories = ['全部知识', ...new Set(state.knowledgeItems.map((item) => item.domain))];
  const filteredItems = state.knowledgeItems.filter((item) => {
    const inCategory = category === '全部知识' || item.domain === category;
    const matchesQuery =
      !query ||
      item.name.includes(query) ||
      item.standardQuestion.includes(query) ||
      item.owner.includes(query);
    return inCategory && matchesQuery;
  });
  const issueCount = filteredItems.reduce((sum, item) => sum + item.issues.length, 0);
  const createKnowledgeItem = async () => {
    const values = await createForm.validateFields();
    const id = `ki-${Date.now().toString(36)}`;
    addKnowledgeItem({
      id,
      name: values.name?.trim() || values.standardQuestion.trim(),
      targetType: values.targetType,
      intentCode: values.intentCode,
      category: values.category,
      domain: values.domain,
      scene: values.scene,
      owner: '当前用户',
      status: 'draft',
      draftVersion: 1,
      standardQuestion: values.standardQuestion,
      standardAnswer: values.standardAnswer,
      expandedQuestions: [],
      channels: ['Web'],
      lexiconIds: [],
      expressionIds: [],
      positiveExpressionIds: [],
      negativeExpressionIds: [],
      conceptTemplateIds: [],
      actionIds: [],
      answerVariants: [],
      slots: [],
      qualityScore: 80,
      issues: [],
      updatedAt: new Date().toLocaleString('zh-CN')
    });
    setCreateOpen(false);
    createForm.resetFields();
    openEditor(id);
  };

  const columns = [
    {
      title: '知识点',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, item: KnowledgeItem) => (
        <Button
          type="link"
          className="table-primary-link"
          onClick={() => openEditor(item.id)}
        >
          {name}
        </Button>
      )
    },
    {
      title: '目标类型',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 100,
      render: (targetType: KnowledgeItem['targetType']) => (
        <Tag color={targetType === 'task' ? 'blue' : 'green'}>
          {targetType === 'task' ? '任务意图' : 'FAQ'}
        </Tag>
      )
    },
    {
      title: '识别编码',
      dataIndex: 'intentCode',
      key: 'intentCode',
      width: 190,
      render: (intentCode?: string) => intentCode ?? '-'
    },
    { title: '领域', dataIndex: 'domain', key: 'domain', width: 100 },
    { title: '分类', dataIndex: 'category', key: 'category', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (status: KnowledgeItem['status']) => <StatusTag status={status} />
    },
    {
      title: '质量分',
      dataIndex: 'qualityScore',
      key: 'qualityScore',
      width: 90,
      render: (score: number) => (
        <span className={score < 90 ? 'quality-score-warning' : 'quality-score-good'}>
          {score}
        </span>
      )
    },
    { title: '负责人', dataIndex: 'owner', key: 'owner', width: 90 },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 156 }
  ];

  return (
    <div>
      {modalContextHolder}
      <PageHeader
        title="知识点管理"
        description="以知识点为中心维护标准问、扩展问、识别模板、答案与交互动作"
        actions={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => downloadAvWorkbook(state, filteredItems)}
            >
              导出 A-V 汇总表
            </Button>
            <Button
              type="primary"
              aria-label="新建知识点"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              新建知识点
            </Button>
          </Space>
        }
      />
      <div className="knowledge-grid">
        <aside className="category-panel">
          <div className="panel-heading">业务领域</div>
          <List
            size="small"
            dataSource={categories}
            renderItem={(item) => (
              <List.Item
                className={item === category ? 'category-item active' : 'category-item'}
                onClick={() => setCategory(item)}
              >
                <span>{item}</span>
                <Badge
                  count={
                    item === '全部知识'
                      ? state.knowledgeItems.length
                      : state.knowledgeItems.filter((knowledge) => knowledge.domain === item).length
                  }
                  showZero
                  color={item === category ? '#1677ff' : '#b8bec8'}
                />
              </List.Item>
            )}
          />
        </aside>
        <section className="knowledge-table-panel">
          <div className="table-toolbar">
            <Input.Search
              aria-label="搜索知识点"
              allowClear
              placeholder="搜索名称、标准问或负责人"
              onSearch={setQuery}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Tag>{filteredItems.length} 条</Tag>
          </div>
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={filteredItems}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            scroll={{ x: 1160 }}
          />
        </section>
        <InspectorPanel title="列表质量概览">
          <div className="inspector-stat">
            <strong>{issueCount}</strong>
            <span>待处理提示</span>
          </div>
          <div className="inspector-stat">
            <strong>
              {filteredItems.filter((item) => item.status === 'in_review').length}
            </strong>
            <span>待审核知识</span>
          </div>
          <div className="inspector-section">
            <div className="inspector-label">当前筛选</div>
            <p>{category}</p>
          </div>
          <div className="inspector-section">
            <div className="inspector-label">发布建议</div>
            <p>先处理质量分低于 90 的对象，再提交统一回归。</p>
          </div>
        </InspectorPanel>
      </div>
      <Modal
        title="新建知识点"
        open={createOpen}
        okText="创建并编辑"
        cancelText="取消"
        onOk={createKnowledgeItem}
        onCancel={() => setCreateOpen(false)}
        width={680}
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            targetType: 'faq',
            domain: '通用',
            category: '未分类',
            scene: '通用咨询'
          }}
        >
          <div className="rule-form-grid">
            <Form.Item name="targetType" label="识别目标类型" required>
              <Select
                aria-label="识别目标类型"
                options={[
                  { label: 'FAQ 问答', value: 'faq' },
                  { label: '任务意图', value: 'task' }
                ]}
              />
            </Form.Item>
            <Form.Item
              name="intentCode"
              label="识别编码"
              rules={[{ required: true, message: '请输入稳定识别编码' }]}
            >
              <Input aria-label="识别编码" placeholder="例如 query_branch_time" />
            </Form.Item>
          </div>
          <Form.Item
            name="name"
            label="内部名称（可选）"
            help="FAQ 留空时自动使用标准问；任务意图可填写便于管理的稳定名称"
          >
            <Input
              aria-label="内部名称（可选）"
              placeholder="例如：信用卡年费查询"
            />
          </Form.Item>
          <div className="rule-form-grid">
            <Form.Item name="domain" label="业务领域" required>
              <Input aria-label="业务领域" />
            </Form.Item>
            <Form.Item name="category" label="知识分类" required>
              <Input aria-label="知识分类" />
            </Form.Item>
          </div>
          <Form.Item name="scene" label="业务场景" required>
            <Input aria-label="业务场景" />
          </Form.Item>
          <Form.Item
            name="standardQuestion"
            label="标准问"
            rules={[{ required: true, message: '请输入标准问' }]}
          >
            <Input aria-label="新建标准问" />
          </Form.Item>
          <Form.Item
            name="standardAnswer"
            label="标准答案"
            rules={[{ required: true, message: '请输入标准答案' }]}
          >
            <Input.TextArea aria-label="新建标准答案" rows={4} />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer
        aria-label="编辑知识点"
        className="knowledge-editor-drawer"
        title={`编辑知识点${activeEditorId ? ` · ${state.knowledgeItems.find((item) => item.id === activeEditorId)?.name ?? activeEditorId}` : ''}`}
        open={Boolean(activeEditorId)}
        width={editorFullscreen ? '100vw' : '82vw'}
        placement="right"
        destroyOnHidden
        onClose={requestCloseEditor}
        extra={
          <Button
            aria-label={editorFullscreen ? '退出全屏编辑' : '全屏编辑'}
            icon={editorFullscreen ? <CompressOutlined /> : <FullscreenOutlined />}
            onClick={() => setEditorFullscreen((current) => !current)}
          >
            {editorFullscreen ? '退出全屏' : '全屏'}
          </Button>
        }
      >
        {activeEditorId ? (
          <KnowledgeItemEditorPage
            key={activeEditorId}
            embedded
            knowledgeItemId={activeEditorId}
            onClose={requestCloseEditor}
            onDirtyChange={setEditorDirty}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
