import { ApartmentOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Form, Input, List, Modal, Space, Table, Tag, message } from 'antd';
import { useState } from 'react';
import { ConceptSemanticEditor } from '../components/ConceptSemanticEditor';
import { InspectorPanel } from '../components/InspectorPanel';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { useWorkbench } from '../state/WorkbenchProvider';
import type { BusinessConcept } from '../domain/types';

export function ConceptsPage() {
  const { state, addConcept, updateConcept, addTemplate } = useWorkbench();
  const [selectedId, setSelectedId] = useState(state.concepts[0]?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const selected = state.concepts.find((concept) => concept.id === selectedId);
  const templates = state.templates.filter((template) => template.conceptId === selectedId);
  const templateIds = new Set(templates.map((template) => template.id));
  const referencedKnowledgeCount = state.knowledgeItems.filter((item) =>
    item.conceptTemplateIds.some((id) => templateIds.has(id)) ||
    item.businessInstanceName === selected?.name
  ).length;
  const referencedExpressionCount = selected
    ? state.expressions.filter((expression) =>
        expression.dsl.includes(selected.semanticBlock ?? '__never__') ||
        expression.visualSummary.includes(selected.name)
      ).length
    : 0;

  const handleCreateConcept = async () => {
    const values = await createForm.validateFields();
    const concept: BusinessConcept = {
      id: `concept-${Date.now().toString(36)}`,
      name: values.name.trim(),
      description: values.description?.trim() || '',
      attributes: [],
      instanceCount: 0,
      status: 'draft',
    };
    addConcept(concept);
    setCreateOpen(false);
    createForm.resetFields();
    setSelectedId(concept.id);
    messageApi.success('概念已创建');
  };

  const handleCreateTemplate = async () => {
    const values = await templateForm.validateFields();
    addTemplate({
      id: `tpl-${Date.now().toString(36)}`,
      conceptId: selectedId!,
      name: values.name.trim(),
      questionTemplate: values.questionTemplate.trim(),
      answerTemplate: values.answerTemplate.trim(),
      status: 'draft',
    });
    setTemplateOpen(false);
    templateForm.resetFields();
    messageApi.success('模板已创建');
  };

  return (
    <div>
      {contextHolder}
      <PageHeader
        title="业务概念模型"
        description="以业务概念、属性和知识模板规模化生产一致的知识草稿"
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建概念</Button>}
      />
      <div className="concept-grid">
        <aside className="concept-tree">
          <div className="panel-heading">概念目录</div>
          <List
            dataSource={state.concepts}
            renderItem={(concept) => (
              <List.Item
                className={concept.id === selectedId ? 'category-item active' : 'category-item'}
                onClick={() => {
                  setSelectedId(concept.id);
                }}
              >
                <Space><ApartmentOutlined />{concept.name}</Space>
              </List.Item>
            )}
          />
        </aside>
        <section className="concept-editor">
          {selected ? (
            <>
              <div className="section-title">
                <div>
                  <h2>当前概念：{selected.name}</h2>
                  <p>{selected.description}</p>
                </div>
                <StatusTag status={selected.status} />
              </div>
              <Card size="small" title="业务属性">
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={selected.attributes}
                  columns={[
                    { title: '属性名', dataIndex: 'name' },
                    { title: '数据类型', dataIndex: 'dataType' },
                    {
                      title: '约束',
                      dataIndex: 'required',
                      render: (required: boolean) => required ? <Tag color="red">必填</Tag> : <Tag>可选</Tag>
                    }
                  ]}
                />
              </Card>
              <ConceptSemanticEditor
                concept={selected}
                referencedKnowledgeCount={referencedKnowledgeCount}
                referencedExpressionCount={referencedExpressionCount}
                onSave={(patch) => {
                  updateConcept(selected.id, patch);
                  messageApi.success('语义配置已保存');
                }}
              />
              <Card size="small" title="知识模板" className="section-card">
                <List
                  dataSource={templates}
                  renderItem={(template) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Space>{template.name}<StatusTag status={template.status} /></Space>}
                        description={`${template.questionTemplate} → ${template.answerTemplate}`}
                      />
                    </List.Item>
                  )}
                />
                <Button
                  aria-label="新建模板"
                  icon={<PlusOutlined />}
                  onClick={() => { templateForm.resetFields(); setTemplateOpen(true); }}
                >
                  新建模板
                </Button>
              </Card>
            </>
          ) : null}
        </section>
        <InspectorPanel title="模型检查">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="概念数">{state.concepts.length}</Descriptions.Item>
            <Descriptions.Item label="模板数">{state.templates.length}</Descriptions.Item>
            <Descriptions.Item label="实例数">{selected?.instanceCount ?? 0}</Descriptions.Item>
          </Descriptions>
          <div className="inspector-section">
            <div className="inspector-label">语义边界</div>
            <p>这里是业务对象建模，不是 OWL/RDF 形式本体编辑器。</p>
          </div>
        </InspectorPanel>
      </div>

      <Modal title="新建业务概念" open={createOpen} okText="创建" cancelText="取消"
        onOk={handleCreateConcept} onCancel={() => setCreateOpen(false)} width={520}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="概念名称" rules={[{ required: true, message: '请输入概念名称' }]}>
            <Input placeholder="例如：时间查询类" />
          </Form.Item>
          <Form.Item name="description" label="概念描述">
            <Input.TextArea rows={3} placeholder="描述该概念的建模目标与适用范围" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新建知识模板" open={templateOpen} okText="创建" cancelText="取消"
        onOk={handleCreateTemplate} onCancel={() => setTemplateOpen(false)} width={560}>
        <Form form={templateForm} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="例如：查询业务时间" />
          </Form.Item>
          <Form.Item name="questionTemplate" label="问法骨架" rules={[{ required: true }]}
            help="用 {属性名} 作为占位符">
            <Input placeholder="例如：怎么查询{业务对象}的{时间类型}？" />
          </Form.Item>
          <Form.Item name="answerTemplate" label="答案骨架" rules={[{ required: true }]}>
            <Input placeholder="例如：您可以进入{业务对象}页面查看{时间类型}。" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
