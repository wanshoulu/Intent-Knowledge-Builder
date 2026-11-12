import { Tabs, Tag } from 'antd';
import type {
  RecognitionResult,
  RecognitionTargetType
} from '../domain/types';
import { RecognitionTracePanel } from './RecognitionTracePanel';
import { TextPipelineTracePanel } from './TextPipelineTracePanel';

const targetTypeLabels: Record<RecognitionTargetType, string> = {
  faq: 'FAQ 问答',
  task: '任务意图',
  clarification: '澄清意图',
  chat: '基本对话'
};

const decisionLabels: Record<RecognitionResult['decision'], string> = {
  matched: '达到答案阈值',
  clarification: '等待补充信息',
  suggested: '达到建议问条件',
  ambiguous: '候选差异不足',
  rejected: '未达到输出条件'
};

export function RecognitionProcessPanel({
  result
}: {
  result: RecognitionResult;
}) {
  const changedNormalizationSteps =
    result.pipelineTrace.normalization.systemSteps.filter(
      (step) => step.changed
    ).length +
    result.pipelineTrace.normalization.ruleSteps.filter(
      (step) => step.matched
    ).length;
  const matchedExpressionCount = result.expressionTraces.filter(
    (trace) => trace.matched
  ).length;

  return (
    <section className="recognition-process-panel" aria-label="识别过程">
      <div className="recognition-process-heading">
        <div>
          <strong>识别过程</strong>
          <p>关键摘要默认可见，详细执行证据按工作域查看。</p>
        </div>
        <Tag color="blue">共享内核</Tag>
      </div>
      <div className="recognition-stage-grid">
        <div>
          <i>1</i>
          <span><strong>文本规范化</strong>{changedNormalizationSteps} 项生效</span>
        </div>
        <div>
          <i>2</i>
          <span>
            <strong>词类归一</strong>
            {result.pipelineTrace.canonicalText || '（空）'}
          </span>
        </div>
        <div>
          <i>3</i>
          <span>
            <strong>规则与候选</strong>
            表达式 {matchedExpressionCount} · 候选 {result.candidates.length}
          </span>
        </div>
        <div>
          <i>4</i>
          <span><strong>阈值决策</strong>{decisionLabels[result.decision]}</span>
        </div>
      </div>
      <Tabs
        className="recognition-process-tabs"
        defaultActiveKey="normalization"
        items={[
          {
            key: 'normalization',
            label: '文本处理',
            children: (
              <TextPipelineTracePanel
                trace={result.pipelineTrace}
                view="normalization"
              />
            )
          },
          {
            key: 'segmentation',
            label: '词类明细',
            children: (
              <TextPipelineTracePanel
                trace={result.pipelineTrace}
                view="segmentation"
              />
            )
          },
          {
            key: 'questions',
            label: '问法与模板',
            children: (
              <RecognitionTracePanel trace={result.trace} view="questions" />
            )
          },
          {
            key: 'candidates',
            label: '候选竞争',
            children: (
              <div className="recognition-candidate-list">
                {result.candidates.length ? result.candidates.slice(0, 5).map(
                  (candidate, index) => (
                    <article key={candidate.targetId}>
                      <div>
                        <span>#{index + 1}</span>
                        <strong>
                          候选：{candidate.targetName} · {candidate.score.toFixed(2)}
                        </strong>
                      </div>
                      <Tag color={candidate.excluded ? 'red' : index === 0 ? 'green' : 'default'}>
                        {candidate.excluded ? '已排除' : index === 0 ? '当前第一名' : '参与竞争'}
                      </Tag>
                    </article>
                  )
                ) : <p className="pipeline-empty-note">当前没有候选目标。</p>}
              </div>
            )
          },
          {
            key: 'thresholds',
            label: '阈值轨迹',
            children: (
              <RecognitionTracePanel trace={result.trace} view="thresholds" />
            )
          },
          {
            key: 'answer',
            label: '答案与动作',
            children: (
              <div className="recognition-answer-detail">
                <div>
                  <span>最终类型</span>
                  <strong>
                    {result.target
                      ? targetTypeLabels[result.target.targetType ?? 'faq']
                      : '拒识'}
                  </strong>
                </div>
                <div>
                  <span>识别编码</span>
                  <strong>{result.target?.intentCode || '-'}</strong>
                </div>
                <div className="recognition-answer-detail-wide">
                  <span>最终答案</span>
                  <strong>{result.answer || '未返回答案'}</strong>
                </div>
                <div>
                  <span>提取槽位</span>
                  <strong>
                    {Object.keys(result.extractedSlots).length
                      ? Object.entries(result.extractedSlots)
                          .map(([key, value]) => `${key}=${value}`)
                          .join('、')
                      : '未提取槽位'}
                  </strong>
                </div>
                <div>
                  <span>执行动作</span>
                  <strong>
                    {result.actionIds.length
                      ? result.actionIds.join('、')
                      : '无执行动作'}
                  </strong>
                </div>
              </div>
            )
          }
        ]}
      />
    </section>
  );
}
