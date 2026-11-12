export type TemplateMatchMode = 'normal' | 'boost' | 'exact' | 'fallback';

export interface DslTerm {
  alternatives: string[];
  optional: boolean;
  orderGroup?: number;
}

export interface ParsedExpression {
  terms: DslTerm[];
  ordered: boolean;
  mode: TemplateMatchMode;
}

function readMode(source: string): { mode: TemplateMatchMode; offset: number } {
  if (source.startsWith('&&')) return { mode: 'exact', offset: 2 };
  if (source.startsWith('&+')) return { mode: 'fallback', offset: 2 };
  if (source.startsWith('&')) return { mode: 'boost', offset: 1 };
  return { mode: 'normal', offset: 0 };
}

export function parseExpression(dsl: string): ParsedExpression {
  const source = dsl.trim();
  if (!source) throw new Error('表达式不能为空');

  const { mode, offset } = readMode(source);
  const terms: DslTerm[] = [];
  let cursor = offset;
  let activeOrderGroup: number | undefined;
  let activeOrderStart = 0;
  let nextOrderGroup = 1;

  while (cursor < source.length) {
    const character = source[cursor];

    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }

    if (character === '(') {
      if (activeOrderGroup !== undefined) {
        throw new Error(`有序分组不支持嵌套，位置 ${cursor}`);
      }
      activeOrderGroup = nextOrderGroup++;
      activeOrderStart = terms.length;
      cursor += 1;
      continue;
    }

    if (character === ')') {
      if (activeOrderGroup === undefined) {
        throw new Error(`有序分组缺少起始括号，位置 ${cursor}`);
      }
      if (terms.length === activeOrderStart) {
        throw new Error(`有序分组不能为空，位置 ${cursor}`);
      }
      activeOrderGroup = undefined;
      cursor += 1;
      continue;
    }

    if (character === '&') {
      throw new Error(`模板模式符号只能位于开头，位置 ${cursor}`);
    }

    if (character !== '[') {
      throw new Error(`无法识别的表达式内容「${character}」，位置 ${cursor}`);
    }

    const closingBracket = source.indexOf(']', cursor + 1);
    if (closingBracket < 0) {
      throw new Error(`词类模板未闭合，位置 ${cursor}`);
    }

    const raw = source.slice(cursor + 1, closingBracket).trim();
    const optional = raw.endsWith('?');
    const body = optional ? raw.slice(0, -1).trim() : raw;
    const rawAlternatives = body.split('|').map((value) => value.trim());
    if (rawAlternatives.some((value) => !value)) {
      throw new Error(`或运算不能包含空词类，位置 ${cursor}`);
    }
    const alternatives = rawAlternatives;
    if (alternatives.length === 0) {
      throw new Error(`空词类模板，位置 ${cursor}`);
    }

    terms.push({
      alternatives,
      optional,
      orderGroup: activeOrderGroup
    });
    cursor = closingBracket + 1;
  }

  if (activeOrderGroup !== undefined) {
    throw new Error('有序分组未闭合');
  }
  if (terms.length === 0) {
    throw new Error('表达式中未找到词类模板');
  }

  return {
    terms,
    ordered: terms.some((term) => term.orderGroup !== undefined),
    mode
  };
}
