export type ExpressionPurpose = 'positive' | 'negative';

export type BusinessMatchMode = 'normal' | 'boost' | 'exact' | 'fallback';

export interface ExpressionAlternativeGroup {
  id: string;
  lexiconIds: string[];
}

export interface ExpressionBusinessConfig {
  schemaVersion: 2;
  editorMode: 'business' | 'expert';
  purpose: ExpressionPurpose;
  requiredLexiconIds: string[];
  optionalLexiconIds: string[];
  alternativeGroups: ExpressionAlternativeGroup[];
  ordered: boolean;
  matchMode: BusinessMatchMode;
  contextLexiconIds?: string[];
  exclusionLexiconIds?: string[];
  customized?: boolean;
}

export interface ExpressionTestCase {
  id: string;
  query: string;
  expectation: 'match' | 'not_match' | 'exclude' | 'target';
  expectedTargetId?: string;
  enabled: boolean;
  source: 'manual' | 'regression' | 'feedback';
}

export function createDefaultBusinessConfig(
  purpose: ExpressionPurpose = 'positive'
): ExpressionBusinessConfig {
  return {
    schemaVersion: 2,
    editorMode: 'business',
    purpose,
    requiredLexiconIds: [],
    optionalLexiconIds: [],
    alternativeGroups: [],
    ordered: false,
    matchMode: 'normal',
    contextLexiconIds: [],
    exclusionLexiconIds: []
  };
}
