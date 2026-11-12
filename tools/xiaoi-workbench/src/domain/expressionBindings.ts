import type {
  KnowledgeItem,
  SemanticExpression,
  WorkbenchState
} from './types';

function without(values: string[] | undefined, id: string): string[] {
  return (values ?? []).filter((value) => value !== id);
}

function withId(values: string[] | undefined, id: string): string[] {
  return [...new Set([...(values ?? []), id])];
}

export function deriveKnowledgeLexiconIds(
  item: KnowledgeItem,
  state: WorkbenchState
): string[] {
  const expressionLexiconIds = state.expressions
    .filter((expression) => expression.knowledgeItemIds.includes(item.id))
    .flatMap((expression) => expression.lexiconIds);
  const slotLexiconIds = (item.slots ?? []).map((slot) => slot.lexiconId);
  return [...new Set([...expressionLexiconIds, ...slotLexiconIds])].filter(Boolean);
}

export function applyExpressionUpdate(
  state: WorkbenchState,
  expressionId: string,
  patch: Partial<SemanticExpression>
): WorkbenchState {
  const current = state.expressions.find((item) => item.id === expressionId);
  if (!current) return state;

  const expression = { ...current, ...patch };
  const targetIds = new Set(expression.knowledgeItemIds);
  const knowledgeItems = state.knowledgeItems.map((item): KnowledgeItem => {
    const isTarget = targetIds.has(item.id);
    const expressionIds = isTarget
      ? withId(item.expressionIds, expressionId)
      : without(item.expressionIds, expressionId);
    const positiveExpressionIds =
      isTarget && expression.polarity !== 'negative'
        ? withId(item.positiveExpressionIds, expressionId)
        : without(item.positiveExpressionIds, expressionId);
    const negativeExpressionIds =
      isTarget && expression.polarity === 'negative'
        ? withId(item.negativeExpressionIds, expressionId)
        : without(item.negativeExpressionIds, expressionId);
    const bindingsChanged =
      expressionIds.join('|') !== item.expressionIds.join('|') ||
      positiveExpressionIds.join('|') !== (item.positiveExpressionIds ?? []).join('|') ||
      negativeExpressionIds.join('|') !== (item.negativeExpressionIds ?? []).join('|');

    return {
      ...item,
      expressionIds,
      positiveExpressionIds,
      negativeExpressionIds,
      updatedAt: bindingsChanged ? new Date().toLocaleString('zh-CN') : item.updatedAt
    };
  });

  return {
    ...state,
    expressions: state.expressions.map((item) =>
      item.id === expressionId ? expression : item
    ),
    knowledgeItems
  };
}
