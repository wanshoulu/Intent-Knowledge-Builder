import type { LexiconClass } from '../domain/types';

export type AiAssistTask =
  | 'generate_dsl'
  | 'explain_dsl'
  | 'review_dsl'
  | 'repair_dsl'
  | 'generate_regex'
  | 'review_regex'
  | 'generate_test_cases';

export interface AiAssistContext {
  purpose?: 'positive' | 'negative';
  instruction?: string;
  currentValue?: string;
  description?: string;
  positiveExamples?: string[];
  negativeExamples?: string[];
  lexicons?: Pick<
    LexiconClass,
    'name' | 'lexiconType' | 'standardTerm' | 'aliases'
  >[];
}

export interface AiAssistResult {
  candidate: string;
  explanation: string;
  issues: string[];
  suggestedLexicons: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  validation: {
    valid: boolean;
    error?: string;
  };
  model: string;
  cached?: boolean;
}

export function selectRelevantLexicons(
  lexicons: LexiconClass[],
  contextText: string
): LexiconClass[] {
  const context = contextText.toLowerCase();
  const active = lexicons.filter(
    (lexicon) =>
      lexicon.status !== 'disabled' && lexicon.status !== 'archived'
  );
  const scored = active
    .map((lexicon, index) => {
      let score = 0;
      if (context.includes(`[${lexicon.name.toLowerCase()}`)) score += 20;
      if (context.includes(lexicon.name.toLowerCase())) score += 10;
      if (
        lexicon.standardTerm &&
        context.includes(lexicon.standardTerm.toLowerCase())
      ) score += 6;
      if (
        lexicon.aliases.some(
          (alias) => alias && context.includes(alias.toLowerCase())
        )
      ) score += 3;
      return { lexicon, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const relevant = scored.filter((item) => item.score > 0);
  return (relevant.length ? relevant : scored)
    .slice(0, 30)
    .map((item) => item.lexicon);
}

export async function requestXiaoiAiAssist(
  task: AiAssistTask,
  context: AiAssistContext
): Promise<AiAssistResult> {
  const response = await fetch('/api/xiaoi/ai/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, context })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.error || '模型辅助暂不可用，请稍后重试');
  }
  return payload.result as AiAssistResult;
}
