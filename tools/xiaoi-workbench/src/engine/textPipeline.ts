import type {
  LexiconClass,
  PreprocessRule,
  RecognitionToken
} from '../domain/types';

export function normalizeText(
  text: string,
  rules: PreprocessRule[] = [],
  diagnostics: string[] = []
): string {
  let normalized = text.trim().toLowerCase().replace(/\s+/g, '');

  for (const rule of rules.filter((item) => item.enabled)) {
    try {
      if (rule.type === 'replace') {
        normalized = normalized.replace(new RegExp(rule.pattern, 'g'), rule.replacement ?? '');
      } else if (rule.type === 'prefix') {
        normalized = normalized.replace(new RegExp(rule.pattern), '');
      } else if (rule.type === 'suffix') {
        normalized = normalized.replace(new RegExp(`${rule.pattern}$`), '');
      } else if (rule.type === 'stopword') {
        normalized = normalized.replace(new RegExp(rule.pattern, 'g'), '');
      }
    } catch (error) {
      diagnostics.push(
        `预处理规则 ${rule.id} 编译失败：${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }
  return normalized;
}

export function tokenizeWithLexicons(
  text: string,
  lexicons: LexiconClass[],
  diagnostics: string[] = []
): RecognitionToken[] {
  const matches: RecognitionToken[] = [];

  for (const lexicon of lexicons.filter((item) => item.status !== 'disabled')) {
    if (lexicon.dynamic && lexicon.pattern) {
      let pattern: RegExp;
      try {
        pattern = new RegExp(lexicon.pattern, 'g');
      } catch (error) {
        diagnostics.push(
          `动态词 ${lexicon.id} 编译失败：${error instanceof Error ? error.message : '未知错误'}`
        );
        continue;
      }
      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        matches.push({
          text: match[0],
          normalized: lexicon.standardTerm,
          lexiconId: lexicon.id,
          lexiconName: lexicon.name,
          dynamic: true,
          start: match.index,
          end: match.index + match[0].length,
          lexiconWeight:
            lexicon.weight +
            (lexicon.weightMarked ? lexicon.weightAdjustment ?? 1 : 0),
          posType: lexicon.posType,
          weightMarked: lexicon.weightMarked
        });
      }
      continue;
    }

    const terms = [...new Set([
      lexicon.standardTerm,
      ...lexicon.aliases,
      ...(lexicon.pinyinCorrection ? lexicon.pinyinAliases ?? [] : [])
    ])]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    for (const term of terms) {
      let start = text.indexOf(term);
      while (start >= 0) {
        matches.push({
          text: term,
          normalized:
            lexicon.synonymsSimilar === false ? term : lexicon.standardTerm,
          lexiconId: lexicon.id,
          lexiconName: lexicon.name,
          dynamic: false,
          start,
          end: start + term.length,
          lexiconWeight:
            lexicon.weight +
            (lexicon.weightMarked ? lexicon.weightAdjustment ?? 1 : 0),
          posType: lexicon.posType,
          weightMarked: lexicon.weightMarked
        });
        start = text.indexOf(term, start + term.length);
      }
    }
  }

  return matches
    .sort((left, right) => left.start - right.start || right.text.length - left.text.length)
    .filter((token, index, all) =>
      !all.slice(0, index).some(
        (existing) =>
          existing.start <= token.start &&
          existing.end >= token.end &&
          existing.text.length > token.text.length
      )
    );
}
