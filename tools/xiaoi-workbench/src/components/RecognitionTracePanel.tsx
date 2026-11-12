import { Collapse, Tag } from 'antd';
import type { RecognitionResult } from '../domain/types';

interface TraceThresholds {
  answerThreshold?: number;
  searchThreshold?: number;
  minimumAnswerThreshold?: number;
  maximumSimilarityDifference?: number;
  minimumSimilarityDifference?: number;
}

interface TraceCandidate {
  knowledgePointId: string;
  knowledgePointName: string;
  score: number;
  ordinaryScore: number;
  templateScore: number;
  blockedByNegativeTemplate?: boolean;
  winningSource?: 'ordinary-question' | 'template';
  ordinaryComparisons?: Array<{
    id: string;
    type: 'standard' | 'ordinary';
    content: string;
    rawScore?: number;
    score: number;
    weight?: number;
    strategy?: string;
    formula?: string;
    components?: {
      queryWeight?: number;
      expressionWeight?: number;
      matchedWeight?: number;
      weightedDice?: number;
      conflictCoefficient?: number;
    };
  }>;
  templateTraces?: Array<{
    expandedQuestionId: string;
    polarity: 'positive' | 'negative';
    mode: 'base' | 'boost' | 'exact' | 'fallback';
    matched: boolean;
    score: number;
    rawScore?: number;
    boostFactor?: number;
    formula?: string | null;
    components?: {
      requiredCoverage?: number;
      queryPrecision?: number;
      matchQuality?: number;
      semanticPrecision?: number;
      optionalCoverage?: number;
      structuralSpecificity?: number;
    };
    missingTerms?: string[][];
    suppressed?: boolean;
    error?: string | null;
  }>;
}

interface ThresholdDecision {
  decision?: string;
  reason?: string;
  lead?: number;
  thresholds?: TraceThresholds;
}

interface ModuleTrace {
  moduleId: string;
  moduleName: string;
  priority: number;
  similarityStrategy?:
    | 'weighted-lexicon-dice-v1'
    | 'dice-bigram-v1'
    | 'lexicon-hybrid-v1';
  decision: string;
  conditions?: {
    matched?: boolean;
    failures?: Array<{
      type: 'dimension' | 'category' | 'context';
      key?: string;
      expected?: unknown;
      actual?: unknown;
    }>;
  };
  candidates?: TraceCandidate[];
  thresholdDecision?: ThresholdDecision;
}

const decisionLabels: Record<string, string> = {
  matched: '返回答案',
  suggested: '返回建议问',
  ambiguous: '结果不唯一',
  continue: '继续下一模块',
  rejected: '拒识'
};

const reasonLabels: Record<string, string> = {
  'answer-threshold-reached': '最高分达到答案阈值',
  'minimum-answer-with-clear-lead': '达到最低答案阈值，且领先差值足够大',
  'search-threshold-reached': '未达到答案条件，但达到搜索阈值',
  'high-score-candidates-too-close': '高分候选过于接近',
  'below-search-threshold': '最高分低于搜索阈值',
  'no-candidate': '当前模块没有可用候选',
  'module-conditions-not-met': '模块运行条件不满足，已进入下一模块'
};

function formatScore(value: number | undefined) {
  return typeof value === 'number' ? value.toFixed(2) : '-';
}

export function RecognitionTracePanel({
  trace,
  view = 'all'
}: {
  trace: RecognitionResult['trace'];
  view?: 'all' | 'questions' | 'thresholds';
}) {
  if (!trace?.modules.length) return null;

  const modules = trace.modules as unknown as ModuleTrace[];
  const answerSelection = trace.answerSelection;
  const showQuestions = view !== 'thresholds';
  const showThresholds = view !== 'questions';

  return (
    <section className="module-trace" aria-label="模块决策轨迹">
      <div className="module-trace-heading">
        <strong>
          {view === 'questions'
            ? '问法与模板明细'
            : view === 'thresholds'
              ? '模块决策轨迹'
              : '模块决策轨迹'}
        </strong>
        <Tag>{trace.engineVersion}</Tag>
      </div>
      {showThresholds && answerSelection ? (
        <div className="trace-decision" aria-label="答案选择轨迹">
          <div>
            <strong>答案选择：</strong>
            {answerSelection.source === 'variant'
              ? `采用答案变体 ${answerSelection.selectedVariantId}`
              : '没有满足全部维度的答案变体，采用标准答案'}
            {Object.keys(answerSelection.dimensions).length
              ? `；请求维度 ${Object.entries(answerSelection.dimensions)
                  .map(([key, value]) => `${key}=${value}`)
                  .join('、')}`
              : ''}
          </div>
          {answerSelection.candidates.length ? (
            <details className="trace-calculation-details">
              <summary>查看答案变体条件</summary>
              {answerSelection.candidates.map((candidate) => (
                <p key={candidate.variantId}>
                  {candidate.variantId}：
                  {candidate.selected
                    ? '已选择'
                    : candidate.matched
                      ? '条件满足，但具体度较低'
                      : '条件不满足'}
                  {candidate.conditions.length
                    ? `（${candidate.conditions
                        .map(
                          (condition) =>
                            `${condition.key} 期望 ${condition.expected}，实际 ${condition.actual ?? '未提供'}`
                        )
                        .join('；')}）`
                    : ''}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}
      <Collapse
        size="small"
        defaultActiveKey={[modules[0].moduleId]}
        items={modules.map((module) => {
          const thresholdDecision = module.thresholdDecision ?? {};
          const thresholds = thresholdDecision.thresholds ?? {};
          return {
            key: module.moduleId,
            label: (
              <span>
                {module.moduleName} · 优先级 {module.priority}
              </span>
            ),
            extra: (
              <Tag color={module.decision === 'matched' ? 'green' : 'default'}>
                {decisionLabels[module.decision] ?? module.decision}
              </Tag>
            ),
            children: (
              <>
                {showThresholds && module.conditions?.matched === false ? (
                  <div className="trace-condition-failures">
                    {(module.conditions.failures ?? []).map((failure, index) => (
                      <p key={`${failure.type}-${failure.key ?? index}`}>
                        {failure.type === 'dimension'
                          ? '维度条件'
                          : failure.type === 'category'
                            ? '类别条件'
                            : '上下文条件'}
                        {failure.key ? `「${failure.key}」` : ''}不满足：
                        期望 {JSON.stringify(failure.expected)}，实际 {JSON.stringify(failure.actual)}
                      </p>
                    ))}
                  </div>
                ) : null}
                {showThresholds ? (
                  <>
                    <div className="trace-thresholds">
                      <span>
                        普通问题策略 <strong>
                          {module.similarityStrategy === 'weighted-lexicon-dice-v1'
                            ? '有效词加权 Dice v1'
                            : module.similarityStrategy === 'lexicon-hybrid-v1'
                              ? '词类混合 v1（历史）'
                              : '字符 Dice（历史）'}
                        </strong>
                      </span>
                      <span>答案阈值 <strong>{formatScore(thresholds.answerThreshold)}</strong></span>
                      <span>搜索阈值 <strong>{formatScore(thresholds.searchThreshold)}</strong></span>
                      <span>最低答案阈值 <strong>{formatScore(thresholds.minimumAnswerThreshold)}</strong></span>
                      <span>最大相似差异 <strong>{formatScore(thresholds.maximumSimilarityDifference)}</strong></span>
                      <span>最小相似差异 <strong>{formatScore(thresholds.minimumSimilarityDifference)}</strong></span>
                    </div>
                    <div className="trace-decision">
                      <strong>阈值结论：</strong>
                      {reasonLabels[thresholdDecision.reason ?? ''] ??
                        thresholdDecision.reason ??
                        '未提供判定原因'}
                      {typeof thresholdDecision.lead === 'number'
                        ? `；第一名领先 ${thresholdDecision.lead.toFixed(2)}`
                        : ''}
                    </div>
                  </>
                ) : null}
                {showQuestions ? <div className="trace-candidates">
                  {(module.candidates ?? []).slice(0, 5).map((candidate, index) => (
                    <article
                      className="trace-candidate"
                      key={candidate.knowledgePointId}
                    >
                      <div className="trace-candidate-title">
                        <strong>{index + 1}. {candidate.knowledgePointName}</strong>
                        <Tag color={candidate.blockedByNegativeTemplate ? 'red' : 'blue'}>
                          最终分 {formatScore(candidate.score)}
                        </Tag>
                      </div>
                      <p>
                        普通问题最高分 {formatScore(candidate.ordinaryScore)}；
                        肯定模板最高分 {formatScore(candidate.templateScore)}
                      </p>
                      <p>
                        取分来源：
                        {candidate.winningSource === 'template' ? '模板' : '普通问题'}
                        {candidate.blockedByNegativeTemplate
                          ? '；命中否定模板，本知识点已阻断'
                          : '；未命中否定模板'}
                      </p>
                      <details className="trace-calculation-details">
                        <summary>逐问法与模板明细</summary>
                        {(candidate.ordinaryComparisons ?? []).map((comparison) => (
                          <p key={comparison.id}>
                            {comparison.type === 'standard' ? '标准问题' : '普通问题'} ·
                            {comparison.content}：
                            {formatScore(comparison.rawScore ?? comparison.score)}
                            {comparison.weight !== undefined &&
                            comparison.weight !== 1
                              ? ` × 权重 ${comparison.weight} = ${formatScore(comparison.score)}`
                              : ''}
                            {comparison.formula ? `；${comparison.formula}` : ''}
                            {comparison.components
                              ? `（加权 Dice ${formatScore(comparison.components.weightedDice)}，对齐权重 ${formatScore(comparison.components.matchedWeight)}，动作冲突系数 ${formatScore(comparison.components.conflictCoefficient)}）`
                              : ''}
                          </p>
                        ))}
                        {(candidate.templateTraces ?? []).map((template) => (
                          <p key={template.expandedQuestionId}>
                            模板 · {template.expandedQuestionId}：
                            {template.matched ? `命中 ${formatScore(template.score)}` : '未命中'}
                            {template.polarity === 'negative' ? ' · 否定' : ' · 肯定'}
                            {template.rawScore !== undefined &&
                            template.rawScore !== template.score
                              ? ` · 基础分 ${formatScore(template.rawScore)}`
                              : ''}
                            {template.components
                              ? ` · 必选覆盖 ${formatScore(template.components.requiredCoverage)}` +
                                ` / 输入纯度 ${formatScore(template.components.queryPrecision ?? template.components.semanticPrecision)}` +
                                ` / 匹配质量 ${formatScore(template.components.matchQuality ?? template.components.optionalCoverage)}`
                              : ''}
                            {template.suppressed ? ' · 候补已抑制' : ''}
                            {template.missingTerms?.length
                              ? ` · 缺少 ${template.missingTerms.map((terms) => terms.join('|')).join('、')}`
                              : ''}
                            {template.error ? ` · ${template.error}` : ''}
                          </p>
                        ))}
                      </details>
                    </article>
                  ))}
                </div> : null}
              </>
            )
          };
        })}
      />
    </section>
  );
}
