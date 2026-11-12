import type {
  ExpandedQuestion,
  KnowledgeItem
} from './types';

function legacyOrdinaryQuestions(item: KnowledgeItem): ExpandedQuestion[] {
  return item.expandedQuestions.map((content, index) => ({
    id: `${item.id}-ordinary-${index + 1}`,
    knowledgePointId: item.id,
    kind: 'ordinary',
    content,
    enabled: true,
    priority: 100,
    weight: 1,
    status: item.status === 'published' ? 'published' : 'draft',
    source: 'manual',
    revision: 1,
    testExamples: []
  }));
}

export function getOrdinaryExpandedQuestions(
  item: KnowledgeItem
): ExpandedQuestion[] {
  const definitions = item.expandedQuestionDefinitions ?? [];
  const ordinary = definitions.filter(
    (definition) => definition.kind === 'ordinary'
  );
  return ordinary.length ? ordinary : legacyOrdinaryQuestions(item);
}

export function syncOrdinaryExpandedQuestionDefinitions(
  item: KnowledgeItem,
  values: ExpandedQuestion[]
): {
  expandedQuestions: string[];
  expandedQuestionDefinitions: ExpandedQuestion[];
} {
  const templates = (item.expandedQuestionDefinitions ?? []).filter(
    (definition) => definition.kind === 'template'
  );
  const seenContents = new Set<string>();
  const ordinary = values.flatMap((value) => {
    const content = value.content.trim();
    if (!content || seenContents.has(content)) return [];
    seenContents.add(content);
    return [{
      ...value,
      knowledgePointId: item.id,
      kind: 'ordinary' as const,
      content,
      enabled: value.enabled !== false,
      priority: Number.isFinite(value.priority) ? value.priority : 100,
      weight: Number.isFinite(value.weight) ? value.weight : 1,
      source: value.source ?? 'manual',
      revision: Math.max(1, value.revision ?? 1),
      testExamples: [
        ...new Set((value.testExamples ?? []).map((sample) => sample.trim()).filter(Boolean))
      ]
    }];
  });

  return {
    expandedQuestions: ordinary.map((question) => question.content),
    expandedQuestionDefinitions: [...ordinary, ...templates]
  };
}

export function syncOrdinaryExpandedQuestions(
  item: KnowledgeItem,
  values: string[]
): {
  expandedQuestions: string[];
  expandedQuestionDefinitions: ExpandedQuestion[];
} {
  const contents = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean))
  ];
  const definitions = item.expandedQuestionDefinitions ?? [];
  const templates = definitions.filter(
    (definition) => definition.kind === 'template'
  );
  const existingByContent = new Map(
    definitions
      .filter((definition) => definition.kind === 'ordinary')
      .map((definition) => [definition.content, definition])
  );
  const usedIds = new Set(templates.map((template) => template.id));
  const ordinary = contents.map((content, index): ExpandedQuestion => {
    const existing = existingByContent.get(content);
    if (existing && !usedIds.has(existing.id)) {
      usedIds.add(existing.id);
      return existing;
    }
    let id = `${item.id}-ordinary-${index + 1}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${item.id}-ordinary-${index + 1}-${suffix++}`;
    }
    usedIds.add(id);
    return {
      id,
      knowledgePointId: item.id,
      kind: 'ordinary',
      content,
      enabled: true,
      priority: 100,
      weight: 1,
      status: 'draft'
    };
  });

  return syncOrdinaryExpandedQuestionDefinitions(item, ordinary);
}
