import { Alert, Checkbox, Form, Input, Select } from 'antd';
import type { MaterialReference } from '../domain/types';

export interface KnowledgeMetadataValue {
  categoryPath: string[];
  businessInstanceName: string;
  knowledgeAttribute: string;
  channels: string[];
  recommended: boolean;
  validFrom: string;
  validTo: string;
  sourceInstruction: string;
  materialRefs: MaterialReference[];
}

interface KnowledgeMetadataEditorProps {
  value: KnowledgeMetadataValue;
  onChange: (patch: Partial<KnowledgeMetadataValue>) => void;
}

export function KnowledgeMetadataEditor({ value, onChange }: KnowledgeMetadataEditorProps) {
  const firstMaterial = value.materialRefs[0];
  const updateMaterial = (patch: Partial<MaterialReference>) => {
    const next: MaterialReference = {
      id: patch.id ?? firstMaterial?.id ?? '',
      type: patch.type ?? firstMaterial?.type ?? 'unknown',
      name: patch.name ?? firstMaterial?.name
    };
    onChange({ materialRefs: next.id.trim() ? [next] : [] });
  };

  return (
    <div className="structured-editor-panel">
      <Alert
        type="info"
        showIcon
        message="这些字段对应小 i A-V 汇总表中的分类、实例、属性、维度、推荐、指令、素材和有效期。"
      />
      <div className="editor-form">
        <Form.Item label="完整分类路径" help="用 / 分隔，最多五级；导出时对应分类一至分类五。">
          <Input
            aria-label="完整分类路径"
            value={value.categoryPath.join(' / ')}
            onChange={(event) => onChange({
              categoryPath: event.target.value.split('/').map((part) => part.trim()).filter(Boolean).slice(0, 5)
            })}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="业务实例名称">
            <Input
              aria-label="业务实例名称"
              value={value.businessInstanceName}
              onChange={(event) => onChange({ businessInstanceName: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="知识属性">
            <Input
              aria-label="知识属性"
              value={value.knowledgeAttribute}
              onChange={(event) => onChange({ knowledgeAttribute: event.target.value })}
            />
          </Form.Item>
        </div>
        <Form.Item label="适用渠道" help="多个渠道使用逗号分隔。">
          <Input
            aria-label="适用渠道"
            value={value.channels.join('，')}
            onChange={(event) => onChange({
              channels: event.target.value.split(/[,，]/).map((part) => part.trim()).filter(Boolean)
            })}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="生效日期">
            <Input
              type="date"
              aria-label="生效日期"
              value={value.validFrom}
              onChange={(event) => onChange({ validFrom: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="失效日期">
            <Input
              type="date"
              aria-label="失效日期"
              value={value.validTo}
              onChange={(event) => onChange({ validTo: event.target.value })}
            />
          </Form.Item>
        </div>
        <Form.Item>
          <Checkbox
            aria-label="推荐知识"
            checked={value.recommended}
            onChange={(event) => onChange({ recommended: event.target.checked })}
          >
            推荐知识（只影响建议问排序，不增加识别分）
          </Checkbox>
        </Form.Item>
        <Form.Item label="原始指令" help="保留 rq、ro、nenu 等兼容文本；只有完成结构化绑定后才可执行。">
          <Input.TextArea
            aria-label="原始指令"
            rows={3}
            value={value.sourceInstruction}
            onChange={(event) => onChange({ sourceInstruction: event.target.value })}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="素材 ID">
            <Input
              aria-label="素材 ID"
              value={firstMaterial?.id ?? ''}
              onChange={(event) => updateMaterial({ id: event.target.value })}
            />
          </Form.Item>
          <Form.Item label="素材类型">
            <Select
              aria-label="素材类型"
              value={firstMaterial?.type ?? 'unknown'}
              onChange={(type) => updateMaterial({ type })}
              options={[
                { label: '附件', value: 'attachment' },
                { label: '图片', value: 'image' },
                { label: '视频', value: 'video' },
                { label: '富媒体', value: 'rich_media' },
                { label: '未知', value: 'unknown' }
              ]}
            />
          </Form.Item>
        </div>
      </div>
    </div>
  );
}
