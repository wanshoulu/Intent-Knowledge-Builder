import type {
  BusinessMatchMode,
  ExpressionBusinessConfig,
  ExpressionPurpose
} from '../domain/expressionBusiness';
import type { LexiconClass } from '../domain/types';
import { parseExpression } from './dslParser';

export interface CompiledBusinessExpression {
  dsl: string;
  lexiconIds: string[];
  polarity: ExpressionPurpose;
  explanation: string;
  diagnostics: string[];
}

export type BusinessRoundTripResult =
  | {
      convertible: true;
      config: ExpressionBusinessConfig;
    }
  | {
      convertible: false;
      reason: string;
    };

const modePrefix: Record<BusinessMatchMode, string> = {
  normal: '',
  boost: '&',
  exact: '&&',
  fallback: '&+'
};

const modeLabel: Record<BusinessMatchMode, string> = {
  normal: '普通规则',
  boost: '高置信规则',
  exact: '最高置信规则',
  fallback: '候补规则'
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function runnableLexicons(lexicons: LexiconClass[]): LexiconClass[] {
  return lexicons.filter(
    (lexicon) => lexicon.status !== 'disabled' && lexicon.status !== 'archived'
  );
}

function resolveById(ids: string[], lexicons: LexiconClass[]): LexiconClass[] {
  const active = runnableLexicons(lexicons);
  return ids.map((id) => {
    const lexicon = active.find((candidate) => candidate.id === id);
    if (!lexicon) {
      throw new Error(`业务词“${id}”不存在或不可用`);
    }
    return lexicon;
  });
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).map((name) => `“${name}”`).join('、')}和“${names.at(-1)}”`;
}

function explain(
  config: ExpressionBusinessConfig,
  requiredNames: string[],
  optionalNames: string[],
  alternativeNames: string[][]
): string {
  if (config.purpose === 'negative') {
    return `在“${requiredNames.join('、')}”语境中，用户说到“${optionalNames.join('、')}”时排除当前知识目标。`;
  }

  const parts: string[] = [];
  if (requiredNames.length) {
    parts.push(`用户必须说到${joinNames(requiredNames)}`);
  }
  for (const names of alternativeNames) {
    parts.push(`至少说到“${names.join('”或“')}”中的一个`);
  }
  if (optionalNames.length) {
    parts.push(`可以说到“${optionalNames.join('”、“')}”`);
  }
  parts.push(config.ordered ? '业务词需要按配置顺序出现' : '业务词顺序不限');
  parts.push(`采用${modeLabel[config.matchMode]}`);
  return `${parts.join('；')}。`;
}

export function compileBusinessExpression(
  config: ExpressionBusinessConfig,
  lexicons: LexiconClass[]
): CompiledBusinessExpression {
  if (config.purpose === 'negative') {
    const contextIds = unique(config.contextLexiconIds ?? []);
    const exclusionIds = unique(config.exclusionLexiconIds ?? []);
    if (!contextIds.length) throw new Error('排除规则必须设置业务语境');
    if (!exclusionIds.length) throw new Error('排除规则必须设置排除信号');

    const context = resolveById(contextIds, lexicons);
    const exclusion = resolveById(exclusionIds, lexicons);
    const terms = [...context, ...exclusion].map((lexicon) => `[${lexicon.name}]`);
    const body = terms.join('');
    return {
      dsl: `${modePrefix[config.matchMode]}${config.ordered ? `(${body})` : body}`,
      lexiconIds: unique([...contextIds, ...exclusionIds]),
      polarity: 'negative',
      explanation: explain(
        config,
        context.map((lexicon) => lexicon.name),
        exclusion.map((lexicon) => lexicon.name),
        []
      ),
      diagnostics: []
    };
  }

  const requiredIds = unique(config.requiredLexiconIds);
  const optionalIds = unique(config.optionalLexiconIds).filter(
    (id) => !requiredIds.includes(id)
  );
  const alternativeGroups = config.alternativeGroups
    .map((group) => ({ ...group, lexiconIds: unique(group.lexiconIds) }))
    .filter((group) => group.lexiconIds.length > 0);
  if (!requiredIds.length && !alternativeGroups.length) {
    throw new Error('识别规则至少需要一个“必须说到”或“至少说到一个”条件');
  }

  const required = resolveById(requiredIds, lexicons);
  const optional = resolveById(optionalIds, lexicons);
  const alternatives = alternativeGroups.map((group) =>
    resolveById(group.lexiconIds, lexicons)
  );
  const terms = [
    ...required.map((lexicon) => `[${lexicon.name}]`),
    ...alternatives.map(
      (group) => `[${group.map((lexicon) => lexicon.name).join('|')}]`
    ),
    ...optional.map((lexicon) => `[${lexicon.name}?]`)
  ];
  const body = terms.join('');
  return {
    dsl: `${modePrefix[config.matchMode]}${config.ordered ? `(${body})` : body}`,
    lexiconIds: unique([
      ...requiredIds,
      ...alternativeGroups.flatMap((group) => group.lexiconIds),
      ...optionalIds
    ]),
    polarity: 'positive',
    explanation: explain(
      config,
      required.map((lexicon) => lexicon.name),
      optional.map((lexicon) => lexicon.name),
      alternatives.map((group) => group.map((lexicon) => lexicon.name))
    ),
    diagnostics: []
  };
}

function resolveUniqueName(
  name: string,
  lexicons: LexiconClass[]
): string | null {
  const matches = runnableLexicons(lexicons).filter(
    (lexicon) => lexicon.name === name
  );
  return matches.length === 1 ? matches[0].id : null;
}

export function roundTripBusinessExpression(
  dsl: string,
  lexicons: LexiconClass[],
  purpose: ExpressionPurpose
): BusinessRoundTripResult {
  if (purpose === 'negative') {
    return {
      convertible: false,
      reason: '历史排除规则无法安全区分业务语境和排除信号'
    };
  }

  let parsed;
  try {
    parsed = parseExpression(dsl);
  } catch (error) {
    return {
      convertible: false,
      reason: error instanceof Error ? error.message : '技术表达式无法解析'
    };
  }

  const orderedTerms = parsed.terms.filter((term) => term.orderGroup !== undefined);
  if (
    orderedTerms.length > 0 &&
    (orderedTerms.length !== parsed.terms.length ||
      new Set(orderedTerms.map((term) => term.orderGroup)).size !== 1)
  ) {
    return {
      convertible: false,
      reason: '包含局部有序或多个有序分组，只能在专家模式维护'
    };
  }

  const requiredLexiconIds: string[] = [];
  const optionalLexiconIds: string[] = [];
  const alternativeGroups: ExpressionBusinessConfig['alternativeGroups'] = [];

  for (const [index, term] of parsed.terms.entries()) {
    const ids = term.alternatives.map((name) => resolveUniqueName(name, lexicons));
    if (ids.some((id) => id === null)) {
      return {
        convertible: false,
        reason: `业务词“${term.alternatives.join('|')}”不存在或存在重名`
      };
    }
    const validIds = ids as string[];
    if (term.optional && validIds.length > 1) {
      return {
        convertible: false,
        reason: '可选任选组超出业务模式可编辑范围'
      };
    }
    if (validIds.length > 1) {
      alternativeGroups.push({ id: `group-${index + 1}`, lexiconIds: validIds });
    } else if (term.optional) {
      optionalLexiconIds.push(validIds[0]);
    } else {
      requiredLexiconIds.push(validIds[0]);
    }
  }

  const config: ExpressionBusinessConfig = {
    schemaVersion: 2,
    editorMode: 'business',
    purpose,
    requiredLexiconIds,
    optionalLexiconIds,
    alternativeGroups,
    ordered: orderedTerms.length === parsed.terms.length,
    matchMode: parsed.mode
  };

  try {
    const compiled = compileBusinessExpression(config, lexicons);
    if (
      JSON.stringify(parseExpression(compiled.dsl)) !== JSON.stringify(parsed)
    ) {
      return {
        convertible: false,
        reason: '技术表达式无法无损转换为业务条件'
      };
    }
  } catch (error) {
    return {
      convertible: false,
      reason: error instanceof Error ? error.message : '业务条件编译失败'
    };
  }

  return { convertible: true, config };
}
