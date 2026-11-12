import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, Modal, Select, Space } from 'antd';
import { useEffect } from 'react';
import type { InteractionAction } from '../domain/types';

interface ActionEditorModalProps {
  action?: InteractionAction;
  open: boolean;
  onCancel: () => void;
  onSave: (action: InteractionAction) => void;
}

const sourceOptions = [
  { label: '知识点槽位', value: 'slot' },
  { label: '业务维度', value: 'dimension' },
  { label: '会话上下文', value: 'context' },
  { label: '固定值', value: 'literal' }
];

export function ActionEditorModal({
  action,
  open,
  onCancel,
  onSave
}: ActionEditorModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: action?.name ?? '',
      actionCode: action?.actionCode ?? '',
      type: action?.type ?? 'navigation',
      payloadPath: action?.payload.path ?? '/',
      channels: action?.channels ?? ['手机银行'],
      inputMappings: action?.inputMappings ?? []
    });
  }, [action, form, open]);

  const handleSave = async () => {
    const values = await form.validateFields();
    onSave({
      id: action?.id ?? `action-${Date.now().toString(36)}`,
      name: values.name.trim(),
      actionCode: values.actionCode.trim(),
      type: values.type,
      payload: { path: values.payloadPath.trim() },
      channels: values.channels,
      status: action?.status ?? 'draft',
      inputMappings: (values.inputMappings ?? []).map(
        (mapping: Record<string, unknown>) => ({
          parameter: String(mapping.parameter ?? '').trim(),
          source: mapping.source,
          sourceKey:
            mapping.source === 'literal'
              ? undefined
              : String(mapping.sourceKey ?? '').trim(),
          literalValue:
            mapping.source === 'literal'
              ? String(mapping.literalValue ?? '')
              : undefined,
          required: Boolean(mapping.required)
        })
      )
    });
  };

  return (
    <Modal
      title={action ? '编辑交互动作' : '新建交互动作'}
      open={open}
      width={760}
      okText="保存动作"
      cancelText="取消"
      onOk={handleSave}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <div className="action-form-grid">
          <Form.Item
            name="name"
            label="动作名称"
            rules={[{ required: true, message: '请输入动作名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="actionCode"
            label="动作编码"
            rules={[{ required: true, message: '请输入动作编码' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="type" label="动作类型">
            <Select
              options={[
                { label: '页面导航', value: 'navigation' },
                { label: '执行指令', value: 'command' },
                { label: '附件', value: 'attachment' },
                { label: '富媒体', value: 'rich_media' },
                { label: '建议选项', value: 'suggestion' }
              ]}
            />
          </Form.Item>
          <Form.Item name="channels" label="生效渠道">
            <Select
              mode="multiple"
              options={['手机银行', 'Web', '微信'].map((value) => ({
                label: value,
                value
              }))}
            />
          </Form.Item>
        </div>
        <Form.Item
          name="payloadPath"
          label="请求路径或载荷模板"
          extra="可使用 {参数名} 占位，例如 /appointment?time={appointment_time}"
          rules={[{ required: true, message: '请输入请求路径或载荷模板' }]}
        >
          <Input />
        </Form.Item>

        <div className="action-mapping-heading">
          <div>
            <strong>参数映射</strong>
            <p>定义动作参数从知识点槽位、业务维度或上下文中的取值方式。</p>
          </div>
        </div>
        <Form.List name="inputMappings">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Space key={key} className="action-mapping-row" align="start">
                  <Form.Item
                    name={[name, 'parameter']}
                    rules={[{ required: true, message: '必填' }]}
                  >
                    <Input placeholder="参数名" />
                  </Form.Item>
                  <Form.Item
                    name={[name, 'source']}
                    rules={[{ required: true, message: '必填' }]}
                  >
                    <Select
                      placeholder="参数来源"
                      options={sourceOptions}
                      style={{ width: 130 }}
                    />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate>
                    {({ getFieldValue }) => {
                      const source = getFieldValue([
                        'inputMappings',
                        name,
                        'source'
                      ]);
                      return (
                        <Form.Item
                          name={[
                            name,
                            source === 'literal' ? 'literalValue' : 'sourceKey'
                          ]}
                          rules={[{ required: true, message: '必填' }]}
                        >
                          <Input
                            placeholder={
                              source === 'literal' ? '固定值' : '来源字段'
                            }
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <Form.Item name={[name, 'required']} valuePropName="checked">
                    <Checkbox>必填</Checkbox>
                  </Form.Item>
                  <Button
                    aria-label="删除参数映射"
                    icon={<DeleteOutlined />}
                    onClick={() => remove(name)}
                  />
                </Space>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({ source: 'slot', required: true })
                }
              >
                添加参数映射
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
