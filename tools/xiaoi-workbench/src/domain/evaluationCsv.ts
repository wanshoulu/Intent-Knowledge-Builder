import type {
  EvaluationDecision,
  PersistedEvaluationSample
} from './types';

const HEADERS = [
  'query',
  'expected_decision',
  'expected_knowledge_point_id',
  'expected_answer_contains',
  'expected_action_ids',
  'channel',
  'category',
  'dimensions_json',
  'context_json',
  'tags'
] as const;

const DECISIONS = new Set<EvaluationDecision>([
  'matched',
  'clarification',
  'suggested',
  'ambiguous',
  'rejected'
]);

function parseRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = value.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((cell) => cell.length)) rows.push(row);
  return rows;
}

function parseRecord(
  value: string,
  label: string,
  rowErrors: string[]
) {
  if (!value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('must be an object');
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, item]) => [key, String(item)])
    );
  } catch {
    rowErrors.push(`${label} 不是有效的 JSON 对象`);
    return undefined;
  }
}

export function parseEvaluationSamples(
  value: string,
  knowledgePointIds: Set<string>
) {
  const rows = parseRows(value);
  if (!rows.length) {
    return { samples: [], errors: ['CSV 文件为空'] };
  }
  const headerIndexes = new Map(
    rows[0].map((header, index) => [header.trim(), index])
  );
  const errors: string[] = [];
  const samples: PersistedEvaluationSample[] = [];

  rows.slice(1).forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const get = (name: typeof HEADERS[number]) =>
      cells[headerIndexes.get(name) ?? -1]?.trim() ?? '';
    const rowErrors: string[] = [];
    const query = get('query');
    const decision = get('expected_decision') as EvaluationDecision;
    const knowledgePointId = get('expected_knowledge_point_id');

    if (!query) rowErrors.push('query 不能为空');
    if (!DECISIONS.has(decision)) {
      rowErrors.push(`expected_decision ${decision || '为空'} 非法`);
    }
    if (decision === 'matched' && !knowledgePointId) {
      rowErrors.push('matched 样例必须提供 expected_knowledge_point_id');
    }
    if (
      knowledgePointId &&
      !knowledgePointIds.has(knowledgePointId)
    ) {
      rowErrors.push(`知识点 ${knowledgePointId} 不存在`);
    }
    const dimensions = parseRecord(
      get('dimensions_json'),
      'dimensions_json',
      rowErrors
    );
    const context = parseRecord(
      get('context_json'),
      'context_json',
      rowErrors
    );

    if (rowErrors.length) {
      errors.push(`第 ${line} 行：${rowErrors.join('；')}`);
      return;
    }
    samples.push({
      id: `sample-import-${line}`,
      query,
      enabled: true,
      expectedDecision: decision,
      expectedKnowledgePointId: knowledgePointId || undefined,
      expectedAnswerContains:
        get('expected_answer_contains') || undefined,
      expectedActionIds: get('expected_action_ids')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean),
      channel: get('channel') || undefined,
      category: get('category') || undefined,
      dimensions,
      context,
      source: 'imported',
      relatedObjectIds: knowledgePointId ? [knowledgePointId] : [],
      tags: get('tags')
        .split(/[,|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    });
  });

  return {
    samples: errors.length ? [] : samples,
    errors
  };
}

function escapeCell(value: unknown) {
  const text = typeof value === 'string'
    ? value
    : value === undefined
      ? ''
      : JSON.stringify(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function exportEvaluationSamples(
  samples: PersistedEvaluationSample[]
) {
  const rows = samples.map((sample) => [
    sample.query,
    sample.expectedDecision,
    sample.expectedKnowledgePointId,
    sample.expectedAnswerContains,
    sample.expectedActionIds?.join('|'),
    sample.channel,
    sample.category,
    sample.dimensions,
    sample.context,
    sample.tags?.join(',')
  ]);
  return [
    HEADERS.join(','),
    ...rows.map((row) => row.map(escapeCell).join(','))
  ].join('\r\n');
}
