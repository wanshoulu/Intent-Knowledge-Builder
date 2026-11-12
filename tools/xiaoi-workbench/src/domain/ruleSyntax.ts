export interface RuleSyntaxItem {
  symbol: string;
  description: string;
}

export const XIAOI_DSL_SYNTAX: RuleSyntaxItem[] = [
  { symbol: '[词类]', description: '必须出现已定义词类' },
  { symbol: '[词类?]', description: '词类可以不出现' },
  { symbol: '[A|B]', description: '任意出现一个词类' },
  { symbol: '([A][B])', description: '词类按书写顺序出现' },
  { symbol: '&', description: '增强匹配，只能位于开头' },
  { symbol: '&&', description: '完全匹配，只能位于开头' },
  { symbol: '&+', description: '候补匹配，只能位于开头' }
];

export const XIAOI_LEXICON_MODIFIERS: RuleSyntaxItem[] = [
  { symbol: '*', description: '提高词类权重' },
  { symbol: '#', description: '同义词之间不计算相似' },
  { symbol: '@', description: '启用拼音纠错' },
  { symbol: '%n', description: '标记名词词性' },
  { symbol: '%v', description: '标记动词词性' }
];

export const XIAOI_REGEX_DEFINITION =
  '正则表达式仅用于动态词文本匹配，采用 JavaScript RegExp 语法；它不是小 i 语义规则 DSL。';
