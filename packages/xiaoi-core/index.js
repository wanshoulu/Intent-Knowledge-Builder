'use strict';

const {
  evaluateRecognitionExpectation
} = require('./evaluation');

const DEFAULT_THRESHOLDS = Object.freeze({
  answerThreshold: 0.75,
  searchThreshold: 0.6,
  minimumAnswerThreshold: 0.65,
  maximumSimilarityDifference: 0.1,
  minimumSimilarityDifference: 0.05
});

const TEMPLATE_SCORE_COEFFICIENT = 0.92;
const DEFAULT_TEMPLATE_THRESHOLD = 0.75;
const DEFAULT_NEGATIVE_TEMPLATE_THRESHOLD = 0.85;
const GENERIC_TERM_WEIGHT = 0.2;
const IGNORED_ORDINARY_WORDS = [
  '帮我', '一下', '请问', '我想', '想要', '麻烦', '请', '的', '么', '呢', '吗', '啊'
];
const ACTION_LEXICON_NAMES = new Set([
  '预约', '查询', '取消', '办理', '挂失', '解锁', '开通', '关闭', '修改', '删除', '兑换', '转账'
]);

const DEFAULT_REPLY = '抱歉，当前知识库中没有找到可以确定回答的内容。';

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function applySimilarityWeight(scoreValue, weightValue = 1) {
  const score = clampScore(scoreValue);
  const weight = Math.max(0, Number(weightValue) || 0);
  if (!score || !weight) return 0;
  if (score >= 1) return 1;
  return clampScore((weight * score) / (1 - score + weight * score));
}

function effectiveLexiconWeight(lexicon) {
  const base = Math.max(0, Number(lexicon.weight ?? 1));
  const modifier = lexicon.weightMarked
    ? Number(lexicon.weightAdjustment ?? 0)
    : 0;
  return Math.max(0, base + modifier);
}

function normalizeTextWithTrace(value, rules = [], diagnostics = []) {
  const originalText = String(value ?? '');
  const systemSteps = [];
  let normalized = originalText;
  const applySystemStep = (operation, transform) => {
    const before = normalized;
    normalized = transform(normalized);
    systemSteps.push({
      operation,
      before,
      after: normalized,
      changed: before !== normalized
    });
  };
  applySystemStep('全角半角与兼容字符归一', (text) => text.normalize('NFKC'));
  applySystemStep('英文转小写', (text) => text.toLowerCase());
  applySystemStep('去除空白', (text) => text.replace(/\s+/g, ''));

  const ruleSteps = [];
  for (const rule of rules.filter((item) => item.enabled !== false)) {
    const before = normalized;
    try {
      if (rule.type === 'replace') {
        normalized = normalized.replace(
          new RegExp(rule.pattern, 'g'),
          rule.replacement ?? ''
        );
      } else if (rule.type === 'prefix') {
        normalized = normalized.replace(new RegExp(`^(?:${rule.pattern})`), '');
      } else if (rule.type === 'suffix') {
        normalized = normalized.replace(new RegExp(`(?:${rule.pattern})$`), '');
      } else if (rule.type === 'stopword') {
        normalized = normalized.replace(new RegExp(rule.pattern, 'g'), '');
      }
      ruleSteps.push({
        ruleId: rule.id,
        ruleName: rule.name ?? rule.id,
        type: rule.type,
        pattern: rule.pattern,
        before,
        after: normalized,
        matched: before !== normalized
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({
        stage: 'normalization',
        objectId: rule.id,
        message
      });
      ruleSteps.push({
        ruleId: rule.id,
        ruleName: rule.name ?? rule.id,
        type: rule.type,
        pattern: rule.pattern,
        before,
        after: before,
        matched: false,
        error: message
      });
    }
  }

  return {
    text: normalized,
    trace: {
      input: originalText,
      systemSteps,
      ruleSteps,
      output: normalized
    }
  };
}

function normalizeText(value, rules = [], diagnostics = []) {
  return normalizeTextWithTrace(value, rules, diagnostics).text;
}

function createLexiconTerms(lexicon) {
  return [...new Set([
    lexicon.standardTerm,
    ...(lexicon.aliases ?? []),
    ...(lexicon.pinyinCorrection ? lexicon.pinyinAliases ?? [] : [])
  ])]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function tokenizeWithLexiconsWithTrace(text, lexicons = [], diagnostics = []) {
  const matches = [];

  for (const lexicon of lexicons.filter(
    (item) => item.status !== 'disabled' && item.status !== 'archived'
  )) {
    if (lexicon.dynamic && lexicon.pattern) {
      try {
        const expression = new RegExp(lexicon.pattern, 'g');
        for (const match of text.matchAll(expression)) {
          if (match.index === undefined || !match[0]) continue;
          matches.push({
            text: match[0],
            normalized: lexicon.standardTerm,
            lexiconId: lexicon.id,
            lexiconName: lexicon.name,
            dynamic: true,
            dynamicValue: match[0],
            start: match.index,
            end: match.index + match[0].length,
            weight: effectiveLexiconWeight(lexicon),
            matchQuality: 1,
            matchSource: 'dynamic',
            synonymsSimilar: lexicon.synonymsSimilar !== false,
            posType: lexicon.posType
          });
        }
      } catch (error) {
        diagnostics.push({
          stage: 'segmentation',
          objectId: lexicon.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      continue;
    }

    for (const term of createLexiconTerms(lexicon)) {
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
          weight: effectiveLexiconWeight(lexicon),
          matchQuality:
            lexicon.pinyinCorrection && (lexicon.pinyinAliases ?? []).includes(term)
              ? 0.8
              : 1,
          matchSource:
            term === lexicon.standardTerm
              ? 'standard'
              : lexicon.pinyinCorrection && (lexicon.pinyinAliases ?? []).includes(term)
                ? 'pinyin'
                : 'alias',
          synonymsSimilar: lexicon.synonymsSimilar !== false,
          posType: lexicon.posType
        });
        start = text.indexOf(term, start + term.length);
      }
    }
  }

  const sorted = matches.sort(
      (left, right) =>
        left.start - right.start ||
        right.end - right.start - (left.end - left.start)
    );
  const candidates = sorted.map((token, index, all) => {
    const covering = all.slice(0, index).find(
      (existing) =>
        existing.start <= token.start &&
        existing.end >= token.end &&
        existing.end - existing.start > token.end - token.start
    );
    return {
      ...token,
      selected: !covering,
      reason: covering
        ? `被更长候选「${covering.text}」完全覆盖`
        : '按起点和最长词优先策略入选'
    };
  });
  return {
    tokens: candidates
      .filter((candidate) => candidate.selected)
      .map(({ selected, reason, ...token }) => token),
    trace: {
      input: text,
      strategy: '按起点排序；同一起点最长词优先；排除被更长候选完全覆盖的词',
      candidates
    }
  };
}

function tokenizeWithLexicons(text, lexicons = [], diagnostics = []) {
  return tokenizeWithLexiconsWithTrace(text, lexicons, diagnostics).tokens;
}

function canonicalizeText(text, tokens) {
  return [...tokens]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, token) =>
        `${current.slice(0, token.start)}[${token.normalized}]${current.slice(token.end)}`,
      text
    );
}

function bigrams(value) {
  if (value.length < 2) return value ? [value] : [];
  return Array.from(
    { length: value.length - 1 },
    (_, index) => value.slice(index, index + 2)
  );
}

function diceSimilarity(leftValue, rightValue) {
  const left = String(leftValue ?? '');
  const right = String(rightValue ?? '');
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftPairs = bigrams(left);
  const remaining = bigrams(right);
  let overlap = 0;

  for (const pair of leftPairs) {
    const index = remaining.indexOf(pair);
    if (index < 0) continue;
    overlap += 1;
    remaining.splice(index, 1);
  }

  return clampScore((2 * overlap) / (leftPairs.length + bigrams(right).length));
}

function ordinaryTerms(text, tokens) {
  const terms = tokens
    .filter((token) => token.lexiconId)
    .map((token, index) => ({
      id: `lexicon:${token.lexiconId}:${index}`,
      key: token.synonymsSimilar === false
        ? `literal:${token.normalized}`
        : `lexicon:${token.lexiconId}`,
      text: token.text,
      normalized: token.normalized,
      lexiconName: token.lexiconName,
      weight: Math.max(0, Number(token.weight ?? 1)),
      quality: clampScore(token.matchQuality ?? 1),
      start: token.start,
      end: token.end,
      generic: false
    }));
  const covered = Array(text.length).fill(false);
  for (const token of tokens) {
    for (let index = token.start; index < token.end; index += 1) covered[index] = true;
  }
  let gapStart = null;
  const appendGap = (end) => {
    if (gapStart === null || end <= gapStart) return;
    let gap = text.slice(gapStart, end).replace(/[\p{P}\p{S}\s]+/gu, '');
    for (const word of IGNORED_ORDINARY_WORDS) gap = gap.split(word).join(' ');
    for (const value of gap.split(/\s+/).filter(Boolean)) {
      terms.push({
        id: `generic:${gapStart}:${value}`,
        key: `generic:${value}`,
        text: value,
        normalized: value,
        weight: GENERIC_TERM_WEIGHT,
        quality: 1,
        start: gapStart,
        end,
        generic: true
      });
    }
  };
  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && !covered[index]) {
      if (gapStart === null) gapStart = index;
    } else if (gapStart !== null) {
      appendGap(index);
      gapStart = null;
    }
  }
  return terms.sort((left, right) => left.start - right.start);
}

function alignOrdinaryTerms(leftTerms, rightTerms) {
  const possible = [];
  leftTerms.forEach((left, leftIndex) => {
    rightTerms.forEach((right, rightIndex) => {
      if (left.key !== right.key) return;
      const quality = Math.min(left.quality, right.quality);
      possible.push({
        leftIndex,
        rightIndex,
        contribution: Math.min(left.weight, right.weight) * quality,
        quality
      });
    });
  });
  possible.sort((left, right) => right.contribution - left.contribution);
  const usedLeft = new Set();
  const usedRight = new Set();
  return possible.filter((pair) => {
    if (usedLeft.has(pair.leftIndex) || usedRight.has(pair.rightIndex)) return false;
    usedLeft.add(pair.leftIndex);
    usedRight.add(pair.rightIndex);
    return true;
  }).map((pair) => ({
    ...pair,
    queryTerm: leftTerms[pair.leftIndex],
    expressionTerm: rightTerms[pair.rightIndex]
  }));
}

function actionConflictCoefficient(queryTerms, expressionTerms) {
  const queryActions = new Set(
    queryTerms.filter((term) => ACTION_LEXICON_NAMES.has(term.lexiconName)).map((term) => term.lexiconName)
  );
  const expressionActions = new Set(
    expressionTerms.filter((term) => ACTION_LEXICON_NAMES.has(term.lexiconName)).map((term) => term.lexiconName)
  );
  if (!queryActions.size || !expressionActions.size) return 1;
  return [...expressionActions].some((action) => !queryActions.has(action)) ? 0.65 : 1;
}

function longestCommonSubsequence(left, right) {
  const table = Array.from(
    { length: left.length + 1 },
    () => Array(right.length + 1).fill(0)
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      table[leftIndex][rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? table[leftIndex - 1][rightIndex - 1] + 1
          : Math.max(
              table[leftIndex - 1][rightIndex],
              table[leftIndex][rightIndex - 1]
            );
    }
  }
  return table[left.length][right.length];
}

function tokenOrderConsistency(leftTokens, rightTokens) {
  const left = leftTokens.filter((token) => token.lexiconId).map((token) => token.lexiconId);
  const right = rightTokens.filter((token) => token.lexiconId).map((token) => token.lexiconId);
  const denominator = Math.max(left.length, right.length);
  return denominator
    ? clampScore(longestCommonSubsequence(left, right) / denominator)
    : 0;
}

function scoreOrdinarySimilarity(query, question, strategy) {
  const characterSimilarity = diceSimilarity(
    query.canonicalText,
    question.canonicalText
  );
  const lexiconCoverage = weightedLexiconCoverage(query.tokens, question.tokens);
  const orderConsistency = tokenOrderConsistency(query.tokens, question.tokens);
  if (strategy === 'lexicon-hybrid-v1') {
    return {
      score: clampScore(
        characterSimilarity * 0.55 +
        lexiconCoverage * 0.3 +
        orderConsistency * 0.15
      ),
      strategy,
      formula: '0.55 × 字符相似 + 0.30 × 词类覆盖 + 0.15 × 词序一致',
      components: {
        characterSimilarity,
        lexiconCoverage,
        orderConsistency
      }
    };
  }
  return {
    score: characterSimilarity,
    strategy: 'dice-bigram-v1',
    formula: 'Dice 二元字符相似度',
    components: {
      characterSimilarity,
      lexiconCoverage,
      orderConsistency
    }
  };
}

function scoreOrdinarySimilarityV1(query, question) {
  const queryTerms = ordinaryTerms(query.normalizedText, query.tokens);
  const expressionTerms = ordinaryTerms(question.normalizedText, question.tokens);
  const pairs = alignOrdinaryTerms(queryTerms, expressionTerms);
  const queryWeight = queryTerms.reduce((sum, term) => sum + term.weight, 0);
  const expressionWeight = expressionTerms.reduce((sum, term) => sum + term.weight, 0);
  const matchedWeight = pairs.reduce((sum, pair) => sum + pair.contribution, 0);
  const weightedDice = queryWeight + expressionWeight
    ? clampScore((2 * matchedWeight) / (queryWeight + expressionWeight))
    : 0;
  const conflictCoefficient = actionConflictCoefficient(queryTerms, expressionTerms);
  return {
    score: clampScore(weightedDice * conflictCoefficient),
    strategy: 'weighted-lexicon-dice-v1',
    formula: 'C_conflict * 2M / (W_query + W_expression)',
    components: {
      queryWeight,
      expressionWeight,
      matchedWeight,
      weightedDice,
      conflictCoefficient,
      queryTerms,
      expressionTerms,
      matchPairs: pairs
    }
  };
}

function parseTemplate(sourceValue, configuredMode) {
  const source = String(sourceValue ?? '').trim();
  if (!source) throw new Error('模板不能为空');

  let mode = configuredMode;
  let cursor = 0;
  if (source.startsWith('&&')) {
    mode = 'exact';
    cursor = 2;
  } else if (source.startsWith('&+')) {
    mode = 'fallback';
    cursor = 2;
  } else if (source.startsWith('&')) {
    mode = 'boost';
    cursor = 1;
  }
  mode = mode ?? 'base';

  const terms = [];
  const orderStack = [];
  let nextOrderGroup = 1;

  while (cursor < source.length) {
    const character = source[cursor];
    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }
    if (character === '(') {
      if (orderStack.length) throw new Error(`有序分组不支持嵌套，位置 ${cursor}`);
      orderStack.push(nextOrderGroup++);
      cursor += 1;
      continue;
    }
    if (character === ')') {
      if (!orderStack.length) throw new Error(`有序分组缺少开始括号，位置 ${cursor}`);
      orderStack.pop();
      cursor += 1;
      continue;
    }
    if (character !== '[') {
      throw new Error(`无法识别的模板内容“${character}”，位置 ${cursor}`);
    }
    const closingBracket = source.indexOf(']', cursor + 1);
    if (closingBracket < 0) throw new Error(`词类模板未闭合，位置 ${cursor}`);
    const raw = source.slice(cursor + 1, closingBracket).trim();
    const optional = raw.endsWith('?');
    const body = optional ? raw.slice(0, -1).trim() : raw;
    const alternatives = body.split('|').map((item) => item.trim());
    if (!alternatives.length || alternatives.some((item) => !item)) {
      throw new Error(`模板词类不能为空，位置 ${cursor}`);
    }
    terms.push({
      alternatives,
      optional,
      orderGroup: orderStack[0]
    });
    cursor = closingBracket + 1;
  }

  if (orderStack.length) throw new Error('有序分组未闭合');
  if (!terms.length) throw new Error('模板中未找到词类');
  return { mode, terms };
}

function assignTemplateTokens(parsed, tokens) {
  const assigned = [];

  function visit(termIndex, usedIndexes, groupPositions) {
    if (termIndex >= parsed.terms.length) return true;
    const term = parsed.terms[termIndex];
    const choices = tokens
      .map((token, index) => ({ token, index }))
      .filter(
        ({ token, index }) =>
          !usedIndexes.has(index) &&
          term.alternatives.includes(token.lexiconName)
      )
      .filter(({ token }) => {
        if (term.orderGroup === undefined) return true;
        const previous = groupPositions.get(term.orderGroup);
        return previous === undefined || token.start >= previous;
      })
      .sort((left, right) => left.token.start - right.token.start);

    for (const choice of choices) {
      assigned[termIndex] = choice.token;
      const nextUsed = new Set(usedIndexes).add(choice.index);
      const nextPositions = new Map(groupPositions);
      if (term.orderGroup !== undefined) {
        nextPositions.set(term.orderGroup, choice.token.end);
      }
      if (visit(termIndex + 1, nextUsed, nextPositions)) return true;
    }

    if (term.optional) {
      assigned[termIndex] = undefined;
      return visit(termIndex + 1, usedIndexes, groupPositions);
    }
    return false;
  }

  return visit(0, new Set(), new Map()) ? assigned : null;
}

function evaluateTemplateLegacy(expandedQuestion, tokens) {
  const config = expandedQuestion.templateConfig ?? {};
  try {
    const parsed = parseTemplate(expandedQuestion.content, config.mode);
    const assigned = assignTemplateTokens(parsed, tokens);
    const matchedTokens = (assigned ?? []).filter(Boolean);
    const requiredCount = parsed.terms.filter((term) => !term.optional).length;
    const matchedRequiredCount = parsed.terms.reduce(
      (count, term, index) => count + (!term.optional && assigned?.[index] ? 1 : 0),
      0
    );
    const requiredCoverage = requiredCount
      ? matchedRequiredCount / requiredCount
      : 1;
    const effectiveTokens = tokens.filter((token) => token.lexiconName);
    const matchedWeight = matchedTokens.reduce(
      (sum, token) => sum + Number(token.weight ?? 1),
      0
    );
    const effectiveWeight = effectiveTokens.reduce(
      (sum, token) => sum + Number(token.weight ?? 1),
      0
    );
    const semanticPrecision = effectiveWeight
      ? clampScore(matchedWeight / effectiveWeight)
      : 0;
    const optionalCount = parsed.terms.filter((term) => term.optional).length;
    const matchedOptionalCount = parsed.terms.reduce(
      (count, term, index) => count + (term.optional && assigned?.[index] ? 1 : 0),
      0
    );
    const optionalCoverage = optionalCount
      ? matchedOptionalCount / optionalCount
      : 0;
    const structuralSpecificity = Math.min(0.04, requiredCount * 0.01);
    const exactCoverage =
      assigned !== null &&
      matchedTokens.length === effectiveTokens.length &&
      effectiveTokens.length > 0;
    let matched = assigned !== null;
    const rawScore = matched
      ? clampScore(
          0.7 +
          semanticPrecision * 0.16 +
          optionalCoverage * 0.06 +
          0.04 +
          structuralSpecificity
        )
      : 0;
    let score = rawScore;

    // The source material's "10x" boost is a ranking signal, not a bounded
    // similarity value. Keep reported similarity discriminative and reserve
    // 1.00 for explicit exact templates.
    if (parsed.mode === 'boost') {
      score = matched ? Math.min(0.99, rawScore + 0.02) : 0;
    }
    if (parsed.mode === 'exact') {
      matched = exactCoverage;
      score = exactCoverage ? 1 : 0;
    }

    return {
      expandedQuestionId: expandedQuestion.id,
      polarity: config.polarity ?? 'positive',
      mode: parsed.mode,
      matched,
      score,
      rawScore,
      boostFactor: parsed.mode === 'boost' ? 10 : 1,
      formula:
        parsed.mode === 'exact'
          ? '有效词完全覆盖时为 1'
          : '0.70 + 0.16 × 语义精度 + 0.06 × 可选词覆盖 + 0.04 × 结构匹配 + 必选词具体度',
      components: {
        requiredCoverage,
        semanticPrecision,
        optionalCoverage,
        structuralSpecificity
      },
      matchedTokens: matchedTokens.map((token) => ({
        text: token.text,
        lexiconName: token.lexiconName,
        dynamicValue: token.dynamicValue
      })),
      missingTerms: parsed.terms
        .filter((term, index) => !term.optional && !assigned?.[index])
        .map((term) => term.alternatives),
      exactCoverage,
      error: null
    };
  } catch (error) {
    return {
      expandedQuestionId: expandedQuestion.id,
      polarity: config.polarity ?? 'positive',
      mode: config.mode ?? 'base',
      matched: false,
      score: 0,
      rawScore: 0,
      boostFactor: config.mode === 'boost' ? 10 : 1,
      formula: null,
      components: {
        requiredCoverage: 0,
        semanticPrecision: 0,
        optionalCoverage: 0,
        structuralSpecificity: 0
      },
      matchedTokens: [],
      missingTerms: [],
      exactCoverage: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function assignTemplateTokensPartially(parsed, tokens) {
  const assigned = [];
  const usedIndexes = new Set();
  const groupPositions = new Map();
  parsed.terms.forEach((term, termIndex) => {
    const choice = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token, index }) =>
        !usedIndexes.has(index) && term.alternatives.includes(token.lexiconName)
      )
      .filter(({ token }) => {
        if (term.orderGroup === undefined) return true;
        const previous = groupPositions.get(term.orderGroup);
        return previous === undefined || token.start >= previous;
      })
      .sort((left, right) => left.token.start - right.token.start)[0];
    if (!choice) return;
    assigned[termIndex] = choice.token;
    usedIndexes.add(choice.index);
    if (term.orderGroup !== undefined) {
      groupPositions.set(term.orderGroup, choice.token.end);
    }
  });
  return assigned;
}

function templateTermWeight(term, lexicons) {
  const weights = term.alternatives.map((name) => {
    const lexicon = lexicons.find((item) => item.name === name);
    return lexicon ? effectiveLexiconWeight(lexicon) : 1;
  });
  return Math.max(1, ...weights);
}

function evaluateTemplate(expandedQuestion, tokens, lexicons = []) {
  const config = expandedQuestion.templateConfig ?? {};
  try {
    const parsed = parseTemplate(expandedQuestion.content, config.mode);
    const completeAssignment = assignTemplateTokens(parsed, tokens);
    const assigned = completeAssignment ?? assignTemplateTokensPartially(parsed, tokens);
    const matchedTokens = assigned.filter(Boolean);
    const requiredTerms = parsed.terms
      .map((term, index) => ({ term, index }))
      .filter(({ term }) => !term.optional);
    const requiredWeight = requiredTerms.reduce(
      (sum, { term }) => sum + templateTermWeight(term, lexicons),
      0
    );
    const matchedRequiredWeight = requiredTerms.reduce(
      (sum, { term, index }) =>
        sum + (assigned[index] ? templateTermWeight(term, lexicons) : 0),
      0
    );
    const requiredCoverage = requiredWeight
      ? clampScore(matchedRequiredWeight / requiredWeight)
      : 1;
    const effectiveTokens = tokens.filter((token) => token.lexiconName);
    const matchedWeight = matchedTokens.reduce(
      (sum, token) => sum + Math.max(0, Number(token.weight ?? 1)),
      0
    );
    const effectiveWeight = effectiveTokens.reduce(
      (sum, token) => sum + Math.max(0, Number(token.weight ?? 1)),
      0
    );
    const queryPrecision = effectiveWeight
      ? clampScore(matchedWeight / effectiveWeight)
      : 0;
    const qualityWeight = matchedTokens.reduce(
      (sum, token) =>
        sum + Math.max(0, Number(token.weight ?? 1)) * clampScore(token.matchQuality ?? 1),
      0
    );
    const matchQuality = matchedWeight
      ? clampScore(qualityWeight / matchedWeight)
      : 0;
    const diagnosticRawScore = clampScore(
      0.55 * requiredCoverage + 0.30 * queryPrecision + 0.15 * matchQuality
    );
    const baseScore = clampScore(TEMPLATE_SCORE_COEFFICIENT * diagnosticRawScore);
    const exactCoverage = completeAssignment !== null &&
      matchedTokens.length === effectiveTokens.length &&
      effectiveTokens.length > 0;
    let matched = completeAssignment !== null;
    let score = baseScore;
    if (parsed.mode === 'boost') score = matched ? applySimilarityWeight(baseScore, 10) : baseScore;
    if (parsed.mode === 'exact') {
      matched = exactCoverage;
      score = exactCoverage ? 1 : baseScore;
    }
    return {
      expandedQuestionId: expandedQuestion.id,
      polarity: config.polarity ?? 'positive',
      mode: parsed.mode,
      matched,
      score,
      rawScore: diagnosticRawScore,
      baseScore,
      boostFactor: parsed.mode === 'boost' ? 10 : 1,
      formula: parsed.mode === 'exact'
        ? 'exact coverage => 1.00'
        : '0.92 * (0.55R_required + 0.30P_query + 0.15Q_match)',
      components: {
        requiredCoverage,
        queryPrecision,
        matchQuality,
        semanticPrecision: queryPrecision,
        optionalCoverage: matchQuality,
        structuralSpecificity: TEMPLATE_SCORE_COEFFICIENT
      },
      matchedTokens: matchedTokens.map((token) => ({
        text: token.text,
        lexiconName: token.lexiconName,
        dynamicValue: token.dynamicValue,
        weight: Number(token.weight ?? 1),
        matchQuality: clampScore(token.matchQuality ?? 1)
      })),
      missingTerms: parsed.terms
        .filter((term, index) => !term.optional && !assigned[index])
        .map((term) => term.alternatives),
      exactCoverage,
      structureGatePassed: completeAssignment !== null,
      error: null
    };
  } catch (error) {
    return {
      expandedQuestionId: expandedQuestion.id,
      polarity: config.polarity ?? 'positive',
      mode: config.mode ?? 'base',
      matched: false,
      score: 0,
      rawScore: 0,
      baseScore: 0,
      boostFactor: config.mode === 'boost' ? 10 : 1,
      formula: null,
      components: {
        requiredCoverage: 0,
        queryPrecision: 0,
        matchQuality: 0,
        semanticPrecision: 0,
        optionalCoverage: 0,
        structuralSpecificity: TEMPLATE_SCORE_COEFFICIENT
      },
      matchedTokens: [],
      missingTerms: [],
      exactCoverage: false,
      structureGatePassed: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function normalizeExpandedQuestions(item, expressions = [], scope = 'workspace') {
  const formalDefinitions = item.expandedQuestionDefinitions ?? [];
  const sourceQuestions = formalDefinitions.length
    ? formalDefinitions
    : item.expandedQuestions ?? [];
  const expandedQuestions = sourceQuestions.map(
    (question, index) =>
      typeof question === 'string'
        ? {
            id: `${item.id}-ordinary-${index}`,
            kind: 'ordinary',
            content: question,
            enabled: true,
            status: item.status
          }
        : question
  ).filter(
    (question) =>
      question.enabled !== false &&
      (scope !== 'published' || question.status === 'published')
  );
  const linkedExpressions = expressions
    .filter(
      (expression) =>
        (scope !== 'published' || expression.status === 'published') &&
        (
          (expression.knowledgeItemIds ?? []).includes(item.id) ||
          (item.expressionIds ?? []).includes(expression.id) ||
          (item.positiveExpressionIds ?? []).includes(expression.id) ||
          (item.negativeExpressionIds ?? []).includes(expression.id)
        )
    )
    .map((expression) => ({
      id: expression.id,
      kind: 'template',
      content: expression.dsl,
      enabled: expression.status !== 'disabled' && expression.status !== 'archived',
      priority: expression.priority,
      templateConfig: {
        polarity: expression.polarity ?? 'positive'
      }
    }));
  const existingIds = new Set(expandedQuestions.map((question) => question.id));
  return [
    ...expandedQuestions,
    ...linkedExpressions.filter((question) => !existingIds.has(question.id))
  ];
}

function compareOrdinaryQuestions(
  query,
  item,
  expandedQuestions,
  lexicons,
  rules,
  strategy = 'weighted-lexicon-dice-v1'
) {
  const questions = [
    {
      id: `${item.id}-standard`,
      type: 'standard',
      content: item.standardQuestion
    },
    ...expandedQuestions
      .filter((question) => question.kind === 'ordinary' && question.enabled !== false)
      .map((question) => ({
        id: question.id,
        type: 'ordinary',
        content: question.content,
        weight: question.weight ?? 1.1
      }))
  ];
  const comparisons = questions.map((question) => {
    const normalized = normalizeText(question.content, rules);
    const tokens = tokenizeWithLexicons(normalized, lexicons);
    const canonicalText = canonicalizeText(normalized, tokens);
    const similarity = scoreOrdinarySimilarityV1(
      query,
      { normalizedText: normalized, canonicalText, tokens }
    );
    return {
      ...question,
      normalizedText: normalized,
      canonicalText,
      rawScore: similarity.score,
      score: applySimilarityWeight(
        similarity.score,
        question.weight ?? 1
      ),
      strategy: similarity.strategy,
      formula: similarity.formula,
      components: similarity.components
    };
  });
  return {
    score: Math.max(0, ...comparisons.map((comparison) => comparison.score)),
    comparisons
  };
}

function scoreKnowledgePoint(query, item, snapshot, scope, similarityStrategy) {
  const expandedQuestions = normalizeExpandedQuestions(
    item,
    snapshot.expressions ?? [],
    scope
  );
  const ordinary = compareOrdinaryQuestions(
    query,
    item,
    expandedQuestions,
    snapshot.lexicons ?? [],
    snapshot.preprocessRules ?? [],
    similarityStrategy
  );
  const templateTraces = expandedQuestions
    .filter((question) => question.kind === 'template' && question.enabled !== false)
    .map((question) => ({
      ...evaluateTemplate(question, query.tokens, snapshot.lexicons ?? []),
      priority: question.priority ?? 0,
      activationThreshold:
        question.templateConfig?.activationThreshold ??
        snapshot.engineProfile?.templateThreshold ??
        DEFAULT_TEMPLATE_THRESHOLD,
      negativeThreshold:
        question.templateConfig?.negativeThreshold ??
        snapshot.engineProfile?.negativeTemplateThreshold ??
        DEFAULT_NEGATIVE_TEMPLATE_THRESHOLD
    }));
  const positiveMatches = templateTraces.filter(
    (trace) => trace.matched && trace.polarity === 'positive'
  );
  const hasPrimaryTemplate = positiveMatches.some(
    (trace) =>
      trace.mode !== 'fallback' && trace.score >= trace.activationThreshold
  );
  const effectivePositiveMatches = positiveMatches
    .map((trace) => ({
      ...trace,
      suppressed: trace.mode === 'fallback' && hasPrimaryTemplate
    }))
    .filter((trace) => !trace.suppressed);
  const negativeMatches = templateTraces.filter(
    (trace) =>
      trace.matched &&
      trace.polarity === 'negative' &&
      trace.score >= trace.negativeThreshold
  );
  const templateScore = Math.max(
    0,
    ...effectivePositiveMatches.map((trace) => trace.score)
  );
  const blockedByNegativeTemplate = negativeMatches.length > 0;
  const rulePriority = Math.max(
    0,
    ...effectivePositiveMatches.map((trace) => {
      return trace.priority ?? 0;
    })
  );
  const expressionCandidates = [
    ...ordinary.comparisons.map((comparison) => ({
      expressionId: comparison.id,
      expressionType: comparison.type,
      content: comparison.content,
      score: comparison.score,
      rawScore: comparison.rawScore,
      active: true,
      priority: 0
    })),
    ...templateTraces
      .filter((trace) => trace.polarity === 'positive')
      .map((trace) => ({
        expressionId: trace.expandedQuestionId,
        expressionType: 'template',
        mode: trace.mode,
        score: trace.score,
        rawScore: trace.rawScore,
        active:
          trace.matched && !(trace.mode === 'fallback' && hasPrimaryTemplate),
        suppressed: trace.mode === 'fallback' && hasPrimaryTemplate,
        priority: trace.priority ?? 0
      }))
  ];
  const winningCandidate = expressionCandidates
    .filter((candidate) => candidate.active)
    .sort((left, right) =>
      right.score - left.score || right.priority - left.priority
    )[0] ?? null;
  return {
    knowledgePointId: item.id,
    knowledgePointName: item.name,
    score: blockedByNegativeTemplate
      ? 0
      : winningCandidate?.score ?? 0,
    ordinaryScore: ordinary.score,
    templateScore,
    blockedByNegativeTemplate,
    ordinaryComparisons: ordinary.comparisons,
    templateTraces: templateTraces.map((trace) => ({
      ...trace,
      suppressed:
        trace.polarity === 'positive' &&
        trace.mode === 'fallback' &&
        hasPrimaryTemplate
    })),
    expressionCandidates,
    winningCandidate,
    rulePriority,
    hasPrimaryTemplate: effectivePositiveMatches.some(
      (trace) => trace.mode !== 'fallback'
    ),
    hasFallbackTemplate: effectivePositiveMatches.some(
      (trace) => trace.mode === 'fallback'
    ),
    winningSource:
      winningCandidate?.expressionType === 'template'
        ? 'template'
        : 'ordinary-question'
  };
}

function suppressFallbackCandidates(candidates) {
  const hasUsablePrimary = candidates.some(
    (candidate) =>
      !candidate.blockedByNegativeTemplate &&
      candidate.hasPrimaryTemplate &&
      candidate.templateScore > 0
  );
  if (!hasUsablePrimary) return candidates;

  return candidates.map((candidate) => {
    if (!candidate.hasFallbackTemplate || candidate.hasPrimaryTemplate) {
      return candidate;
    }
    const templateTraces = candidate.templateTraces.map((trace) =>
      trace.mode === 'fallback' && trace.matched
        ? { ...trace, suppressed: true }
        : trace
    );
    return {
      ...candidate,
      templateScore: 0,
      score: candidate.blockedByNegativeTemplate ? 0 : candidate.ordinaryScore,
      winningSource: 'ordinary-question',
      templateTraces
    };
  });
}

function normalizeThresholds(value = {}) {
  return {
    answerThreshold:
      value.answerThreshold ?? DEFAULT_THRESHOLDS.answerThreshold,
    searchThreshold:
      value.searchThreshold ??
      value.suggestionThreshold ??
      DEFAULT_THRESHOLDS.searchThreshold,
    minimumAnswerThreshold:
      value.minimumAnswerThreshold ??
      DEFAULT_THRESHOLDS.minimumAnswerThreshold,
    maximumSimilarityDifference:
      value.maximumSimilarityDifference ??
      DEFAULT_THRESHOLDS.maximumSimilarityDifference,
    minimumSimilarityDifference:
      value.minimumSimilarityDifference ??
      value.ambiguityDelta ??
      DEFAULT_THRESHOLDS.minimumSimilarityDifference
  };
}

function decideCandidates(candidatesValue, thresholdValue = {}) {
  const thresholds = normalizeThresholds(thresholdValue);
  const candidates = [...candidatesValue]
    .filter((candidate) => !candidate.blockedByNegativeTemplate)
    .sort((left, right) => right.score - left.score);
  const winner = candidates[0];
  const runnerUp = candidates[1];
  const lead = winner
    ? runnerUp
      ? winner.score - runnerUp.score
      : 1
    : 0;

  if (!winner) {
    return { decision: 'continue', reason: 'no-candidate', thresholds };
  }

  if (winner.score >= thresholds.answerThreshold) {
    const highCandidates = candidates.filter(
      (candidate) => candidate.score >= thresholds.answerThreshold
    );
    if (
      runnerUp &&
      runnerUp.score >= thresholds.answerThreshold &&
      lead < thresholds.minimumSimilarityDifference &&
      (winner.rulePriority ?? 0) === (runnerUp.rulePriority ?? 0)
    ) {
      return {
        decision: 'ambiguous',
        reason: 'high-score-candidates-too-close',
        candidateIds: highCandidates.map((candidate) => candidate.knowledgePointId),
        lead,
        thresholds
      };
    }
    return {
      decision: 'matched',
      reason: 'answer-threshold-reached',
      knowledgePointId: winner.knowledgePointId,
      score: winner.score,
      lead,
      thresholds
    };
  }

  if (
    winner.score >= thresholds.minimumAnswerThreshold &&
    lead > thresholds.maximumSimilarityDifference
  ) {
    return {
      decision: 'matched',
      reason: 'minimum-answer-with-clear-lead',
      knowledgePointId: winner.knowledgePointId,
      score: winner.score,
      lead,
      thresholds
    };
  }

  const suggestions = candidates.filter(
    (candidate) => candidate.score >= thresholds.searchThreshold
  );
  if (suggestions.length) {
    return {
      decision: 'suggested',
      reason: 'search-threshold-reached',
      suggestionIds: suggestions.map((candidate) => candidate.knowledgePointId),
      score: winner.score,
      lead,
      thresholds
    };
  }

  return {
    decision: 'continue',
    reason: 'below-search-threshold',
    score: winner.score,
    lead,
    thresholds
  };
}

function defaultModules(snapshot) {
  if (snapshot.modules?.length) return snapshot.modules;
  return [
    {
      id: 'default-module',
      name: '默认模块',
      enabled: true,
      priority: 0,
      thresholds: snapshot.engineProfile ?? DEFAULT_THRESHOLDS
    }
  ];
}

function itemBelongsToModule(item, module, hasConfiguredModules) {
  if (!hasConfiguredModules) return true;
  if (item.moduleId) return item.moduleId === module.id;
  if (module.knowledgePointIds?.length) {
    return module.knowledgePointIds.includes(item.id);
  }
  return module.id === 'default-module';
}

function conditionValueMatches(actual, expected) {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

function evaluateModuleConditions(module, options) {
  const dimensions = {
    ...(options.dimensions ?? {}),
    ...(options.channel ? { channel: options.channel } : {})
  };
  const context = options.context ?? {};
  const failures = [];

  for (const [key, expected] of Object.entries(
    module.dimensionConditions ?? {}
  )) {
    const actual = dimensions[key];
    if (!conditionValueMatches(actual, expected)) {
      failures.push({
        type: 'dimension',
        key,
        expected,
        actual: actual ?? null
      });
    }
  }

  if (
    module.ignoreCategoryMatch !== true &&
    module.categoryConditions?.length &&
    !module.categoryConditions.includes(options.category)
  ) {
    failures.push({
      type: 'category',
      expected: module.categoryConditions,
      actual: options.category ?? null
    });
  }

  for (const [key, expected] of Object.entries(
    module.contextConditions ?? {}
  )) {
    const actual = context[key];
    if (!conditionValueMatches(actual, expected)) {
      failures.push({
        type: 'context',
        key,
        expected,
        actual: actual ?? null
      });
    }
  }

  return {
    matched: failures.length === 0,
    dimensions,
    category: options.category ?? null,
    context,
    failures
  };
}

function selectAnswer(item, options) {
  const dimensions = {
    ...(options.dimensions ?? {}),
    ...(options.channel ? { channel: options.channel } : {})
  };
  const candidates = (item.answerVariants ?? []).map((variant, index) => {
    const conditions = [
      ['channel', variant.channel],
      ['region', variant.region],
      ['segment', variant.segment]
    ]
      .filter(([, expected]) => typeof expected === 'string' && expected.trim())
      .map(([key, expected]) => ({
        key,
        expected,
        actual: dimensions[key] ?? null,
        matched: dimensions[key] === expected
      }));
    return {
      variant,
      index,
      specificity: conditions.length,
      matched: conditions.every((condition) => condition.matched),
      conditions
    };
  });
  const selected = candidates
    .filter((candidate) => candidate.matched)
    .sort(
      (left, right) =>
        right.specificity - left.specificity || left.index - right.index
    )[0];
  const trace = {
    source: selected ? 'variant' : 'standard',
    selectedVariantId: selected?.variant.id ?? null,
    dimensions,
    candidates: candidates.map((candidate) => ({
      variantId: candidate.variant.id,
      matched: candidate.matched,
      specificity: candidate.specificity,
      selected: candidate.variant.id === selected?.variant.id,
      conditions: candidate.conditions
    }))
  };
  return {
    content: selected?.variant.content ?? item.standardAnswer,
    actionIds: selected?.variant.actionIds ?? [],
    trace
  };
}

function extractSlots(item, tokens) {
  const extractedSlots = Object.fromEntries(
    (item.slots ?? []).flatMap((slot) => {
      const token = tokens.find(
        (candidate) => candidate.lexiconId === slot.lexiconId
      );
      if (!token) return [];
      return [[slot.name, token.dynamicValue ?? token.text]];
    })
  );
  const missingSlots = (item.slots ?? []).filter(
    (slot) => slot.required && !extractedSlots[slot.name]
  );
  return { extractedSlots, missingSlots };
}

function resolveMappingValue(mapping, sources) {
  const sourceKey = mapping.sourceKey ?? mapping.parameter;
  if (mapping.source === 'literal') return mapping.literalValue;
  return sources[mapping.source]?.[sourceKey];
}

function interpolatePayload(payload, parameters) {
  return Object.fromEntries(
    Object.entries(payload ?? {}).map(([key, value]) => [
      key,
      String(value).replace(/\{([^}]+)\}/g, (placeholder, parameter) =>
        parameters[parameter] === undefined
          ? placeholder
          : String(parameters[parameter])
      )
    ])
  );
}

function buildActionInvocation(action, sources = {}, channel) {
  const errors = [];
  if (!action) {
    return {
      actionId: null,
      actionCode: null,
      type: null,
      parameters: {},
      payload: {},
      valid: false,
      errors: ['Action does not exist']
    };
  }
  if (action.status === 'disabled' || action.status === 'archived') {
    errors.push('Action is not active');
  }
  if (channel && action.channels?.length && !action.channels.includes(channel)) {
    errors.push(`Action does not support channel ${channel}`);
  }

  const parameters = {};
  for (const mapping of action.inputMappings ?? []) {
    const value = resolveMappingValue(mapping, sources);
    if (
      mapping.required &&
      (value === undefined || value === null || value === '')
    ) {
      errors.push(
        `Required parameter ${mapping.parameter} has no value from ${mapping.source}:${mapping.sourceKey ?? mapping.parameter}`
      );
      continue;
    }
    if (value !== undefined && value !== null && value !== '') {
      parameters[mapping.parameter] = value;
    }
  }

  return {
    actionId: action.id,
    actionCode: action.actionCode,
    type: action.type,
    parameters,
    payload: interpolatePayload(action.payload, parameters),
    valid: errors.length === 0,
    errors
  };
}

function resolveActions(
  snapshot,
  item,
  channel,
  answerActionIds = [],
  sources = {}
) {
  const actionIds = new Set([...(item.actionIds ?? []), ...answerActionIds]);
  const actions = new Map(
    (snapshot.actions ?? []).map((action) => [action.id, action])
  );
  const invocations = [...actionIds].map((id) => {
    const action = actions.get(id);
    const invocation = buildActionInvocation(action, sources, channel);
    return action
      ? invocation
      : { ...invocation, actionId: id };
  });
  return {
    actionIds: invocations
      .filter((invocation) => invocation.valid)
      .map((invocation) => invocation.actionId),
    invocations
  };
}

function recognizeKnowledge(snapshot, options) {
  const diagnostics = [];
  const normalizationResult = normalizeTextWithTrace(
    options.query,
    snapshot.preprocessRules ?? [],
    diagnostics
  );
  const normalizedText = normalizationResult.text;
  const scope = options.scope ?? 'workspace';
  const activeLexicons = (snapshot.lexicons ?? []).filter(
    (lexicon) =>
      lexicon.status !== 'disabled' &&
      lexicon.status !== 'archived' &&
      (scope !== 'published' || lexicon.status === 'published')
  );
  const segmentationResult = tokenizeWithLexiconsWithTrace(
    normalizedText,
    activeLexicons,
    diagnostics
  );
  const tokens = segmentationResult.tokens;
  const query = {
    originalText: options.query,
    normalizedText,
    tokens,
    canonicalText: canonicalizeText(normalizedText, tokens)
  };
  const pipelineTrace = {
    originalText: options.query,
    normalization: normalizationResult.trace,
    segmentation: segmentationResult.trace,
    canonicalText: query.canonicalText
  };
  const modules = defaultModules(snapshot)
    .filter((module) => module.enabled !== false)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const hasConfiguredModules = Boolean(snapshot.modules?.length);
  const traceModules = [];

  for (const module of modules) {
    const similarityStrategy = 'weighted-lexicon-dice-v1';
    const conditions = evaluateModuleConditions(module, options);
    if (!conditions.matched) {
      traceModules.push({
        moduleId: module.id,
        moduleName: module.name,
        priority: module.priority ?? 0,
        conditions,
        candidates: [],
        decision: 'skipped',
        thresholdDecision: {
          decision: 'continue',
          reason: 'module-conditions-not-met',
          thresholds: normalizeThresholds(
            module.thresholds ?? snapshot.engineProfile
          )
        }
      });
      continue;
    }
    const nowValue = Date.parse(options.now ?? new Date().toISOString());
    const items = (snapshot.knowledgeItems ?? []).filter(
      (item) =>
        item.status !== 'disabled' &&
        item.status !== 'archived' &&
        (options.includeInactive ||
          ((!item.validFrom || Date.parse(item.validFrom) <= nowValue) &&
            (!item.validTo || Date.parse(item.validTo) >= nowValue))) &&
        (scope !== 'published' || item.status === 'published') &&
        itemBelongsToModule(item, module, hasConfiguredModules)
    );
    const candidates = items.map((item) =>
      scoreKnowledgePoint(query, item, snapshot, scope, similarityStrategy)
    ).sort(
      (left, right) =>
        right.score - left.score ||
        (right.rulePriority ?? 0) - (left.rulePriority ?? 0)
    );
    const moduleDecision = decideCandidates(
      candidates,
      module.thresholds ?? snapshot.engineProfile
    );
    traceModules.push({
      moduleId: module.id,
      moduleName: module.name,
      priority: module.priority ?? 0,
      similarityStrategy,
      conditions,
      candidates,
      decision:
        moduleDecision.decision === 'continue'
          ? 'continue'
          : moduleDecision.decision,
      thresholdDecision: moduleDecision
    });

    if (moduleDecision.decision === 'continue') continue;
    if (moduleDecision.decision === 'ambiguous') {
      return {
        query: options.query,
        normalizedText,
        tokens,
        pipelineTrace,
        decision: 'ambiguous',
        knowledgePointId: null,
        answer: snapshot.engineProfile?.defaultReply ?? DEFAULT_REPLY,
        actionIds: [],
        actionInvocations: [],
        extractedSlots: {},
        missingSlots: [],
        score: candidates[0]?.score ?? 0,
        suggestions: moduleDecision.candidateIds ?? [],
        diagnostics,
        trace: { engineVersion: snapshot.engineVersion ?? 'xiaoi-core-v1', modules: traceModules }
      };
    }
    if (moduleDecision.decision === 'suggested') {
      return {
        query: options.query,
        normalizedText,
        tokens,
        pipelineTrace,
        decision: 'suggested',
        knowledgePointId: null,
        answer: null,
        actionIds: [],
        actionInvocations: [],
        extractedSlots: {},
        missingSlots: [],
        score: candidates[0]?.score ?? 0,
        suggestions: moduleDecision.suggestionIds,
        diagnostics,
        trace: { engineVersion: snapshot.engineVersion ?? 'xiaoi-core-v1', modules: traceModules }
      };
    }

    const item = items.find(
      (candidate) => candidate.id === moduleDecision.knowledgePointId
    );
    const channel = options.channel;
    const supportsChannel =
      !item?.channels?.length || !channel || item.channels.includes(channel);
    if (!item || !supportsChannel) continue;
    const answerSelection = selectAnswer(item, options);
    const slotResolution = extractSlots(item, tokens);
    if (slotResolution.missingSlots.length) {
      return {
        query: options.query,
        normalizedText,
        tokens,
        pipelineTrace,
        decision: 'clarification',
        knowledgePointId: item.id,
        knowledgePoint: item,
        answer:
          slotResolution.missingSlots[0].clarificationQuestion ??
          snapshot.engineProfile?.defaultReply ??
          DEFAULT_REPLY,
        actionIds: [],
        actionInvocations: [],
        extractedSlots: slotResolution.extractedSlots,
        missingSlots: slotResolution.missingSlots,
        score: moduleDecision.score,
        suggestions: [],
        diagnostics,
        trace: {
          engineVersion: snapshot.engineVersion ?? 'xiaoi-core-v1',
          modules: traceModules,
          answerSelection: answerSelection.trace,
          actionResolution: {
            status: 'waiting-for-required-slots',
            missingSlotNames: slotResolution.missingSlots.map(
              (slot) => slot.name
            )
          }
        }
      };
    }
    const actionResolution = resolveActions(
      snapshot,
      item,
      channel,
      answerSelection.actionIds,
      {
        slot: slotResolution.extractedSlots,
        dimension: {
          ...(options.dimensions ?? {}),
          ...(channel ? { channel } : {})
        },
        context: options.context ?? {}
      }
    );
    return {
      query: options.query,
      normalizedText,
      tokens,
      pipelineTrace,
      decision: 'matched',
      knowledgePointId: item.id,
      knowledgePoint: item,
      answer: answerSelection.content,
      actionIds: actionResolution.actionIds,
      actionInvocations: actionResolution.invocations,
      extractedSlots: slotResolution.extractedSlots,
      missingSlots: slotResolution.missingSlots,
      score: moduleDecision.score,
      suggestions: [],
      diagnostics,
      trace: {
        engineVersion: snapshot.engineVersion ?? 'xiaoi-core-v1',
        modules: traceModules,
        answerSelection: answerSelection.trace,
        actionResolution: {
          status: actionResolution.invocations.every(
            (invocation) => invocation.valid
          )
            ? 'ready'
            : 'invalid',
          invocations: actionResolution.invocations
        }
      }
    };
  }

  return {
    query: options.query,
    normalizedText,
    tokens,
    pipelineTrace,
    decision: 'rejected',
    knowledgePointId: null,
    answer: snapshot.engineProfile?.defaultReply ?? DEFAULT_REPLY,
    actionIds: [],
    actionInvocations: [],
    extractedSlots: {},
    missingSlots: [],
    score:
      traceModules.flatMap((module) => module.candidates)[0]?.score ?? 0,
    suggestions: [],
    diagnostics,
    trace: { engineVersion: snapshot.engineVersion ?? 'xiaoi-core-v1', modules: traceModules }
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  canonicalizeText,
  decideCandidates,
  diceSimilarity,
  evaluateTemplate,
  evaluateRecognitionExpectation,
  normalizeExpandedQuestions,
  normalizeText,
  normalizeThresholds,
  parseTemplate,
  buildActionInvocation,
  recognizeKnowledge,
  tokenizeWithLexicons
};
