import type {
  ExpressionBusinessConfig,
  ExpressionTestCase
} from './expressionBusiness';

export type EntityStatus =
  | 'draft'
  | 'incomplete'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'disabled'
  | 'archived';

export type TicketStatus =
  | 'open'
  | 'triaged'
  | 'assigned'
  | 'fixing'
  | 'verifying'
  | 'resolved'
  | 'closed';

export interface WorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  channel: string;
  environment: 'development' | 'staging' | 'production';
  releaseVersion: string;
}

export interface QualityIssue {
  id: string;
  level: 'info' | 'warning' | 'blocking';
  message: string;
}

export interface MaterialReference {
  id: string;
  type: 'attachment' | 'image' | 'video' | 'rich_media' | 'unknown';
  name?: string;
}

export interface KnowledgeInstruction {
  id: string;
  type: 'related_question' | 'recommended_question' | 'menu' | 'command';
  targetKnowledgeItemIds: string[];
  rawText?: string;
  enabled: boolean;
}

export type RecognitionTargetType = 'faq' | 'task' | 'clarification' | 'chat';

export interface AnswerVariant {
  id: string;
  channel: string;
  region?: string;
  segment?: string;
  content: string;
  actionIds: string[];
}

export interface IntentSlot {
  id: string;
  name: string;
  lexiconId: string;
  required: boolean;
  clarificationQuestion?: string;
}

export type ExpandedQuestionKind = 'ordinary' | 'template';
export type TemplatePolarity = 'positive' | 'negative';
export type TemplateMode = 'base' | 'boost' | 'exact' | 'fallback';

export interface ExpandedQuestion {
  id: string;
  knowledgePointId: string;
  kind: ExpandedQuestionKind;
  content: string;
  enabled: boolean;
  priority: number;
  weight: number;
  status: EntityStatus;
  source?: 'manual' | 'imported' | 'generated';
  revision?: number;
  testExamples?: string[];
  templateConfig?: {
    polarity: TemplatePolarity;
    mode: TemplateMode;
    lexiconRefs: string[];
  };
}

export interface KnowledgeItem {
  id: string;
  name: string;
  category: string;
  domain: string;
  scene: string;
  owner: string;
  status: EntityStatus;
  draftVersion: number;
  publishedVersion?: number;
  standardQuestion: string;
  standardAnswer: string;
  moduleId?: string;
  expandedQuestions: string[];
  expandedQuestionDefinitions?: ExpandedQuestion[];
  channels: string[];
  lexiconIds: string[];
  expressionIds: string[];
  conceptTemplateIds: string[];
  actionIds: string[];
  qualityScore: number;
  issues: QualityIssue[];
  updatedAt: string;
  targetType?: RecognitionTargetType;
  intentCode?: string;
  answerVariants?: AnswerVariant[];
  slots?: IntentSlot[];
  positiveExpressionIds?: string[];
  negativeExpressionIds?: string[];
  matchThreshold?: number;
  categoryPath?: string[];
  businessInstanceName?: string;
  knowledgeAttribute?: string;
  recommended?: boolean;
  validFrom?: string;
  validTo?: string;
  materialRefs?: MaterialReference[];
  sourceInstruction?: string;
  structuredInstructions?: KnowledgeInstruction[];
}

export interface LexiconClass {
  id: string;
  name: string;
  description: string;
  standardTerm: string;
  aliases: string[];
  dynamic: boolean;
  posType: 'noun' | 'verb' | 'other';
  weight: number;
  status: EntityStatus;
  lexiconType?: 'general' | 'collection' | 'dynamic';
  pattern?: string;
  examples?: string[];
  weightMarked?: boolean;
  weightAdjustment?: number;
  synonymsSimilar?: boolean;
  pinyinCorrection?: boolean;
  pinyinAliases?: string[];
}

export interface SemanticExpression {
  id: string;
  name: string;
  dsl: string;
  visualSummary: string;
  lexiconIds: string[];
  knowledgeItemIds: string[];
  priority: number;
  status: EntityStatus;
  polarity?: 'positive' | 'negative';
  testExamples?: string[];
  testCases?: ExpressionTestCase[];
  businessConfig?: ExpressionBusinessConfig;
  revision?: number;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  parentId?: string;
  targetType?: RecognitionTargetType;
  sortOrder: number;
}

export interface PreprocessRule {
  id: string;
  type: 'prefix' | 'suffix' | 'stopword' | 'replace';
  pattern: string;
  replacement?: string;
  enabled: boolean;
}

export interface EngineProfile {
  answerThreshold: number;
  searchThreshold?: number;
  minimumAnswerThreshold?: number;
  maximumSimilarityDifference?: number;
  minimumSimilarityDifference?: number;
  suggestionThreshold?: number;
  ambiguityDelta?: number;
  defaultReply: string;
}

export interface RecognitionModule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  ordinarySimilarityStrategy?:
    | 'weighted-lexicon-dice-v1'
    | 'dice-bigram-v1'
    | 'lexicon-hybrid-v1';
  knowledgePointIds?: string[];
  dimensionConditions?: Record<string, string | string[]>;
  categoryConditions?: string[];
  contextConditions?: Record<string, string | string[]>;
  ignoreCategoryMatch?: boolean;
  thresholds: {
    answerThreshold: number;
    searchThreshold: number;
    minimumAnswerThreshold: number;
    maximumSimilarityDifference: number;
    minimumSimilarityDifference: number;
  };
}

export interface RecognitionToken {
  text: string;
  normalized: string;
  lexiconId?: string;
  lexiconName?: string;
  dynamic: boolean;
  start: number;
  end: number;
  lexiconWeight?: number;
  posType?: LexiconClass['posType'];
  weightMarked?: boolean;
}

export interface ExpressionTrace {
  expressionId: string;
  expressionName: string;
  polarity: 'positive' | 'negative';
  matched: boolean;
  scoreDelta: number;
  details: string[];
  matchMode?: 'normal' | 'boost' | 'exact' | 'fallback';
  suppressed?: boolean;
  priority?: number;
}

export interface RecognitionCandidate {
  targetId: string;
  targetName: string;
  targetType: RecognitionTargetType;
  intentCode?: string;
  score: number;
  excluded: boolean;
  reasons: string[];
  rulePriority?: number;
}

export interface RecognitionResult {
  query: string;
  normalizedText: string;
  tokens: RecognitionToken[];
  pipelineTrace: {
    originalText: string;
    normalization: {
      input: string;
      systemSteps: Array<{
        operation: string;
        before: string;
        after: string;
        changed: boolean;
      }>;
      ruleSteps: Array<{
        ruleId: string;
        ruleName: string;
        type: string;
        pattern?: string;
        before: string;
        after: string;
        matched: boolean;
        error?: string;
      }>;
      output: string;
    };
    segmentation: {
      input: string;
      strategy: string;
      candidates: Array<RecognitionToken & {
        selected: boolean;
        reason: string;
      }>;
    };
    canonicalText: string;
  };
  expressionTraces: ExpressionTrace[];
  candidates: RecognitionCandidate[];
  decision: 'matched' | 'clarification' | 'suggested' | 'ambiguous' | 'rejected';
  target?: KnowledgeItem;
  extractedSlots: Record<string, string>;
  missingSlots: IntentSlot[];
  answer?: string;
  actionIds: string[];
  actionInvocations: ActionInvocation[];
  explanation: string;
  diagnostics?: string[];
  trace?: {
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

export interface ConceptAttribute {
  id: string;
  name: string;
  dataType: 'text' | 'number' | 'date' | 'boolean';
  required: boolean;
}

export interface BusinessConcept {
  id: string;
  name: string;
  parentId?: string;
  description: string;
  attributes: ConceptAttribute[];
  instanceCount: number;
  status: EntityStatus;
  semanticBlock?: string;
  auxiliarySemanticBlock?: string;
  extendedSemanticBlock?: string;
  knowledgeAttribute?: string;
}

export interface KnowledgeTemplate {
  id: string;
  conceptId: string;
  name: string;
  questionTemplate: string;
  answerTemplate: string;
  status: EntityStatus;
}

export interface InteractionAction {
  id: string;
  name: string;
  type: 'command' | 'navigation' | 'attachment' | 'rich_media' | 'suggestion';
  actionCode: string;
  payload: Record<string, string>;
  inputMappings?: ActionInputMapping[];
  channels: string[];
  status: EntityStatus;
}

export interface ActionInputMapping {
  parameter: string;
  source: 'slot' | 'dimension' | 'context' | 'literal';
  sourceKey?: string;
  literalValue?: string;
  required: boolean;
}

export interface ActionInvocation {
  actionId: string | null;
  actionCode: string | null;
  type: string | null;
  parameters: Record<string, unknown>;
  payload: Record<string, string>;
  valid: boolean;
  errors: string[];
}

export interface ReleaseGateInput {
  requiredFieldsComplete: boolean;
  referencesValid: boolean;
  blockingConflicts: number;
  regressionPassed: boolean;
  reviewApproved: boolean;
}

export interface ChangeSet {
  id: string;
  title: string;
  businessReason: string;
  objectRefs: string[];
  riskLevel: 'low' | 'medium' | 'high';
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'rejected';
  owner: string;
  gates: ReleaseGateInput;
  updatedAt: string;
}

export interface EvaluationRun {
  id: string;
  name: string;
  targetVersion: string;
  passed: number;
  failed: number;
  status: 'queued' | 'running' | 'passed' | 'failed';
  completedAt?: string;
  sampleResults?: EvaluationSampleResult[];
}

export interface EvaluationSampleResult {
  expressionId: string;
  expressionName: string;
  testCaseId: string;
  query: string;
  expectation: 'match' | 'not_match' | 'exclude' | 'target';
  expected: string;
  actual: string;
  passed: boolean;
}

export type EvaluationDecision =
  | 'matched'
  | 'clarification'
  | 'suggested'
  | 'ambiguous'
  | 'rejected';

export interface PersistedEvaluationSample {
  id: string;
  query: string;
  enabled: boolean;
  expectedDecision: EvaluationDecision;
  expectedKnowledgePointId?: string;
  expectedAnswerContains?: string;
  expectedSlotValues?: Record<string, string>;
  expectedActionIds?: string[];
  channel?: string;
  category?: string;
  dimensions?: Record<string, string>;
  context?: Record<string, string>;
  source: 'manual' | 'imported' | 'feedback' | 'rule-example';
  relatedObjectIds: string[];
  tags?: string[];
}

export interface EvaluationDataset {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  tags: string[];
  status: 'draft' | 'active' | 'archived';
  version: number;
  samples: PersistedEvaluationSample[];
  createdAt: string;
  updatedAt: string;
}

export interface PersistedEvaluationRun {
  id: string;
  datasetId: string;
  datasetVersion: number;
  workspaceId: string;
  projectId: string;
  mode: 'incremental' | 'full';
  targetType: 'workspace' | 'release';
  targetRevision?: number;
  releaseId?: string;
  releaseVersion?: number;
  status: 'queued' | 'running' | 'passed' | 'failed';
  total: number;
  passed: number;
  failed: number;
  startedAt: string;
  completedAt?: string;
}

export interface PersistedEvaluationResult {
  runId: string;
  sampleId: string;
  query: string;
  passed: boolean;
  failedStage?:
    | 'normalization'
    | 'segmentation'
    | 'lexicon'
    | 'expression'
    | 'module'
    | 'threshold'
    | 'answer'
    | 'slot'
    | 'action';
  failureReasons: string[];
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  trace: Record<string, unknown>;
  durationMs: number;
}

export interface FeedbackTicket {
  id: string;
  query: string;
  findingType: 'miss' | 'wrong_hit' | 'answer_error' | 'rule_conflict';
  relatedObjectIds: string[];
  assignee: string;
  status: TicketStatus;
  source: string;
  createdAt: string;
  resolutionChangeSetId?: string;
}

export interface WorkbenchState {
  context: WorkspaceContext;
  evaluationPolicy?: {
    requireServerRun: boolean;
    requireFullRun: boolean;
    forceRegression: boolean;
  };
  knowledgeItems: KnowledgeItem[];
  lexicons: LexiconClass[];
  expressions: SemanticExpression[];
  concepts: BusinessConcept[];
  templates: KnowledgeTemplate[];
  actions: InteractionAction[];
  changeSets: ChangeSet[];
  evaluationRuns: EvaluationRun[];
  tickets: FeedbackTicket[];
  migrationNotes: string[];
  categories?: KnowledgeCategory[];
  preprocessRules?: PreprocessRule[];
  engineProfile?: EngineProfile;
  modules?: RecognitionModule[];
}
