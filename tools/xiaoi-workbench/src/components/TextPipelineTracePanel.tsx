import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Collapse, Table, Tag } from 'antd';
import type { RecognitionResult } from '../domain/types';

export function TextPipelineTracePanel({
  trace,
  view = 'all'
}: {
  trace: RecognitionResult['pipelineTrace'];
  view?: 'all' | 'normalization' | 'segmentation';
}) {
  const showNormalization = view !== 'segmentation';
  const showSegmentation = view !== 'normalization';
  const summaryItems = [
    ...(showNormalization
      ? [
          { label: '原始问题', value: trace.originalText },
          { label: '规范化结果', value: trace.normalization.output }
        ]
      : []),
    ...(showSegmentation
      ? [{ label: '词类归一结果', value: trace.canonicalText }]
      : [])
  ];
  const collapseItems = [
    ...(showNormalization
      ? [{
          key: 'normalization',
          label: '规范化处理',
          children: (
            <div className="pipeline-step-list">
              {trace.normalization.systemSteps.map((step) => (
                <div key={step.operation} className="pipeline-step">
                  <Tag color={step.changed ? 'blue' : 'default'}>{step.operation}</Tag>
                  <code>{step.before || '（空）'} → {step.after || '（空）'}</code>
                </div>
              ))}
              {trace.normalization.ruleSteps.length ? (
                trace.normalization.ruleSteps.map((step) => (
                  <div key={step.ruleId} className="pipeline-step">
                    <Tag color={step.error ? 'red' : step.matched ? 'green' : 'default'}>
                      {step.ruleName}
                    </Tag>
                    <code>{step.before || '（空）'} → {step.after || '（空）'}</code>
                    <span>{step.error ? `执行失败：${step.error}` : step.matched ? '已生效' : '未匹配'}</span>
                  </div>
                ))
              ) : (
                <p className="pipeline-empty-note">没有启用的业务预处理规则。</p>
              )}
            </div>
          )
        }]
      : []),
    ...(showSegmentation
      ? [{
          key: 'segmentation',
          label: '分词候选与选择',
          children: (
            <>
              <p className="pipeline-strategy">{trace.segmentation.strategy}</p>
              <Table
                size="small"
                pagination={false}
                rowKey={(candidate) =>
                  `${candidate.lexiconId}-${candidate.start}-${candidate.end}-${candidate.text}`
                }
                dataSource={trace.segmentation.candidates}
                locale={{ emptyText: '没有词类候选' }}
                columns={[
                  { title: '原文', dataIndex: 'text' },
                  { title: '归一词', dataIndex: 'normalized' },
                  { title: '词类', dataIndex: 'lexiconName' },
                  {
                    title: '位置',
                    render: (_, candidate) => `${candidate.start}-${candidate.end}`
                  },
                  {
                    title: '选择',
                    render: (_, candidate) => candidate.selected ? (
                      <Tag icon={<CheckCircleOutlined />} color="green">入选</Tag>
                    ) : (
                      <Tag icon={<CloseCircleOutlined />} color="default">舍弃</Tag>
                    )
                  },
                  { title: '依据', dataIndex: 'reason' }
                ]}
              />
            </>
          )
        }]
      : [])
  ];

  return (
    <section className="text-pipeline-trace" aria-label="文本处理流水线">
      <div className="pipeline-heading">
        <div>
          <strong>文本处理流水线</strong>
          <p>展示真实执行过程，不使用模型补写解释。</p>
        </div>
        <Tag color="blue">共享内核</Tag>
      </div>
      <div className="pipeline-summary">
        {summaryItems.map((item) => (
          <span key={item.label}>
            <small>{item.label}</small>{item.value || '（空）'}
          </span>
        ))}
      </div>
      <Collapse
        defaultActiveKey={collapseItems.map((item) => item.key)}
        items={collapseItems}
      />
    </section>
  );
}
