import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Input, Tag } from 'antd';
import { useState } from 'react';
import { ConditionRecordEditor } from './ConditionRecordEditor';

interface DebugConditionPanelProps {
  channel: string;
  category: string;
  dimensions: Record<string, string>;
  context: Record<string, string>;
  onCategoryChange: (value: string) => void;
  onDimensionsChange: (value: Record<string, string>) => void;
  onContextChange: (value: Record<string, string>) => void;
  onInvalidateResult: () => void;
}

function compactRecord(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => key.trim() && String(value).trim()
    )
  );
}

export function DebugConditionPanel({
  channel,
  category,
  dimensions,
  context,
  onCategoryChange,
  onDimensionsChange,
  onContextChange,
  onInvalidateResult
}: DebugConditionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const effectiveDimensions = compactRecord(dimensions);
  const effectiveContext = compactRecord(context);

  return (
    <section className="debug-condition-panel">
      <div className="debug-condition-summary">
        <strong>识别条件</strong>
        <div className="debug-condition-tags">
          <Tag>渠道：{channel}</Tag>
          <Tag>知识类别：{category.trim() || '全部'}</Tag>
          <Tag>业务维度 {Object.keys(effectiveDimensions).length}</Tag>
          <Tag>上下文 {Object.keys(effectiveContext).length}</Tag>
        </div>
        <Button
          type="link"
          aria-expanded={expanded}
          aria-label={expanded ? '收起编辑条件' : '展开编辑条件'}
          icon={expanded ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起编辑条件' : '展开编辑条件'}
        </Button>
      </div>
      {expanded ? (
        <div className="debug-condition-editor">
          <p>
            当前渠道：{channel}。这里的输入会与模块运行条件逐项比较。
          </p>
          <Input
            aria-label="调试知识类别"
            value={category}
            placeholder="知识类别（可选）"
            onChange={(event) => {
              onCategoryChange(event.target.value);
              onInvalidateResult();
            }}
          />
          <div className="debug-condition-grid">
            <div>
              <strong>业务维度</strong>
              <ConditionRecordEditor
                addButtonLabel="添加调试业务维度"
                nameLabel="调试业务维度名称"
                valueLabel="调试业务维度值"
                commonKeys={[
                  { key: 'region', label: '地区' },
                  { key: 'segment', label: '客群' }
                ]}
                multipleValues={false}
                initialEmptyRows={1}
                onChange={(nextDimensions) => {
                  onDimensionsChange(
                    Object.fromEntries(
                      Object.entries(nextDimensions).map(([key, value]) => [
                        key,
                        Array.isArray(value) ? value[0] : value
                      ])
                    )
                  );
                  onInvalidateResult();
                }}
              />
            </div>
            <div>
              <strong>会话上下文</strong>
              <ConditionRecordEditor
                addButtonLabel="添加调试上下文"
                nameLabel="调试上下文名称"
                valueLabel="调试上下文值"
                commonKeys={[
                  { key: 'scene', label: '会话场景' },
                  { key: 'previousIntent', label: '上一意图' },
                  { key: 'sessionStage', label: '会话阶段' }
                ]}
                multipleValues={false}
                initialEmptyRows={1}
                onChange={(nextContext) => {
                  onContextChange(
                    Object.fromEntries(
                      Object.entries(nextContext).map(([key, value]) => [
                        key,
                        Array.isArray(value) ? value[0] : value
                      ])
                    )
                  );
                  onInvalidateResult();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
