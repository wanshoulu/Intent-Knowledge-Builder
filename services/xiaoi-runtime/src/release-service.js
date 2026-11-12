const crypto = require('node:crypto');
const { inTransaction, openDatabase } = require('./database');
const { recognizeKnowledge } = require('../../../packages/xiaoi-core');

class RuntimeError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function now() {
  return new Date().toISOString();
}

function checksum(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseJson(value, fallback = null) {
  return value ? JSON.parse(value) : fallback;
}

function mapDraft(row) {
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    revision: row.revision,
    content: parseJson(row.content_json, {}),
    checksum: row.content_checksum,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

function mapChangeSet(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    applicationId: row.application_id,
    title: row.title,
    businessReason: row.business_reason,
    baseReleaseId: row.base_release_id,
    draftRevision: row.draft_revision,
    objectRefs: parseJson(row.object_refs_json, []),
    dependencyRefs: parseJson(row.dependency_refs_json, []),
    gateResult: parseJson(row.gate_result_json),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRelease(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    version: row.version,
    changeSetId: row.change_set_id,
    sourceRevision: row.source_revision,
    snapshot: parseJson(row.snapshot_json, {}),
    checksum: row.checksum,
    publishedBy: row.published_by,
    publishedAt: row.published_at
  };
}

function collectReferences(content) {
  const knowledgeItems = content.knowledgeItems ?? [];
  const expressions = content.expressions ?? [];
  const lexicons = content.lexicons ?? [];
  const actions = content.actions ?? [];
  const expressionIds = new Set(expressions.map((item) => item.id));
  const lexiconIds = new Set(lexicons.map((item) => item.id));
  const actionIds = new Set(actions.map((item) => item.id));
  const actionsById = new Map(actions.map((item) => [item.id, item]));
  const issues = [];

  for (const item of knowledgeItems) {
    const slotNames = new Set((item.slots ?? []).map((slot) => slot.name));
    for (const id of [
      ...(item.expressionIds ?? []),
      ...(item.positiveExpressionIds ?? []),
      ...(item.negativeExpressionIds ?? [])
    ]) {
      if (!expressionIds.has(id)) issues.push(`${item.id} references missing expression ${id}`);
    }
    for (const id of item.lexiconIds ?? []) {
      if (!lexiconIds.has(id)) issues.push(`${item.id} references missing lexicon ${id}`);
    }
    for (const slot of item.slots ?? []) {
      if (!lexiconIds.has(slot.lexiconId)) {
        issues.push(`${item.id} slot ${slot.id} references missing lexicon ${slot.lexiconId}`);
      }
    }
    for (const id of item.actionIds ?? []) {
      if (!actionIds.has(id)) issues.push(`${item.id} references missing action ${id}`);
    }
    for (const variant of item.answerVariants ?? []) {
      for (const id of variant.actionIds ?? []) {
        if (!actionIds.has(id)) {
          issues.push(`${item.id} answer ${variant.id} references missing action ${id}`);
        }
      }
    }
    const boundActionIds = new Set([
      ...(item.actionIds ?? []),
      ...(item.answerVariants ?? []).flatMap(
        (variant) => variant.actionIds ?? []
      )
    ]);
    for (const id of boundActionIds) {
      const action = actionsById.get(id);
      if (!action) continue;
      for (const mapping of action.inputMappings ?? []) {
        if (!mapping.parameter?.trim()) {
          issues.push(`${item.id} action ${id} has a mapping without parameter name`);
        }
        if (
          mapping.source === 'slot' &&
          !slotNames.has(mapping.sourceKey ?? mapping.parameter)
        ) {
          issues.push(
            `${item.id} action ${id} references undefined slot ${mapping.sourceKey ?? mapping.parameter}`
          );
        }
        if (
          mapping.source === 'literal' &&
          mapping.required &&
          !String(mapping.literalValue ?? '').trim()
        ) {
          issues.push(
            `${item.id} action ${id} has an empty required literal ${mapping.parameter}`
          );
        }
      }
    }
  }
  for (const expression of expressions) {
    for (const id of expression.lexiconIds ?? []) {
      if (!lexiconIds.has(id)) issues.push(`${expression.id} references missing lexicon ${id}`);
    }
  }
  return issues;
}

function validateDsl(dsl) {
  const pairs = { '[': ']', '(': ')' };
  const stack = [];
  for (const character of String(dsl ?? '')) {
    if (pairs[character]) stack.push(pairs[character]);
    if (character === ']' || character === ')') {
      if (stack.pop() !== character) return false;
    }
  }
  return stack.length === 0;
}

function collectRegressionCases(content) {
  return (content.expressions ?? []).flatMap((expression) => {
    const configured = (expression.testCases ?? []).filter(
      (testCase) => testCase.enabled !== false
    );
    const testCases = configured.length
      ? configured
      : (expression.testExamples ?? []).map((query, index) => ({
          id: `${expression.id}-legacy-${index + 1}`,
          query,
          expectation:
            expression.polarity === 'negative' ? 'exclude' : 'match',
          enabled: true,
          source: 'regression'
        }));
    return testCases.map((testCase) => ({ expression, testCase }));
  });
}

function findTemplateTrace(result, expressionId) {
  for (const module of result.trace?.modules ?? []) {
    for (const candidate of module.candidates ?? []) {
      const trace = (candidate.templateTraces ?? []).find(
        (item) => item.expandedQuestionId === expressionId
      );
      if (trace) return trace;
    }
  }
  return null;
}

function evaluateRegression(content) {
  const cases = collectRegressionCases(content);
  const failures = [];
  let passed = 0;

  for (const { expression, testCase } of cases) {
    const result = recognizeKnowledge(
      { ...content, engineVersion: 'xiaoi-core-v1' },
      { query: testCase.query, scope: 'workspace' }
    );
    const templateTrace = findTemplateTrace(result, expression.id);
    const matched = Boolean(templateTrace?.matched);
    let casePassed = false;
    if (testCase.expectation === 'not_match') {
      casePassed = !matched;
    } else if (testCase.expectation === 'exclude') {
      casePassed = matched && expression.polarity === 'negative';
    } else if (testCase.expectation === 'target') {
      casePassed =
        Boolean(testCase.expectedTargetId) &&
        result.knowledgePointId === testCase.expectedTargetId;
    } else {
      casePassed = matched && expression.polarity !== 'negative';
    }

    if (casePassed) {
      passed += 1;
    } else {
      failures.push({
        code: 'REGRESSION_TESTS',
        objectId: expression.id,
        message: `Regression failed: ${testCase.query} (${testCase.expectation})`
      });
    }
  }

  return {
    total: cases.length,
    passed,
    failed: failures.length,
    failures
  };
}

function evaluateDraft(content, revision) {
  const checks = [];
  const blockingIssues = [];
  const knowledgeItems = content.knowledgeItems ?? [];
  const expressions = content.expressions ?? [];

  const incompleteItems = knowledgeItems.filter(
    (item) => !String(item.standardQuestion ?? '').trim() ||
      (item.targetType !== 'task' && !String(item.standardAnswer ?? '').trim())
  );
  checks.push({
    code: 'REQUIRED_FIELDS',
    passed: incompleteItems.length === 0,
    message: incompleteItems.length
      ? `${incompleteItems.length} knowledge items have missing required fields`
      : 'Required fields are complete'
  });
  blockingIssues.push(...incompleteItems.map((item) => ({
    code: 'REQUIRED_FIELDS',
    objectId: item.id,
    message: 'Standard question or answer is missing'
  })));

  const invalidExpressions = expressions.filter((expression) => !validateDsl(expression.dsl));
  checks.push({
    code: 'DSL_VALID',
    passed: invalidExpressions.length === 0,
    message: invalidExpressions.length
      ? `${invalidExpressions.length} expressions have invalid DSL`
      : 'DSL syntax is valid'
  });
  blockingIssues.push(...invalidExpressions.map((expression) => ({
    code: 'DSL_VALID',
    objectId: expression.id,
    message: 'DSL brackets are not balanced'
  })));

  const referenceIssues = collectReferences(content);
  checks.push({
    code: 'REFERENCES_VALID',
    passed: referenceIssues.length === 0,
    message: referenceIssues.length
      ? `${referenceIssues.length} invalid references found`
      : 'Object references are valid'
  });
  blockingIssues.push(...referenceIssues.map((message) => ({
    code: 'REFERENCES_VALID',
    message
  })));

  const validityIssues = knowledgeItems.flatMap((item) => {
    const issues = [];
    const validFrom = item.validFrom ? Date.parse(item.validFrom) : null;
    const validTo = item.validTo ? Date.parse(item.validTo) : null;
    if (item.validFrom && Number.isNaN(validFrom)) issues.push('Invalid validFrom date');
    if (item.validTo && Number.isNaN(validTo)) issues.push('Invalid validTo date');
    if (validFrom !== null && validTo !== null && !Number.isNaN(validFrom) &&
      !Number.isNaN(validTo) && validFrom > validTo) {
      issues.push('validFrom is later than validTo');
    }
    return issues.map((message) => ({ code: 'VALIDITY', objectId: item.id, message }));
  });
  checks.push({
    code: 'VALIDITY',
    passed: validityIssues.length === 0,
    message: validityIssues.length
      ? `${validityIssues.length} knowledge validity settings are invalid`
      : 'Knowledge validity settings are valid'
  });
  blockingIssues.push(...validityIssues);

  const knowledgeIds = new Set(knowledgeItems.map((item) => item.id));
  const instructionIssues = knowledgeItems.flatMap((item) => {
    const instructions = (item.structuredInstructions ?? [])
      .filter((instruction) => instruction.enabled !== false);
    const issues = [];
    if (String(item.sourceInstruction ?? '').trim() && instructions.length === 0) {
      issues.push('Raw instruction has not been converted to a structured instruction');
    }
    for (const instruction of instructions) {
      const targets = instruction.targetKnowledgeItemIds ?? [];
      if (['related_question', 'recommended_question'].includes(instruction.type) &&
        targets.length === 0) {
        issues.push(`Instruction ${instruction.id} has no target knowledge item`);
      }
      const missingTargets = targets.filter((targetId) => !knowledgeIds.has(targetId));
      if (missingTargets.length) {
        issues.push(`Instruction ${instruction.id} references missing knowledge: ${missingTargets.join(', ')}`);
      }
    }
    return issues.map((message) => ({
      code: 'INSTRUCTIONS_VALID', objectId: item.id, message
    }));
  });
  checks.push({
    code: 'INSTRUCTIONS_VALID',
    passed: instructionIssues.length === 0,
    message: instructionIssues.length
      ? `${instructionIssues.length} instruction references are unresolved`
      : 'Structured instructions are valid'
  });
  blockingIssues.push(...instructionIssues);

  const materialIssues = knowledgeItems.flatMap((item) =>
    (item.materialRefs ?? [])
      .filter((material) => !String(material.id ?? '').trim() || !String(material.type ?? '').trim())
      .map(() => ({
        code: 'MATERIALS_VALID',
        objectId: item.id,
        message: 'Material reference requires both id and type'
      }))
  );
  checks.push({
    code: 'MATERIALS_VALID',
    passed: materialIssues.length === 0,
    message: materialIssues.length
      ? `${materialIssues.length} material references are incomplete`
      : 'Material references are valid'
  });
  blockingIssues.push(...materialIssues);

  const regression = evaluateRegression(content);
  const forceRegression =
    content.evaluationPolicy?.forceRegression !== false;
  checks.push({
    code: 'REGRESSION_TESTS',
    passed: regression.failed === 0,
    message: regression.total
      ? `${regression.passed}/${regression.total} deterministic regression samples passed`
      : 'No regression samples configured'
  });
  if (forceRegression) {
    blockingIssues.push(...regression.failures);
  }

  return {
    passed: blockingIssues.length === 0,
    checkedRevision: revision,
    checkedAt: now(),
    checks,
    blockingIssues,
    warnings: regression.total
      ? forceRegression
        ? []
        : regression.failures.map((failure) => failure.message)
      : ['No deterministic regression samples are configured']
  };
}

function asPublished(item) {
  return {
    ...item,
    status: 'published',
    ...(item.expandedQuestionDefinitions
      ? {
          expandedQuestionDefinitions:
            item.expandedQuestionDefinitions.map((question) => ({
              ...question,
              status: 'published'
            }))
        }
      : {})
  };
}

function mergePublished(baseItems = [], updatedItems = []) {
  const updatedIds = new Set(updatedItems.map((item) => item.id));
  return [
    ...baseItems.filter((item) => !updatedIds.has(item.id)),
    ...updatedItems.map(asPublished)
  ];
}

function compileReleaseSnapshot(content, changeSet, baseSnapshot) {
  const refs = new Set(changeSet.objectRefs ?? []);
  const publishAll = refs.size === 0;
  const draftKnowledge = content.knowledgeItems ?? [];
  const draftExpressions = content.expressions ?? [];
  const selectedExpressionIds = new Set(
    draftExpressions
      .filter((expression) => publishAll || refs.has(expression.id))
      .map((expression) => expression.id)
  );
  const selectedKnowledgeIds = new Set(
    draftKnowledge
      .filter(
        (item) =>
          publishAll ||
          refs.has(item.id) ||
          draftExpressions.some(
            (expression) =>
              selectedExpressionIds.has(expression.id) &&
              (expression.knowledgeItemIds ?? []).includes(item.id)
          )
      )
      .map((item) => item.id)
  );

  for (const expression of draftExpressions) {
    if (
      (expression.knowledgeItemIds ?? []).some((id) =>
        selectedKnowledgeIds.has(id)
      )
    ) {
      selectedExpressionIds.add(expression.id);
    }
  }

  const selectedKnowledge = draftKnowledge.filter((item) =>
    selectedKnowledgeIds.has(item.id)
  );
  const selectedExpressions = draftExpressions.filter((expression) =>
    selectedExpressionIds.has(expression.id)
  );
  const selectedLexiconIds = new Set([
    ...selectedKnowledge.flatMap((item) => item.lexiconIds ?? []),
    ...selectedKnowledge.flatMap((item) =>
      (item.slots ?? []).map((slot) => slot.lexiconId)
    ),
    ...selectedExpressions.flatMap((expression) => expression.lexiconIds ?? []),
    ...(content.lexicons ?? [])
      .filter((lexicon) => refs.has(lexicon.id))
      .map((lexicon) => lexicon.id)
  ]);
  const selectedActionIds = new Set([
    ...selectedKnowledge.flatMap((item) => item.actionIds ?? []),
    ...selectedKnowledge.flatMap((item) =>
      (item.answerVariants ?? []).flatMap((variant) => variant.actionIds ?? [])
    ),
    ...(content.actions ?? [])
      .filter((action) => refs.has(action.id))
      .map((action) => action.id)
  ]);
  const selectedTemplateIds = new Set([
    ...selectedKnowledge.flatMap((item) => item.conceptTemplateIds ?? []),
    ...(content.templates ?? [])
      .filter((template) => refs.has(template.id))
      .map((template) => template.id)
  ]);
  const selectedConceptIds = new Set([
    ...(content.templates ?? [])
      .filter((template) => selectedTemplateIds.has(template.id))
      .map((template) => template.conceptId),
    ...(content.concepts ?? [])
      .filter((concept) => refs.has(concept.id))
      .map((concept) => concept.id)
  ]);
  const base = baseSnapshot ?? {};
  const baseExpressions = (base.expressions ?? []).filter(
    (expression) =>
      !(expression.knowledgeItemIds ?? []).some((id) =>
        selectedKnowledgeIds.has(id)
      )
  );
  const modules = (content.modules ?? []).map((module) => ({
    ...module,
    knowledgePointIds: module.knowledgePointIds?.filter((id) =>
      new Set([
        ...(base.knowledgeItems ?? []).map((item) => item.id),
        ...selectedKnowledgeIds
      ]).has(id)
    )
  }));

  return {
    ...content,
    engineVersion: content.engineVersion ?? 'xiaoi-core-v1',
    knowledgeItems: mergePublished(
      base.knowledgeItems,
      selectedKnowledge
    ),
    expressions: mergePublished(baseExpressions, selectedExpressions),
    lexicons: mergePublished(
      base.lexicons,
      (content.lexicons ?? []).filter(
        (lexicon) => publishAll || selectedLexiconIds.has(lexicon.id)
      )
    ),
    actions: mergePublished(
      base.actions,
      (content.actions ?? []).filter(
        (action) => publishAll || selectedActionIds.has(action.id)
      )
    ),
    templates: mergePublished(
      base.templates,
      (content.templates ?? []).filter(
        (template) => publishAll || selectedTemplateIds.has(template.id)
      )
    ),
    concepts: mergePublished(
      base.concepts,
      (content.concepts ?? []).filter(
        (concept) => publishAll || selectedConceptIds.has(concept.id)
      )
    ),
    modules
  };
}

function createReleaseService({ databasePath = ':memory:' } = {}) {
  const database = openDatabase(databasePath);

  const getDraftRow = (workspaceId, projectId) => database.prepare(`
    SELECT * FROM workspace_drafts WHERE workspace_id = ? AND project_id = ?
  `).get(workspaceId, projectId);
  const getChangeSetRow = (id) => database.prepare(
    'SELECT * FROM change_sets WHERE id = ?'
  ).get(id);
  const getReleaseRow = (id) => database.prepare(
    'SELECT * FROM release_snapshots WHERE id = ?'
  ).get(id);

  function audit({ workspaceId, actorId, action, targetType, targetId, before, after }) {
    database.prepare(`
      INSERT INTO audit_events (
        id, workspace_id, actor_id, action, target_type, target_id,
        before_json, after_json, request_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      workspaceId,
      actorId || 'system',
      action,
      targetType,
      targetId,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      crypto.randomUUID(),
      now()
    );
  }

  function getDraft(workspaceId, projectId) {
    return mapDraft(getDraftRow(workspaceId, projectId));
  }

  function saveDraft({
    workspaceId,
    projectId,
    expectedRevision,
    content,
    actorId = 'unknown'
  }) {
    if (!workspaceId || !projectId || !content) {
      throw new RuntimeError('VALIDATION_FAILED', 'workspaceId, projectId and content are required');
    }
    return inTransaction(database, () => {
      const existing = mapDraft(getDraftRow(workspaceId, projectId));
      const currentRevision = existing?.revision ?? 0;
      if (expectedRevision !== currentRevision) {
        throw new RuntimeError(
          'VERSION_CONFLICT',
          'Draft was updated by another operation',
          409,
          { expectedRevision, currentRevision }
        );
      }
      const revision = currentRevision + 1;
      const contentJson = JSON.stringify(content);
      const timestamp = now();
      database.prepare(`
        INSERT INTO workspace_drafts (
          workspace_id, project_id, revision, content_json, content_checksum,
          updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, project_id) DO UPDATE SET
          revision = excluded.revision,
          content_json = excluded.content_json,
          content_checksum = excluded.content_checksum,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `).run(
        workspaceId,
        projectId,
        revision,
        contentJson,
        checksum(contentJson),
        actorId,
        timestamp
      );
      const saved = getDraft(workspaceId, projectId);
      audit({
        workspaceId,
        actorId,
        action: 'draft.saved',
        targetType: 'workspace_draft',
        targetId: `${workspaceId}:${projectId}`,
        before: existing,
        after: { revision: saved.revision, checksum: saved.checksum }
      });
      return saved;
    });
  }

  function createChangeSet({
    workspaceId,
    projectId,
    applicationId,
    title,
    businessReason = '',
    draftRevision,
    objectRefs = [],
    dependencyRefs = [],
    actorId = 'unknown'
  }) {
    const draft = getDraft(workspaceId, projectId);
    if (!draft || draft.revision !== draftRevision) {
      throw new RuntimeError('VERSION_CONFLICT', 'Change set must use the current draft revision', 409, {
        draftRevision,
        currentRevision: draft?.revision ?? 0
      });
    }
    const id = `cs_${crypto.randomUUID()}`;
    const timestamp = now();
    const binding = database.prepare(`
      SELECT active_release_id FROM application_bindings
      WHERE application_id = ? AND environment = 'production'
    `).get(applicationId);
    database.prepare(`
      INSERT INTO change_sets (
        id, workspace_id, project_id, application_id, title, business_reason,
        base_release_id, draft_revision, object_refs_json, dependency_refs_json,
        status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      id,
      workspaceId,
      projectId,
      applicationId,
      title || 'Untitled change set',
      businessReason,
      binding?.active_release_id ?? null,
      draftRevision,
      JSON.stringify(objectRefs),
      JSON.stringify(dependencyRefs),
      actorId,
      timestamp,
      timestamp
    );
    const created = mapChangeSet(getChangeSetRow(id));
    audit({
      workspaceId,
      actorId,
      action: 'change_set.created',
      targetType: 'change_set',
      targetId: id,
      after: created
    });
    return created;
  }

  function checkChangeSet(
    id,
    actorId = 'unknown',
    evaluationRunId = null
  ) {
    const changeSet = mapChangeSet(getChangeSetRow(id));
    if (!changeSet) throw new RuntimeError('NOT_FOUND', 'Change set not found', 404);
    const draft = getDraft(changeSet.workspaceId, changeSet.projectId);
    if (!draft || draft.revision !== changeSet.draftRevision) {
      throw new RuntimeError('VERSION_CONFLICT', 'Change set draft revision is no longer current', 409, {
        checkedRevision: changeSet.draftRevision,
        currentRevision: draft?.revision ?? 0
      });
    }
    const result = evaluateDraft(draft.content, draft.revision);
    if (draft.content.evaluationPolicy?.requireServerRun === true) {
      const run = evaluationRunId
        ? database.prepare(
            'SELECT * FROM evaluation_runs WHERE id = ?'
          ).get(evaluationRunId)
        : null;
      const requireFull =
        draft.content.evaluationPolicy.requireFullRun !== false;
      const eligible = Boolean(
        run &&
        run.workspace_id === changeSet.workspaceId &&
        run.project_id === changeSet.projectId &&
        run.target_type === 'workspace' &&
        run.target_revision === draft.revision &&
        run.status === 'passed' &&
        run.failed === 0 &&
        (!requireFull || run.mode === 'full')
      );
      result.checks.push({
        code: 'SERVER_EVALUATION',
        passed: eligible,
        message: eligible
          ? `${run.passed}/${run.total} server evaluation samples passed`
          : 'A passed server evaluation for the current draft revision is required'
      });
      if (!eligible) {
        result.blockingIssues.push({
          code: 'SERVER_EVALUATION',
          message:
            'Missing, failed, stale or ineligible server evaluation run'
        });
      }
      result.passed = result.blockingIssues.length === 0;
      result.evaluationRunId = eligible ? run.id : null;
    }
    database.prepare(`
      UPDATE change_sets SET gate_result_json = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(result), now(), id);
    audit({
      workspaceId: changeSet.workspaceId,
      actorId,
      action: 'change_set.checked',
      targetType: 'change_set',
      targetId: id,
      after: result
    });
    return result;
  }

  function approveChangeSet(id, actorId = 'unknown') {
    const changeSet = mapChangeSet(getChangeSetRow(id));
    if (!changeSet) throw new RuntimeError('NOT_FOUND', 'Change set not found', 404);
    if (!changeSet.gateResult?.passed) {
      throw new RuntimeError('GATE_BLOCKED', 'Release gates must pass before approval', 409);
    }
    const draft = getDraft(changeSet.workspaceId, changeSet.projectId);
    if (draft?.revision !== changeSet.gateResult.checkedRevision) {
      throw new RuntimeError('VERSION_CONFLICT', 'Gate result is stale', 409);
    }
    database.prepare(`
      UPDATE change_sets SET status = 'approved', updated_at = ? WHERE id = ?
    `).run(now(), id);
    const approved = mapChangeSet(getChangeSetRow(id));
    audit({
      workspaceId: approved.workspaceId,
      actorId,
      action: 'change_set.approved',
      targetType: 'change_set',
      targetId: id,
      before: changeSet,
      after: approved
    });
    return approved;
  }

  function publishChangeSet({
    changeSetId,
    applicationId,
    environment = 'production',
    actorId = 'unknown'
  }) {
    return inTransaction(database, () => {
      const changeSet = mapChangeSet(getChangeSetRow(changeSetId));
      if (!changeSet) throw new RuntimeError('NOT_FOUND', 'Change set not found', 404);
      if (changeSet.status !== 'approved') {
        throw new RuntimeError('INVALID_STATE_TRANSITION', 'Only approved change sets can be published', 409);
      }
      if (applicationId !== changeSet.applicationId) {
        throw new RuntimeError('VALIDATION_FAILED', 'Application does not match the change set');
      }
      const draft = getDraft(changeSet.workspaceId, changeSet.projectId);
      if (!draft || draft.revision !== changeSet.draftRevision) {
        throw new RuntimeError('RELEASE_BASE_CHANGED', 'Draft changed after the release check', 409);
      }
      if (!changeSet.gateResult?.passed ||
        changeSet.gateResult.checkedRevision !== draft.revision) {
        throw new RuntimeError('GATE_BLOCKED', 'Release gate result is missing or stale', 409);
      }
      const currentBinding = database.prepare(`
        SELECT * FROM application_bindings
        WHERE application_id = ? AND environment = ?
      `).get(applicationId, environment);
      if ((currentBinding?.active_release_id ?? null) !== changeSet.baseReleaseId) {
        throw new RuntimeError('RELEASE_BASE_CHANGED', 'The active release changed after this change set was created', 409);
      }

      const versionRow = database.prepare(`
        SELECT COALESCE(MAX(version), 0) AS version
        FROM release_snapshots WHERE workspace_id = ? AND project_id = ?
      `).get(changeSet.workspaceId, changeSet.projectId);
      const version = Number(versionRow.version) + 1;
      const id = `rel_${crypto.randomUUID()}`;
      const baseRelease = changeSet.baseReleaseId
        ? mapRelease(getReleaseRow(changeSet.baseReleaseId))
        : null;
      const releaseSnapshot = compileReleaseSnapshot(
        draft.content,
        changeSet,
        baseRelease?.snapshot
      );
      const snapshotJson = JSON.stringify(releaseSnapshot);
      const timestamp = now();
      database.prepare(`
        INSERT INTO release_snapshots (
          id, workspace_id, project_id, version, change_set_id, source_revision,
          snapshot_json, checksum, published_by, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        changeSet.workspaceId,
        changeSet.projectId,
        version,
        changeSet.id,
        draft.revision,
        snapshotJson,
        checksum(snapshotJson),
        actorId,
        timestamp
      );
      database.prepare(`
        INSERT INTO application_bindings (
          application_id, environment, workspace_id, project_id,
          active_release_id, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(application_id, environment) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          project_id = excluded.project_id,
          active_release_id = excluded.active_release_id,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `).run(
        applicationId,
        environment,
        changeSet.workspaceId,
        changeSet.projectId,
        id,
        actorId,
        timestamp
      );
      database.prepare(`
        UPDATE change_sets SET status = 'published', updated_at = ? WHERE id = ?
      `).run(timestamp, changeSet.id);
      const release = mapRelease(getReleaseRow(id));
      audit({
        workspaceId: changeSet.workspaceId,
        actorId,
        action: 'release.published',
        targetType: 'release',
        targetId: id,
        before: { activeReleaseId: currentBinding?.active_release_id ?? null },
        after: { activeReleaseId: id, version }
      });
      return release;
    });
  }

  function getActiveRelease(applicationId, environment = 'production') {
    const row = database.prepare(`
      SELECT release_snapshots.*
      FROM application_bindings
      JOIN release_snapshots
        ON release_snapshots.id = application_bindings.active_release_id
      WHERE application_bindings.application_id = ?
        AND application_bindings.environment = ?
    `).get(applicationId, environment);
    return mapRelease(row);
  }

  function listReleases(workspaceId, projectId) {
    return database.prepare(`
      SELECT * FROM release_snapshots
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY version DESC
    `).all(workspaceId, projectId).map(mapRelease);
  }

  function rollback({
    applicationId,
    environment = 'production',
    releaseId,
    actorId = 'unknown'
  }) {
    return inTransaction(database, () => {
      const target = mapRelease(getReleaseRow(releaseId));
      if (!target) throw new RuntimeError('RELEASE_NOT_FOUND', 'Release not found', 404);
      const binding = database.prepare(`
        SELECT * FROM application_bindings
        WHERE application_id = ? AND environment = ?
      `).get(applicationId, environment);
      if (!binding) {
        throw new RuntimeError(
          'APPLICATION_BINDING_NOT_FOUND',
          'Application binding not found',
          404
        );
      }
      if (binding.workspace_id !== target.workspaceId ||
        binding.project_id !== target.projectId) {
        throw new RuntimeError('VALIDATION_FAILED', 'Release belongs to another project');
      }
      const timestamp = now();
      database.prepare(`
        UPDATE application_bindings
        SET active_release_id = ?, updated_by = ?, updated_at = ?
        WHERE application_id = ? AND environment = ?
      `).run(releaseId, actorId, timestamp, applicationId, environment);
      audit({
        workspaceId: target.workspaceId,
        actorId,
        action: 'release.rolled_back',
        targetType: 'application_binding',
        targetId: `${applicationId}:${environment}`,
        before: { activeReleaseId: binding.active_release_id },
        after: { activeReleaseId: releaseId }
      });
      return {
        applicationId,
        environment,
        activeReleaseId: releaseId,
        releaseVersion: target.version,
        updatedAt: timestamp
      };
    });
  }

  return {
    approveChangeSet,
    checkChangeSet,
    close: () => database.close(),
    createChangeSet,
    getActiveRelease,
    getDraft,
    listReleases,
    publishChangeSet,
    rollback,
    saveDraft,
    unsafeUpdateReleaseForTest(id, snapshotJson) {
      database.prepare(
        'UPDATE release_snapshots SET snapshot_json = ? WHERE id = ?'
      ).run(snapshotJson, id);
    }
  };
}

module.exports = {
  RuntimeError,
  createReleaseService,
  evaluateDraft
};
