import type {
  LexiconClass,
  PreprocessRule,
  RecognitionToken
} from '../domain/types';
import { parseExpression } from './dslParser';
import type { TemplateMatchMode } from './dslParser';
import { normalizeText, tokenizeWithLexicons } from './textPipeline';
import { evaluateTemplate } from '../../../../packages/xiaoi-core';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface RegexTestResult extends ValidationResult {
  matched: boolean;
  matchText?: string;
  start?: number;
  end?: number;
  groups: string[];
}

export type LexiconMatchSource =
  | 'standard'
  | 'alias'
  | 'pinyin'
  | 'dynamic';

export interface LexiconTestResult extends RegexTestResult {
  normalizedText: string;
  canonicalTerm?: string;
  dynamic: boolean;
  matchedTerm?: string;
  matchSource?: LexiconMatchSource;
  lexiconName: string;
  posType: LexiconClass['posType'];
  baseWeight: number;
  weightAdjustment: number;
  effectiveWeight: number;
}

export interface ExpressionTermResult {
  label: string;
  alternatives: string[];
  optional: boolean;
  matched: boolean;
  token?: RecognitionToken;
}

export interface ExpressionTestResult extends ValidationResult {
  normalizedText: string;
  matched: boolean;
  ordered: boolean;
  scoreDelta: number;
  rawScore?: number;
  formula?: string | null;
  components?: {
    requiredCoverage: number;
    semanticPrecision: number;
    optionalCoverage: number;
    structuralSpecificity: number;
  };
  terms: ExpressionTermResult[];
  matchMode?: TemplateMatchMode;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '规则校验失败';
}

export function validateRegex(pattern: string): ValidationResult {
  if (!pattern.trim()) return { valid: false, error: '正则表达式不能为空' };
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: errorMessage(error) };
  }
}

export function testRegex(pattern: string, query: string): RegexTestResult {
  const validation = validateRegex(pattern);
  if (!validation.valid) {
    return { ...validation, matched: false, groups: [] };
  }

  const match = new RegExp(pattern).exec(query);
  return {
    valid: true,
    matched: Boolean(match),
    matchText: match?.[0],
    start: match?.index,
    end: match ? match.index + match[0].length : undefined,
    groups: match ? match.slice(1).map((value) => value ?? '') : []
  };
}

export function testLexicon(
  lexicon: LexiconClass,
  query: string,
  preprocessRules: PreprocessRule[] = []
): LexiconTestResult {
  const normalizedText = normalizeText(query, preprocessRules);
  const weightAdjustment = lexicon.weightMarked
    ? lexicon.weightAdjustment ?? 1
    : 0;
  const weightDetails = {
    lexiconName: lexicon.name,
    posType: lexicon.posType,
    baseWeight: lexicon.weight,
    weightAdjustment,
    effectiveWeight: lexicon.weight + weightAdjustment
  };

  if (lexicon.dynamic) {
    const result = testRegex(lexicon.pattern ?? '', normalizedText);
    return {
      ...result,
      normalizedText,
      canonicalTerm: result.matched ? lexicon.standardTerm : undefined,
      dynamic: true,
      matchedTerm: result.matched ? lexicon.pattern : undefined,
      matchSource: result.matched ? 'dynamic' : undefined,
      ...weightDetails
    };
  }

  const token = tokenizeWithLexicons(normalizedText, [lexicon]).find(
    (candidate) => candidate.lexiconId === lexicon.id
  );
  const matchedTerm = token?.text;
  const matchSource: LexiconMatchSource | undefined = !matchedTerm
    ? undefined
    : matchedTerm === lexicon.standardTerm
      ? 'standard'
      : lexicon.aliases.includes(matchedTerm)
        ? 'alias'
        : lexicon.pinyinCorrection &&
            (lexicon.pinyinAliases ?? []).includes(matchedTerm)
          ? 'pinyin'
          : undefined;

  return {
    valid: true,
    normalizedText,
    matched: Boolean(token),
    matchText: token?.text,
    start: token?.start,
    end: token?.end,
    groups: [],
    canonicalTerm: token
      ? token.normalized ?? lexicon.standardTerm
      : undefined,
    dynamic: false,
    matchedTerm,
    matchSource,
    ...weightDetails
  };
}

export function validateDsl(dsl: string): ValidationResult {
  try {
    parseExpression(dsl);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: errorMessage(error) };
  }
}

export function validateExpressionReferences(
  dsl: string,
  lexicons: LexiconClass[]
): ValidationResult {
  const syntax = validateDsl(dsl);
  if (!syntax.valid) return syntax;

  const knownNames = new Set(lexicons.map((lexicon) => lexicon.name));
  const missing = [
    ...new Set(
      parseExpression(dsl).terms
        .flatMap((term) => term.alternatives)
        .filter((name) => !knownNames.has(name))
    )
  ];
  return missing.length
    ? { valid: false, error: `未定义词类：${missing.join('、')}` }
    : { valid: true };
}

export function testExpression(
  dsl: string,
  query: string,
  lexicons: LexiconClass[],
  preprocessRules: PreprocessRule[] = []
): ExpressionTestResult {
  const validation = validateDsl(dsl);
  if (!validation.valid) {
    return {
      ...validation,
      normalizedText: normalizeText(query, preprocessRules),
      matched: false,
      ordered: false,
      scoreDelta: 0,
      terms: []
    };
  }

  const parsed = parseExpression(dsl);
  const normalizedText = normalizeText(query, preprocessRules);
  const tokens = tokenizeWithLexicons(normalizedText, lexicons);
  const coreResult = evaluateTemplate(
    {
      id: 'single-expression-test',
      kind: 'template',
      content: dsl,
      templateConfig: { mode: parsed.mode, polarity: 'positive' }
    },
    tokens.map((token) => ({
      ...token,
      weight: token.lexiconWeight ?? 1
    }))
  );
  const terms = parsed.terms.map((term): ExpressionTermResult => {
    const token = tokens.find(
      (candidate) =>
        candidate.lexiconName &&
        term.alternatives.includes(candidate.lexiconName)
    );
    return {
      label: term.alternatives.join('|'),
      alternatives: term.alternatives,
      optional: term.optional,
      matched: Boolean(token),
      token
    };
  });
  return {
    valid: true,
    normalizedText,
    matched: coreResult.matched,
    ordered: parsed.ordered,
    scoreDelta: coreResult.score,
    rawScore: coreResult.rawScore,
    formula: coreResult.formula,
    components: coreResult.components,
    terms,
    matchMode: parsed.mode
  };
}
