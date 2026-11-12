export interface XiaoiThresholds {
  answerThreshold: number;
  searchThreshold: number;
  minimumAnswerThreshold: number;
  maximumSimilarityDifference: number;
  minimumSimilarityDifference: number;
}

export interface XiaoiRecognitionOptions {
  query: string;
  channel?: string;
  scope?: 'workspace' | 'published';
  category?: string;
  dimensions?: Record<string, string>;
  context?: Record<string, unknown>;
  now?: string;
  includeInactive?: boolean;
}

export interface XiaoiRecognitionResult {
  query: string;
  normalizedText: string;
  tokens: Array<Record<string, unknown>>;
  pipelineTrace: {
    originalText: string;
    normalization: {
      input: string;
      systemSteps: Array<Record<string, unknown>>;
      ruleSteps: Array<Record<string, unknown>>;
      output: string;
    };
    segmentation: {
      input: string;
      strategy: string;
      candidates: Array<Record<string, unknown>>;
    };
    canonicalText: string;
  };
  decision: 'matched' | 'clarification' | 'suggested' | 'ambiguous' | 'rejected';
  knowledgePointId: string | null;
  knowledgePoint?: Record<string, unknown>;
  answer: string | null;
  actionIds: string[];
  actionInvocations: XiaoiActionInvocation[];
  extractedSlots: Record<string, string>;
  missingSlots: Array<Record<string, unknown>>;
  score: number;
  suggestions: string[];
  diagnostics: Array<Record<string, unknown>>;
  trace: {
    engineVersion: string;
    modules: Array<Record<string, unknown>>;
    answerSelection?: {
      source: 'standard' | 'variant';
      selectedVariantId: string | null;
      dimensions: Record<string, string>;
      candidates: Array<{
        variantId: string;
        matched: boolean;
        specificity: number;
        selected: boolean;
        conditions: Array<{
          key: string;
          expected: string;
          actual: string | null;
          matched: boolean;
        }>;
      }>;
    };
  };
}

export interface XiaoiActionInvocation {
  actionId: string | null;
  actionCode: string | null;
  type: string | null;
  parameters: Record<string, unknown>;
  payload: Record<string, string>;
  valid: boolean;
  errors: string[];
}

export interface XiaoiRecognitionExpectation {
  expectedDecision?:
    | 'matched'
    | 'clarification'
    | 'suggested'
    | 'ambiguous'
    | 'rejected';
  expectedKnowledgePointId?: string;
  expectedAnswerContains?: string;
  expectedSlotValues?: Record<string, string>;
  expectedActionIds?: string[];
}

export interface XiaoiExpectationResult {
  passed: boolean;
  failedStage: 'threshold' | 'answer' | 'slot' | 'action' | null;
  failureReasons: string[];
}

export const DEFAULT_THRESHOLDS: Readonly<XiaoiThresholds>;

export function normalizeText(
  value: unknown,
  rules?: Array<Record<string, unknown>>,
  diagnostics?: Array<Record<string, unknown>>
): string;

export function tokenizeWithLexicons(
  text: string,
  lexicons?: Array<Record<string, unknown>>,
  diagnostics?: Array<Record<string, unknown>>
): Array<Record<string, unknown>>;

export function evaluateTemplate(
  expandedQuestion: Record<string, any>,
  tokens: Array<Record<string, unknown>>,
  lexicons?: Array<Record<string, unknown>>
): {
  matched: boolean;
  score: number;
  rawScore: number;
  boostFactor: number;
  formula: string | null;
  components: {
    requiredCoverage: number;
    queryPrecision: number;
    matchQuality: number;
    semanticPrecision: number;
    optionalCoverage: number;
    structuralSpecificity: number;
  };
  matchedTokens: Array<Record<string, unknown>>;
  missingTerms: string[][];
  exactCoverage: boolean;
  error: string | null;
};

export function decideCandidates(
  candidates: Array<{
    knowledgePointId: string;
    score: number;
    blockedByNegativeTemplate?: boolean;
  }>,
  thresholds?: Partial<XiaoiThresholds>
): Record<string, unknown>;

export function recognizeKnowledge(
  snapshot: Record<string, any>,
  options: XiaoiRecognitionOptions
): XiaoiRecognitionResult;

export function buildActionInvocation(
  action: Record<string, any> | undefined,
  sources?: Record<string, Record<string, unknown>>,
  channel?: string
): XiaoiActionInvocation;

export function evaluateRecognitionExpectation(
  expected: XiaoiRecognitionExpectation,
  actual: Partial<XiaoiRecognitionResult>
): XiaoiExpectationResult;
