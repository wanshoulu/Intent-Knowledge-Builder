import { seedState } from '../data/seed';
import realKnowledgeState from '../data/realKnowledgeState.json';
import type {
  BusinessConcept,
  ExpandedQuestion,
  KnowledgeItem,
  LexiconClass,
  SemanticExpression,
  WorkbenchState
} from '../domain/types';

export const WORKBENCH_STORAGE_KEY = 'xiaoi-workbench-state-v2';
const PREVIOUS_STORAGE_KEY = 'xiaoi-workbench-state-v1';

export const LEGACY_STORAGE_KEYS = {
  knowledgeItems: 'aiharbor_xiaoi_knowledge_items_v1',
  lexicons: 'aiharbor_xiaoi_lexicon_rules_v1',
  concepts: 'aiharbor_xiaoi_concept_templates_v1',
  governance: 'aiharbor_xiaoi_governance_records_v1',
  feedback: 'aiharbor_xiaoi_feedback_quality_v1'
} as const;

function cloneSeed(): WorkbenchState {
  const source = (globalThis as typeof globalThis & { __XIAOI_TEST__?: boolean }).__XIAOI_TEST__
    ? seedState
    : realKnowledgeState as WorkbenchState;
  return structuredClone(source);
}

function migrateExpandedQuestions(item: KnowledgeItem): ExpandedQuestion[] {
  if (item.expandedQuestionDefinitions?.length) {
    return item.expandedQuestionDefinitions;
  }
  return item.expandedQuestions.map((content, index) => ({
    id: `${item.id}-ordinary-${index + 1}`,
    knowledgePointId: item.id,
    kind: 'ordinary',
    content,
    enabled: true,
    priority: 100,
    weight: 1,
    status: item.status
  }));
}

export function upgradeRuleModel(state: WorkbenchState): WorkbenchState {
  const legacyProfile = state.engineProfile ?? {
    answerThreshold: 0.58,
    defaultReply: '抱歉，当前知识库中没有找到可以确定回答的内容。'
  };
  const thresholds = {
    answerThreshold: legacyProfile.answerThreshold,
    searchThreshold:
      legacyProfile.searchThreshold ??
      legacyProfile.suggestionThreshold ??
      0.35,
    minimumAnswerThreshold:
      legacyProfile.minimumAnswerThreshold ??
      Number(Math.max(0, legacyProfile.answerThreshold - 0.08).toFixed(2)),
    maximumSimilarityDifference:
      legacyProfile.maximumSimilarityDifference ?? 0.1,
    minimumSimilarityDifference:
      legacyProfile.minimumSimilarityDifference ??
      legacyProfile.ambiguityDelta ??
      0.08
  };

  return {
    ...state,
    evaluationPolicy: {
      requireServerRun: false,
      requireFullRun: true,
      forceRegression: true,
      ...state.evaluationPolicy
    },
    knowledgeItems: state.knowledgeItems.map((item) => ({
      ...item,
      categoryPath: item.categoryPath?.length ? item.categoryPath : [item.domain, item.category].filter(Boolean),
      recommended: item.recommended ?? false,
      materialRefs: item.materialRefs ?? [],
      structuredInstructions: item.structuredInstructions ?? [],
      expandedQuestionDefinitions: migrateExpandedQuestions(item)
    })),
    engineProfile: {
      ...legacyProfile,
      ...thresholds
    },
    modules: state.modules?.length
      ? state.modules.map((module) => ({
          ...module,
          ordinarySimilarityStrategy: 'weighted-lexicon-dice-v1'
        }))
      : [{
          id: 'default-module',
          name: '默认识别模块',
          enabled: true,
          priority: 100,
          ordinarySimilarityStrategy: 'weighted-lexicon-dice-v1',
          thresholds
        }]
  };
}

function mergeSeeded<T extends { id: string }>(seed: T[], previous?: T[]): T[] {
  if (!previous) return seed;
  const seedIds = new Set(seed.map((item) => item.id));
  return [
    ...seed.map((item) => ({
      ...item,
      ...previous.find((candidate) => candidate.id === item.id)
    })),
    ...previous.filter((item) => !seedIds.has(item.id))
  ];
}

function mergeSeededLexicons(
  seed: LexiconClass[],
  previous?: LexiconClass[]
): LexiconClass[] {
  if (!previous) return seed;
  const seedIds = new Set(seed.map((item) => item.id));
  return [
    ...seed.map((item) => {
      const stored = previous.find((candidate) => candidate.id === item.id);
      if (!stored) return item;
      return {
        ...item,
        ...stored,
        aliases: [...new Set([...item.aliases, ...stored.aliases])]
      };
    }),
    ...previous.filter((item) => !seedIds.has(item.id))
  ];
}

function repairKnownLegacyExpressions(
  expressions: SemanticExpression[],
  seedExpressions: SemanticExpression[]
): SemanticExpression[] {
  const canonical = seedExpressions.find(
    (item) => item.id === 'exp-credit-repayment-date'
  );
  if (!canonical) return expressions;

  return expressions.map((expression) => {
    const compactDsl = expression.dsl.replace(/\s+/g, '');
    if (
      expression.id !== canonical.id ||
      compactDsl !== '[信用卡]&[还款时间]&(查|看|查询)?'
    ) {
      return expression;
    }
    return {
      ...expression,
      dsl: canonical.dsl,
      visualSummary: canonical.visualSummary,
      lexiconIds: canonical.lexiconIds,
      businessConfig: undefined
    };
  });
}

function hydrateState(previous: Partial<WorkbenchState>): WorkbenchState {
  const seed = cloneSeed();
  return upgradeRuleModel({
    ...seed,
    ...previous,
    context: { ...seed.context, ...previous.context },
    knowledgeItems: mergeSeeded(seed.knowledgeItems, previous.knowledgeItems),
    lexicons: mergeSeededLexicons(seed.lexicons, previous.lexicons),
    expressions: repairKnownLegacyExpressions(
      mergeSeeded(seed.expressions, previous.expressions),
      seed.expressions
    ),
    concepts: mergeSeeded(seed.concepts, previous.concepts),
    actions: mergeSeeded(seed.actions, previous.actions),
    changeSets: mergeSeeded(seed.changeSets, previous.changeSets),
    tickets: mergeSeeded(seed.tickets, previous.tickets),
    categories: previous.categories ?? seed.categories,
    preprocessRules: previous.preprocessRules ?? seed.preprocessRules,
    engineProfile: {
      ...seed.engineProfile!,
      ...previous.engineProfile
    },
    migrationNotes: [
      ...(previous.migrationNotes ?? []),
      '已升级至规则引擎数据模型 v2'
    ]
  });
}

function readJsonArray(key: string): unknown[] {
  const value = localStorage.getItem(key);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function migrateKnowledgeItem(value: unknown): KnowledgeItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null;

  return {
    id: item.id,
    name: item.name,
    category: String(item.category ?? '未分类'),
    domain: String(item.domain ?? item.businessDomain ?? '通用'),
    scene: String(item.scene ?? '通用咨询'),
    owner: String(item.owner ?? '待指派'),
    status: item.status === 'published' ? 'published' : 'draft',
    draftVersion: Number(item.version ?? 1),
    standardQuestion: String(item.standardQuestion ?? item.question ?? item.name),
    standardAnswer: String(item.standardAnswer ?? item.answer ?? ''),
    expandedQuestions: Array.isArray(item.expandedQuestions)
      ? item.expandedQuestions.map(String)
      : [],
    channels: Array.isArray(item.channels) ? item.channels.map(String) : ['Web'],
    lexiconIds: [],
    expressionIds: [],
    conceptTemplateIds: [],
    actionIds: [],
    qualityScore: 80,
    issues: [],
    updatedAt: String(item.updatedAt ?? '迁移数据')
  };
}

function migrateLexicon(value: unknown): LexiconClass | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null;

  return {
    id: item.id,
    name: item.name,
    description: String(item.description ?? '从旧工作台迁移'),
    standardTerm: String(item.standardTerm ?? item.name),
    aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
    dynamic: Boolean(item.dynamic ?? item.isDynamic),
    posType: item.posType === 'verb' ? 'verb' : 'noun',
    weight: Number(item.weight ?? 1),
    status: item.status === 'published' ? 'published' : 'draft'
  };
}

function migrateConcept(value: unknown): BusinessConcept | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null;

  return {
    id: item.id,
    name: item.name,
    description: String(item.description ?? '从旧工作台迁移'),
    attributes: [],
    instanceCount: Number(item.instanceCount ?? 0),
    status: item.status === 'published' ? 'published' : 'draft'
  };
}

function migrateLegacyState(): WorkbenchState {
  const state = cloneSeed();
  const notes: string[] = [];

  const knowledgeItems = readJsonArray(LEGACY_STORAGE_KEYS.knowledgeItems)
    .map(migrateKnowledgeItem)
    .filter((item): item is KnowledgeItem => item !== null);
  if (knowledgeItems.length > 0) {
    const migratedIds = new Set(knowledgeItems.map((item) => item.id));
    state.knowledgeItems = [
      ...knowledgeItems,
      ...state.knowledgeItems.filter((item) => !migratedIds.has(item.id))
    ];
    notes.push(`迁移知识点 ${knowledgeItems.length} 条`);
  }

  const lexicons = readJsonArray(LEGACY_STORAGE_KEYS.lexicons)
    .map(migrateLexicon)
    .filter((item): item is LexiconClass => item !== null);
  if (lexicons.length > 0) {
    const migratedIds = new Set(lexicons.map((item) => item.id));
    state.lexicons = [
      ...lexicons,
      ...state.lexicons.filter((item) => !migratedIds.has(item.id))
    ];
    notes.push(`迁移词类 ${lexicons.length} 条`);
  }

  const concepts = readJsonArray(LEGACY_STORAGE_KEYS.concepts)
    .map(migrateConcept)
    .filter((item): item is BusinessConcept => item !== null);
  if (concepts.length > 0) {
    const migratedIds = new Set(concepts.map((item) => item.id));
    state.concepts = [
      ...concepts,
      ...state.concepts.filter((item) => !migratedIds.has(item.id))
    ];
    notes.push(`迁移概念 ${concepts.length} 条`);
  }

  state.migrationNotes = notes;
  return upgradeRuleModel(state);
}

export function saveState(state: WorkbenchState): void {
  localStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(state));
}

export function loadState(): WorkbenchState {
  const current = localStorage.getItem(WORKBENCH_STORAGE_KEY);
  if (current) {
    try {
      return hydrateState(JSON.parse(current) as Partial<WorkbenchState>);
    } catch {
      localStorage.removeItem(WORKBENCH_STORAGE_KEY);
    }
  }

  const previous = localStorage.getItem(PREVIOUS_STORAGE_KEY);
  if (previous) {
    try {
      const migrated = hydrateState(JSON.parse(previous) as Partial<WorkbenchState>);
      saveState(migrated);
      return migrated;
    } catch {
      localStorage.removeItem(PREVIOUS_STORAGE_KEY);
    }
  }

  const migrated = migrateLegacyState();
  saveState(migrated);
  return migrated;
}

export function resetState(): WorkbenchState {
  const state = upgradeRuleModel(cloneSeed());
  saveState(state);
  return state;
}
