import * as XLSX from 'xlsx';
import type {
  BusinessConcept,
  ExpandedQuestion,
  KnowledgeInstruction,
  KnowledgeItem,
  WorkbenchState
} from '../domain/types';

export const AV_EXPORT_HEADERS = [
  '分类一', '分类二', '分类三', '分类四', '分类五', '实例名称',
  '语义块', '属性', '辅助语义块', '扩展语义块', '推荐标识', '禁用标识',
  '标准问题', '扩展问', '模板类型', '测试样例', '维度', '标准答案',
  '指令', '素材ID', '素材类型', '有效时间起'
] as const;

export type AvExportHeader = (typeof AV_EXPORT_HEADERS)[number];
export type AvExportRow = Record<AvExportHeader, string>;

export interface AvExportIssue {
  knowledgeItemId: string;
  knowledgeItemName: string;
  issue: string;
}

function formatCompactDate(value?: string) {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : value.replace(/\D/g, '').slice(0, 8);
}

function templateType(definition?: ExpandedQuestion) {
  if (!definition) return '';
  if (definition.kind === 'ordinary') return '普通问题';
  if (definition.templateConfig?.polarity === 'negative') return '否定模板';
  switch (definition.templateConfig?.mode) {
    case 'boost': return '增强模板';
    case 'exact': return '完全匹配模板';
    case 'fallback': return '候补模板';
    default: return '肯定模板';
  }
}

function instructionText(instruction: KnowledgeInstruction) {
  const prefix = {
    related_question: 'rq',
    recommended_question: 'ro',
    menu: 'nenu',
    command: 'command'
  }[instruction.type];
  const targets = instruction.targetKnowledgeItemIds.join(',');
  return targets ? `${prefix}(${targets})` : instruction.rawText ?? '';
}

function serializeInstructions(item: KnowledgeItem) {
  const structured = (item.structuredInstructions ?? [])
    .filter((instruction) => instruction.enabled)
    .map(instructionText)
    .filter(Boolean);
  return structured.length ? structured.join('\n') : item.sourceInstruction ?? '';
}

function linkedConcept(item: KnowledgeItem, state: WorkbenchState): BusinessConcept | undefined {
  const conceptIds = new Set(
    state.templates
      .filter((template) => item.conceptTemplateIds.includes(template.id))
      .map((template) => template.conceptId)
  );
  return state.concepts.find((concept) => conceptIds.has(concept.id))
    ?? state.concepts.find((concept) => concept.name === item.businessInstanceName)
    ?? (state.concepts.length === 1 ? state.concepts[0] : undefined);
}

function emptyRow(): AvExportRow {
  return Object.fromEntries(AV_EXPORT_HEADERS.map((header) => [header, ''])) as AvExportRow;
}

function baseRow(item: KnowledgeItem, state: WorkbenchState): AvExportRow {
  const path = item.categoryPath?.length
    ? item.categoryPath
    : [item.domain, item.category].filter(Boolean);
  const concept = linkedConcept(item, state);
  const material = item.materialRefs?.[0];
  const row = emptyRow();
  path.slice(0, 5).forEach((part, index) => {
    row[AV_EXPORT_HEADERS[index]] = part;
  });
  return {
    ...row,
    实例名称: item.businessInstanceName ?? item.scene,
    语义块: concept?.semanticBlock ?? '',
    属性: item.knowledgeAttribute ?? concept?.knowledgeAttribute ?? '',
    辅助语义块: concept?.auxiliarySemanticBlock ?? '',
    扩展语义块: concept?.extendedSemanticBlock ?? '',
    推荐标识: item.recommended ? '1' : '',
    禁用标识: ['disabled', 'archived'].includes(item.status) ? '1' : '',
    标准问题: item.standardQuestion,
    维度: item.channels.join('，'),
    标准答案: item.standardAnswer,
    指令: serializeInstructions(item),
    素材ID: material?.id ?? '',
    素材类型: material?.type ?? '',
    有效时间起: formatCompactDate(item.validFrom)
  };
}

export function projectKnowledgeToAvRows(
  state: WorkbenchState,
  knowledgeItems: KnowledgeItem[] = state.knowledgeItems
): AvExportRow[] {
  return knowledgeItems.flatMap((item) => {
    const base = baseRow(item, state);
    const definitions = item.expandedQuestionDefinitions ?? [];
    if (!definitions.length) return [base];
    return definitions.flatMap((definition) => {
      const examples = definition.testExamples?.length ? definition.testExamples : [''];
      return examples.map((example) => ({
        ...base,
        扩展问: definition.content,
        模板类型: templateType(definition),
        测试样例: example
      }));
    });
  });
}

export function collectAvExportIssues(
  state: WorkbenchState,
  knowledgeItems: KnowledgeItem[] = state.knowledgeItems
): AvExportIssue[] {
  const knowledgeIds = new Set(state.knowledgeItems.map((item) => item.id));
  return knowledgeItems.flatMap((item) => {
    const issues: string[] = [];
    if (item.validFrom && Number.isNaN(Date.parse(item.validFrom))) issues.push('生效时间格式无效');
    if (item.validTo && Number.isNaN(Date.parse(item.validTo))) issues.push('失效时间格式无效');
    if (item.validFrom && item.validTo && Date.parse(item.validFrom) > Date.parse(item.validTo)) {
      issues.push('生效时间晚于失效时间');
    }
    for (const instruction of item.structuredInstructions ?? []) {
      const missing = instruction.targetKnowledgeItemIds.filter((id) => !knowledgeIds.has(id));
      if (missing.length) issues.push(`指令目标不存在：${missing.join('、')}`);
    }
    for (const material of item.materialRefs ?? []) {
      if (!material.id || !material.type) issues.push('素材引用缺少 ID 或类型');
    }
    return issues.map((issue) => ({
      knowledgeItemId: item.id,
      knowledgeItemName: item.name,
      issue
    }));
  });
}

export function downloadAvWorkbook(
  state: WorkbenchState,
  knowledgeItems: KnowledgeItem[] = state.knowledgeItems
) {
  const workbook = XLSX.utils.book_new();
  const rows = projectKnowledgeToAvRows(state, knowledgeItems);
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...AV_EXPORT_HEADERS] });
  sheet['!cols'] = AV_EXPORT_HEADERS.map((header) => ({ wch: Math.max(12, header.length + 4) }));
  XLSX.utils.book_append_sheet(workbook, sheet, '完整总表');

  const issues = collectAvExportIssues(state, knowledgeItems);
  if (issues.length) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(issues.map((issue) => ({
        知识点ID: issue.knowledgeItemId,
        知识点名称: issue.knowledgeItemName,
        问题: issue.issue
      }))),
      '导出问题'
    );
  }
  XLSX.writeFile(workbook, `小i知识A-V完整总表_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
