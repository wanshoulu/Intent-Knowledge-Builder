import {
  recognizeKnowledge,
  type XiaoiRecognitionResult
} from '../../../../packages/xiaoi-core';
import type {
  ExpressionTrace,
  IntentSlot,
  KnowledgeItem,
  RecognitionCandidate,
  RecognitionResult,
  RecognitionToken,
  WorkbenchState
} from '../domain/types';

interface RecognitionOptions {
  channel?: string;
  scope?: 'workspace' | 'published';
  category?: string;
  dimensions?: Record<string, string>;
  context?: Record<string, unknown>;
}

interface CoreCandidate {
  knowledgePointId: string;
  knowledgePointName: string;
  score: number;
  blockedByNegativeTemplate: boolean;
  rulePriority?: number;
  ordinaryScore: number;
  templateScore: number;
  templateTraces: CoreTemplateTrace[];
  winningCandidate?: {
    expressionId: string;
    expressionType: 'standard' | 'ordinary' | 'template';
    content?: string;
    score: number;
  } | null;
}

interface CoreTemplateTrace {
  expandedQuestionId: string;
  polarity: 'positive' | 'negative';
  mode: 'base' | 'boost' | 'exact' | 'fallback';
  matched: boolean;
  score: number;
  rawScore?: number;
  boostFactor?: number;
  formula?: string | null;
  components?: {
    requiredCoverage: number;
    queryPrecision?: number;
    matchQuality?: number;
    semanticPrecision: number;
    optionalCoverage: number;
    structuralSpecificity: number;
  };
  matchedTokens: Array<{
    text: string;
    lexiconName: string;
  }>;
  missingTerms: string[][];
  suppressed?: boolean;
  error?: string | null;
}

function collectCoreCandidates(result: XiaoiRecognitionResult): CoreCandidate[] {
  return result.trace.modules.flatMap((module) =>
    ((module.candidates ?? []) as CoreCandidate[])
  );
}

function mapToken(token: Record<string, unknown>): RecognitionToken {
  return {
    text: String(token.text ?? ''),
    normalized: String(token.normalized ?? token.text ?? ''),
    lexiconId: token.lexiconId ? String(token.lexiconId) : undefined,
    lexiconName: token.lexiconName ? String(token.lexiconName) : undefined,
    dynamic: Boolean(token.dynamic),
    start: Number(token.start ?? 0),
    end: Number(token.end ?? 0),
    lexiconWeight: Number(token.weight ?? 1),
    posType:
      token.posType === 'noun' || token.posType === 'verb'
        ? token.posType
        : 'other',
    weightMarked: Boolean(token.weightMarked)
  };
}

function mapExpressionTraces(
  candidates: CoreCandidate[],
  state: WorkbenchState
): ExpressionTrace[] {
  const expressions = new Map(
    state.expressions.map((expression) => [expression.id, expression])
  );
  const seen = new Set<string>();
  return candidates.flatMap((candidate) =>
    candidate.templateTraces.flatMap((trace) => {
      const key = `${candidate.knowledgePointId}:${trace.expandedQuestionId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const expression = expressions.get(trace.expandedQuestionId);
      const mode = trace.mode === 'base' ? 'normal' : trace.mode;
      return [{
        expressionId: trace.expandedQuestionId,
        expressionName: expression?.name ?? trace.expandedQuestionId,
        polarity: trace.polarity,
        matched: trace.matched,
        scoreDelta: trace.suppressed
          ? 0
          : trace.matched
            ? trace.polarity === 'negative'
              ? -1
              : trace.score
            : 0,
        details: [
          `模板模式：${mode}`,
          ...(trace.formula ? [`模板基础公式：${trace.formula}`] : []),
          ...(trace.components
            ? [
                `必选覆盖 ${trace.components.requiredCoverage.toFixed(2)}，` +
                `语义精度 ${trace.components.semanticPrecision.toFixed(2)}，` +
                `可选词覆盖 ${trace.components.optionalCoverage.toFixed(2)}`
              ]
            : []),
          ...(trace.mode === 'boost'
            ? [
                `原始增强标记 ×${trace.boostFactor ?? 10}；` +
                `归一化实现采用有限增益，基础分 ${(trace.rawScore ?? trace.score).toFixed(2)}，` +
                `最终模板分 ${trace.score.toFixed(2)}`
              ]
            : []),
          ...trace.matchedTokens.map(
            (token) => `${token.text} → ${token.lexiconName}`
          ),
          ...trace.missingTerms.map((terms) => `缺少“${terms.join('|')}”`),
          ...(trace.error ? [trace.error] : [])
        ],
        matchMode: mode,
        suppressed: Boolean(trace.suppressed),
        priority: expression?.priority
      } satisfies ExpressionTrace];
    })
  );
}

function mapCandidates(
  candidates: CoreCandidate[],
  state: WorkbenchState
): RecognitionCandidate[] {
  const items = new Map(state.knowledgeItems.map((item) => [item.id, item]));
  return candidates.map((candidate) => {
    const item = items.get(candidate.knowledgePointId);
    return {
      targetId: candidate.knowledgePointId,
      targetName: candidate.knowledgePointName,
      targetType: item?.targetType ?? 'faq',
      intentCode: item?.intentCode,
      score: candidate.score,
      excluded: candidate.blockedByNegativeTemplate,
      reasons: [
        `表达竞争最高分 ${candidate.score.toFixed(2)}`,
        `胜出表达 ${candidate.winningCandidate?.content ?? candidate.winningCandidate?.expressionId ?? '-'}`,
        ...(candidate.blockedByNegativeTemplate
          ? ['命中所属知识点的否定模板']
          : [])
      ],
      rulePriority: candidate.rulePriority
    };
  });
}

function describeDecision(
  result: XiaoiRecognitionResult,
  missingSlotCount: number
) {
  if (missingSlotCount) return '知识点已命中，等待补充必填参数';
  if (result.decision === 'matched') return `知识点匹配成功，最终相似度 ${result.score.toFixed(2)}`;
  if (result.decision === 'suggested') return '未达到答案条件，返回相关问或建议问';
  if (result.decision === 'ambiguous') return '多个知识点相似度接近，不直接返回唯一答案';
  return '所有模块均未达到有效输出条件';
}

export function recognize(
  query: string,
  state: WorkbenchState,
  options: RecognitionOptions = {}
): RecognitionResult {
  const coreResult = recognizeKnowledge(
    {
      ...state,
      engineVersion: 'xiaoi-core-v1'
    },
    {
      query,
      channel: options.channel,
      category: options.category,
      dimensions: options.dimensions,
      context: options.context,
      scope: options.scope ?? 'workspace'
    }
  );
  const tokens = coreResult.tokens.map(mapToken);
  const coreCandidates = collectCoreCandidates(coreResult);
  const candidates = mapCandidates(coreCandidates, state);
  const target = coreResult.knowledgePointId
    ? state.knowledgeItems.find(
        (item) => item.id === coreResult.knowledgePointId
      )
    : undefined;
  const extractedSlots = coreResult.extractedSlots;
  const missingSlots = coreResult.missingSlots as unknown as IntentSlot[];
  const decision = coreResult.decision;

  return {
    query,
    normalizedText: coreResult.normalizedText,
    tokens,
    pipelineTrace: coreResult.pipelineTrace as unknown as RecognitionResult['pipelineTrace'],
    expressionTraces: mapExpressionTraces(coreCandidates, state),
    candidates,
    decision,
    target,
    extractedSlots,
    missingSlots,
    answer:
      missingSlots[0]?.clarificationQuestion ??
      coreResult.answer ??
      state.engineProfile?.defaultReply,
    actionIds: missingSlots.length ? [] : coreResult.actionIds,
    actionInvocations: coreResult.actionInvocations,
    explanation: describeDecision(coreResult, missingSlots.length),
    diagnostics: coreResult.diagnostics.map(
      (diagnostic) =>
        `${String(diagnostic.objectId ?? diagnostic.stage ?? '规则')}：${String(diagnostic.message ?? '')}`
    ),
    trace: coreResult.trace
  };
}
