import type { RecognitionResult, RecognitionTargetType } from '../domain/types';

interface TraceCandidate {
  knowledgePointId?: string;
  score?: number;
  ordinaryScore?: number;
  winningSource?: 'ordinary-question' | 'template';
  winningCandidate?: {
    expressionId: string;
    expressionType: 'standard' | 'ordinary' | 'template';
    content?: string;
  } | null;
}

interface TraceModule {
  decision?: string;
  candidates?: TraceCandidate[];
  thresholdDecision?: {
    lead?: number;
    thresholds?: {
      answerThreshold?: number;
    };
  };
}

export interface RecognitionDecisionView {
  state: 'success' | 'warning';
  decisionLabel: string;
  targetName: string;
  targetType: string;
  explanation: string;
  answer?: string;
  score?: number;
  answerThreshold?: number;
  thresholdDelta?: number;
  winningSource: '标准问题' | '普通问题' | '语义模板' | '-';
  expressionName: string;
  ordinaryScore?: number;
  lead?: number;
}

const decisionLabels: Record<RecognitionResult['decision'], string> = {
  matched: '已匹配',
  clarification: '等待补充信息',
  suggested: '返回建议问',
  ambiguous: '结果不唯一',
  rejected: '未命中可回答目标'
};

const targetTypeLabels: Record<RecognitionTargetType, string> = {
  faq: 'FAQ 问答',
  task: '任务意图',
  clarification: '澄清意图',
  chat: '基本对话'
};

function asTraceModules(result: RecognitionResult): TraceModule[] {
  return (result.trace?.modules ?? []) as TraceModule[];
}

export function buildRecognitionDecisionView(
  result: RecognitionResult
): RecognitionDecisionView {
  const topCandidate = result.candidates.find((candidate) => !candidate.excluded);
  const traceModules = asTraceModules(result);
  const traceModule = traceModules.find((module) =>
    (module.candidates ?? []).some(
      (candidate) => candidate.knowledgePointId === topCandidate?.targetId
    )
  ) ?? traceModules.find((module) => module.decision !== 'skipped');
  const traceCandidate = (traceModule?.candidates ?? []).find(
    (candidate) => candidate.knowledgePointId === topCandidate?.targetId
  );
  const answerThreshold =
    traceModule?.thresholdDecision?.thresholds?.answerThreshold;
  const score = topCandidate?.score;
  const winningCandidate = traceCandidate?.winningCandidate;
  const winningSource = winningCandidate?.expressionType === 'template'
    ? '语义模板'
    : winningCandidate?.expressionType === 'standard'
      ? '标准问题'
      : winningCandidate?.expressionType === 'ordinary'
        ? '普通问题'
        : '-';
  const matchedExpression = result.expressionTraces.find(
    (trace) => trace.expressionId === winningCandidate?.expressionId
  );

  return {
    state: result.decision === 'matched' ? 'success' : 'warning',
    decisionLabel: decisionLabels[result.decision],
    targetName: result.target?.name ?? '未命中可回答目标',
    targetType: result.target
      ? targetTypeLabels[result.target.targetType ?? 'faq']
      : '拒识',
    explanation: result.explanation,
    answer: result.target ? result.answer : undefined,
    score,
    answerThreshold,
    thresholdDelta:
      score !== undefined && answerThreshold !== undefined
        ? score - answerThreshold
        : undefined,
    winningSource,
    expressionName:
      winningSource === '语义模板' && matchedExpression
        ? matchedExpression.expressionName
        : winningSource === '标准问题' || winningSource === '普通问题'
          ? winningCandidate?.content ?? winningCandidate?.expressionId ?? '-'
          : '-',
    ordinaryScore: traceCandidate?.ordinaryScore,
    lead: traceModule?.thresholdDecision?.lead
  };
}

function formatScore(value: number | undefined): string {
  return typeof value === 'number' ? value.toFixed(2) : '-';
}

export function RecognitionDecisionSummary({
  result
}: {
  result: RecognitionResult;
}) {
  const view = buildRecognitionDecisionView(result);
  const progress = Math.max(0, Math.min(100, (view.score ?? 0) * 100));

  return (
    <section
      className={`recognition-decision-summary recognition-decision-${view.state}`}
      aria-label="最终识别结论"
      role="status"
    >
      <div className="recognition-decision-layout">
        <div className="recognition-target-card">
          <span className="recognition-kicker">最终识别目标</span>
          <h3>{view.targetName}</h3>
          <strong className="recognition-decision-state">
            {view.decisionLabel} · {view.targetType}
          </strong>
          {view.answer ? (
            <div className="recognition-answer">
              <span className="recognition-kicker">最终答案</span>
              <p>{view.answer}</p>
            </div>
          ) : (
            <p className="recognition-explanation">{view.explanation}</p>
          )}
        </div>
        <div className="recognition-score-card">
          <span className="recognition-kicker">最终相似度</span>
          <strong className="recognition-score-value">
            {formatScore(view.score)}
          </strong>
          <span>
            答案阈值 {formatScore(view.answerThreshold)}
            {view.thresholdDelta !== undefined
              ? ` · 高出 ${formatScore(view.thresholdDelta)}`
              : ''}
          </span>
          <div
            className="recognition-score-track"
            role="progressbar"
            aria-label="最终相似度进度"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={view.score}
          >
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="recognition-evidence-grid">
        <div><span>命中依据</span><strong>{view.winningSource}</strong></div>
        <div><span>命中表达式</span><strong>{view.expressionName}</strong></div>
        <div>
          <span>普通问题最高分</span>
          <strong>{formatScore(view.ordinaryScore)}</strong>
        </div>
        <div>
          <span>领先第二名</span>
          <strong>
            {view.lead === undefined ? '-' : `+${formatScore(view.lead)}`}
          </strong>
        </div>
      </div>
    </section>
  );
}
