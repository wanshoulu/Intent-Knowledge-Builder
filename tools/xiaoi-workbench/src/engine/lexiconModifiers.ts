import type { LexiconClass } from '../domain/types';

export interface ParsedLexiconModifiers {
  weightMarked: boolean;
  weightAdjustment?: number;
  synonymsSimilar: boolean;
  pinyinCorrection: boolean;
  posType: LexiconClass['posType'];
}

export function formatLexiconModifiers(
  lexicon: Pick<
    LexiconClass,
    | 'weightMarked'
    | 'weightAdjustment'
    | 'synonymsSimilar'
    | 'pinyinCorrection'
    | 'posType'
  >
): string {
  const weight = lexicon.weightMarked
    ? `*${lexicon.weightAdjustment ?? ''}`
    : '';
  const similarity = lexicon.synonymsSimilar === false ? '#' : '';
  const pos =
    lexicon.posType === 'noun' ? '%n' : lexicon.posType === 'verb' ? '%v' : '';
  const pinyin = lexicon.pinyinCorrection ? '@' : '';
  return `${weight}${similarity}${pos}${pinyin}`;
}

export function parseLexiconModifiers(source: string): ParsedLexiconModifiers {
  const compact = source.replace(/\s+/g, '');
  const weightMatch = compact.match(/\*(-?\d+)?/);
  const known = compact.replace(/\*(-?\d+)?/, '').replace('#', '').replace('@', '')
    .replace('%n', '').replace('%v', '');
  if (known) throw new Error(`无法识别的词类修饰符：${known}`);
  if (compact.includes('%n') && compact.includes('%v')) {
    throw new Error('词类不能同时标记为名词和动词');
  }

  return {
    weightMarked: Boolean(weightMatch),
    weightAdjustment: weightMatch?.[1] === undefined
      ? undefined
      : Number(weightMatch[1]),
    synonymsSimilar: !compact.includes('#'),
    pinyinCorrection: compact.includes('@'),
    posType: compact.includes('%n')
      ? 'noun'
      : compact.includes('%v')
        ? 'verb'
        : 'other'
  };
}
