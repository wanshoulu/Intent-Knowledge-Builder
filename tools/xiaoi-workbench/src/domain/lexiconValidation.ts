import type { LexiconClass } from './types';

export interface LexiconValidationResult {
  blocking: string[];
  warnings: string[];
}

export function validateNewLexicon(
  candidate: Pick<LexiconClass, 'name' | 'standardTerm' | 'aliases'>,
  lexicons: LexiconClass[]
): LexiconValidationResult {
  const name = candidate.name.trim();
  const standardTerm = candidate.standardTerm.trim();
  const aliases = candidate.aliases.map((alias) => alias.trim()).filter(Boolean);
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!name || !standardTerm) blocking.push('名称和标准词不能为空');
  if (lexicons.some((lexicon) => lexicon.name.trim() === name)) {
    blocking.push(`业务词名称“${name}”已存在`);
  }
  if (
    lexicons.some(
      (lexicon) => lexicon.standardTerm.trim() === standardTerm
    )
  ) {
    blocking.push(`标准词“${standardTerm}”已存在`);
  }

  const conflictingAliases = aliases.filter((alias) =>
    lexicons.some(
      (lexicon) =>
        lexicon.standardTerm === alias || lexicon.aliases.includes(alias)
    )
  );
  if (conflictingAliases.length) {
    warnings.push(
      `常见说法与现有业务词重叠：${[...new Set(conflictingAliases)].join('、')}`
    );
  }
  return { blocking, warnings };
}
