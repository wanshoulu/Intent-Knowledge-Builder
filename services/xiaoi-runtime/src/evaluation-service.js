'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { inTransaction, openDatabase } = require('./database');
const { RuntimeError } = require('./release-service');
const {
  evaluateRecognitionExpectation,
  recognizeKnowledge
} = require('../../../packages/xiaoi-core');

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  return value ? JSON.parse(value) : fallback;
}

function mapDatasetRow(row, samples = []) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    tags: parseJson(row.tags_json, []),
    status: row.status,
    version: row.version,
    samples,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

function mapRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    datasetId: row.dataset_id,
    datasetVersion: row.dataset_version,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    mode: row.mode,
    targetType: row.target_type,
    targetRevision: row.target_revision,
    releaseId: row.release_id,
    releaseVersion: row.release_version,
    status: row.status,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdBy: row.created_by
  };
}

function mapResultRow(row) {
  return {
    runId: row.run_id,
    sampleId: row.sample_id,
    query: row.query,
    passed: Boolean(row.passed),
    failedStage: row.failed_stage,
    failureReasons: parseJson(row.failure_reasons_json, []),
    expected: parseJson(row.expected_json, {}),
    actual: parseJson(row.actual_json, {}),
    trace: parseJson(row.trace_json, {}),
    durationMs: row.duration_ms
  };
}

function mapTicketRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    runId: row.run_id,
    sampleId: row.sample_id,
    query: row.query,
    findingType: row.finding_type,
    relatedObjectIds: parseJson(row.related_object_ids_json, []),
    failedStage: row.failed_stage,
    status: row.status,
    assignee: row.assignee,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateSample(sample) {
  const decisions = new Set([
    'matched',
    'clarification',
    'suggested',
    'ambiguous',
    'rejected'
  ]);
  if (!sample.id || !sample.query?.trim()) {
    throw new RuntimeError(
      'VALIDATION_FAILED',
      'Evaluation sample id and query are required'
    );
  }
  if (!decisions.has(sample.expectedDecision)) {
    throw new RuntimeError(
      'VALIDATION_FAILED',
      `Invalid expected decision ${sample.expectedDecision}`
    );
  }
  if (
    sample.expectedDecision === 'matched' &&
    !sample.expectedKnowledgePointId
  ) {
    throw new RuntimeError(
      'VALIDATION_FAILED',
      'Matched samples require expectedKnowledgePointId'
    );
  }
}

function createEvaluationService({ databasePath = ':memory:' } = {}) {
  const database = openDatabase(databasePath);

  function getSamples(datasetId) {
    return database.prepare(`
      SELECT sample_json FROM evaluation_samples
      WHERE dataset_id = ?
      ORDER BY sort_order ASC
    `).all(datasetId).map((row) => parseJson(row.sample_json, {}));
  }

  function getDataset(datasetId) {
    const row = database.prepare(
      'SELECT * FROM evaluation_datasets WHERE id = ?'
    ).get(datasetId);
    return mapDatasetRow(row, row ? getSamples(datasetId) : []);
  }

  function listDatasets(workspaceId, projectId) {
    return database.prepare(`
      SELECT * FROM evaluation_datasets
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY updated_at DESC, id ASC
    `).all(workspaceId, projectId).map((row) =>
      mapDatasetRow(row, getSamples(row.id))
    );
  }

  function createDataset({
    workspaceId,
    projectId,
    name,
    description = '',
    tags = [],
    actorId = 'unknown'
  }) {
    if (!workspaceId || !projectId || !name?.trim()) {
      throw new RuntimeError(
        'VALIDATION_FAILED',
        'workspaceId, projectId and name are required'
      );
    }
    const id = `eval_ds_${crypto.randomUUID()}`;
    const timestamp = now();
    database.prepare(`
      INSERT INTO evaluation_datasets (
        id, workspace_id, project_id, name, description, tags_json,
        status, version, created_by, created_at, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      projectId,
      name.trim(),
      description,
      JSON.stringify(tags),
      actorId,
      timestamp,
      actorId,
      timestamp
    );
    return getDataset(id);
  }

  function replaceSamples({
    datasetId,
    expectedVersion,
    samples,
    actorId = 'unknown'
  }) {
    return inTransaction(database, () => {
      const dataset = getDataset(datasetId);
      if (!dataset) {
        throw new RuntimeError(
          'NOT_FOUND',
          'Evaluation dataset not found',
          404
        );
      }
      if (dataset.version !== expectedVersion) {
        throw new RuntimeError(
          'VERSION_CONFLICT',
          'Evaluation dataset version is stale',
          409,
          {
            expectedVersion,
            currentVersion: dataset.version
          }
        );
      }
      const normalized = samples.map((sample) => ({
        ...sample,
        query: sample.query.trim(),
        enabled: sample.enabled !== false,
        expectedSlotValues: sample.expectedSlotValues ?? {},
        expectedActionIds: sample.expectedActionIds ?? [],
        source: sample.source ?? 'manual',
        relatedObjectIds: sample.relatedObjectIds ?? []
      }));
      normalized.forEach(validateSample);
      database.prepare(
        'DELETE FROM evaluation_samples WHERE dataset_id = ?'
      ).run(datasetId);
      const insert = database.prepare(`
        INSERT INTO evaluation_samples (
          id, dataset_id, sort_order, sample_json
        ) VALUES (?, ?, ?, ?)
      `);
      normalized.forEach((sample, index) => {
        insert.run(sample.id, datasetId, index, JSON.stringify(sample));
      });
      database.prepare(`
        UPDATE evaluation_datasets
        SET version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(actorId, now(), datasetId);
      return getDataset(datasetId);
    });
  }

  function updateDataset({
    datasetId,
    expectedVersion,
    name,
    description,
    tags,
    status,
    actorId = 'unknown'
  }) {
    const allowedStatuses = new Set(['draft', 'active', 'archived']);
    return inTransaction(database, () => {
      const dataset = getDataset(datasetId);
      if (!dataset) {
        throw new RuntimeError(
          'NOT_FOUND',
          'Evaluation dataset not found',
          404
        );
      }
      if (dataset.version !== expectedVersion) {
        throw new RuntimeError(
          'VERSION_CONFLICT',
          'Evaluation dataset version is stale',
          409,
          {
            expectedVersion,
            currentVersion: dataset.version
          }
        );
      }
      const nextStatus = status ?? dataset.status;
      if (!allowedStatuses.has(nextStatus)) {
        throw new RuntimeError(
          'VALIDATION_FAILED',
          `Invalid evaluation dataset status ${nextStatus}`
        );
      }
      const nextName = name?.trim() || dataset.name;
      database.prepare(`
        UPDATE evaluation_datasets
        SET name = ?, description = ?, tags_json = ?, status = ?,
            version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        nextName,
        description ?? dataset.description,
        JSON.stringify(tags ?? dataset.tags),
        nextStatus,
        actorId,
        now(),
        datasetId
      );
      return getDataset(datasetId);
    });
  }

  function resolveTarget({
    targetType,
    workspaceId,
    projectId,
    targetRevision,
    releaseId
  }) {
    if (targetType === 'workspace') {
      const row = database.prepare(`
        SELECT * FROM workspace_drafts
        WHERE workspace_id = ? AND project_id = ?
      `).get(workspaceId, projectId);
      const currentRevision = row?.revision ?? 0;
      if (!row || currentRevision !== targetRevision) {
        throw new RuntimeError(
          'VERSION_CONFLICT',
          'Evaluation must use the current workspace revision',
          409,
          { targetRevision, currentRevision }
        );
      }
      return {
        snapshot: parseJson(row.content_json, {}),
        scope: 'workspace',
        targetRevision: row.revision,
        releaseId: null,
        releaseVersion: null
      };
    }
    if (targetType !== 'release') {
      throw new RuntimeError(
        'VALIDATION_FAILED',
        `Invalid evaluation target type ${targetType}`
      );
    }
    const row = database.prepare(`
      SELECT * FROM release_snapshots
      WHERE id = ? AND workspace_id = ? AND project_id = ?
    `).get(releaseId, workspaceId, projectId);
    if (!row) {
      throw new RuntimeError(
        'RELEASE_NOT_FOUND',
        'Evaluation release not found',
        404
      );
    }
    return {
      snapshot: parseJson(row.snapshot_json, {}),
      scope: 'published',
      targetRevision: row.source_revision,
      releaseId: row.id,
      releaseVersion: row.version
    };
  }

  function runEvaluation({
    datasetId,
    datasetVersion,
    mode,
    targetType,
    workspaceId,
    projectId,
    targetRevision,
    releaseId,
    actorId = 'unknown'
  }) {
    const dataset = getDataset(datasetId);
    if (!dataset) {
      throw new RuntimeError(
        'NOT_FOUND',
        'Evaluation dataset not found',
        404
      );
    }
    if (
      dataset.workspaceId !== workspaceId ||
      dataset.projectId !== projectId
    ) {
      throw new RuntimeError(
        'VALIDATION_FAILED',
        'Evaluation dataset belongs to another project'
      );
    }
    if (dataset.version !== datasetVersion) {
      throw new RuntimeError(
        'VERSION_CONFLICT',
        'Evaluation dataset version is stale',
        409,
        {
          expectedVersion: datasetVersion,
          currentVersion: dataset.version
        }
      );
    }
    if (!['incremental', 'full'].includes(mode)) {
      throw new RuntimeError(
        'VALIDATION_FAILED',
        `Invalid evaluation mode ${mode}`
      );
    }
    const samples = dataset.samples.filter((sample) => sample.enabled !== false);
    if (!samples.length) {
      throw new RuntimeError(
        'EMPTY_EVALUATION_DATASET',
        'Evaluation dataset has no enabled samples',
        409
      );
    }
    const target = resolveTarget({
      targetType,
      workspaceId,
      projectId,
      targetRevision,
      releaseId
    });
    const runId = `eval_run_${crypto.randomUUID()}`;
    const startedAt = now();
    const results = samples.map((sample) => {
      const started = performance.now();
      const recognition = recognizeKnowledge(target.snapshot, {
        query: sample.query,
        channel: sample.channel,
        category: sample.category,
        dimensions: sample.dimensions,
        context: sample.context,
        scope: target.scope
      });
      const expected = {
        expectedDecision: sample.expectedDecision,
        expectedKnowledgePointId: sample.expectedKnowledgePointId,
        expectedAnswerContains: sample.expectedAnswerContains,
        expectedSlotValues: sample.expectedSlotValues,
        expectedActionIds: sample.expectedActionIds,
        relatedObjectIds: sample.relatedObjectIds ?? [],
        input: {
          channel: sample.channel,
          category: sample.category,
          dimensions: sample.dimensions,
          context: sample.context
        }
      };
      const comparison = evaluateRecognitionExpectation(
        expected,
        recognition
      );
      return {
        runId,
        sampleId: sample.id,
        query: sample.query,
        passed: comparison.passed,
        failedStage: comparison.failedStage,
        failureReasons: comparison.failureReasons,
        expected,
        actual: {
          decision: recognition.decision,
          knowledgePointId: recognition.knowledgePointId,
          answer: recognition.answer,
          extractedSlots: recognition.extractedSlots,
          missingSlots: recognition.missingSlots,
          actionIds: recognition.actionIds,
          actionInvocations: recognition.actionInvocations,
          score: recognition.score
        },
        trace: recognition.trace,
        durationMs: performance.now() - started
      };
    });
    const passed = results.filter((result) => result.passed).length;
    const completedAt = now();
    inTransaction(database, () => {
      database.prepare(`
        INSERT INTO evaluation_runs (
          id, dataset_id, dataset_version, workspace_id, project_id,
          mode, target_type, target_revision, release_id, release_version,
          status, total, passed, failed, started_at, completed_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        dataset.id,
        dataset.version,
        workspaceId,
        projectId,
        mode,
        targetType,
        target.targetRevision,
        target.releaseId,
        target.releaseVersion,
        passed === results.length ? 'passed' : 'failed',
        results.length,
        passed,
        results.length - passed,
        startedAt,
        completedAt,
        actorId
      );
      const insert = database.prepare(`
        INSERT INTO evaluation_results (
          run_id, sample_id, query, passed, failed_stage,
          failure_reasons_json, expected_json, actual_json, trace_json,
          duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      results.forEach((result) => {
        insert.run(
          runId,
          result.sampleId,
          result.query,
          result.passed ? 1 : 0,
          result.failedStage,
          JSON.stringify(result.failureReasons),
          JSON.stringify(result.expected),
          JSON.stringify(result.actual),
          JSON.stringify(result.trace),
          result.durationMs
        );
      });
    });
    return getRun(runId);
  }

  function getRun(runId) {
    return mapRunRow(
      database.prepare('SELECT * FROM evaluation_runs WHERE id = ?').get(runId)
    );
  }

  function listRunResults(runId) {
    if (!getRun(runId)) {
      throw new RuntimeError('NOT_FOUND', 'Evaluation run not found', 404);
    }
    return database.prepare(`
      SELECT * FROM evaluation_results
      WHERE run_id = ?
      ORDER BY sample_id ASC
    `).all(runId).map(mapResultRow);
  }

  function listRuns(workspaceId, projectId) {
    return database.prepare(`
      SELECT * FROM evaluation_runs
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY started_at DESC, id ASC
    `).all(workspaceId, projectId).map(mapRunRow);
  }

  function getResult(runId, sampleId) {
    const row = database.prepare(`
      SELECT * FROM evaluation_results
      WHERE run_id = ? AND sample_id = ?
    `).get(runId, sampleId);
    return row ? mapResultRow(row) : null;
  }

  function createTicket({
    runId,
    sampleId,
    actorId = 'unknown'
  }) {
    const run = getRun(runId);
    const result = getResult(runId, sampleId);
    if (!run || !result) {
      throw new RuntimeError(
        'NOT_FOUND',
        'Evaluation result not found',
        404
      );
    }
    if (result.passed) {
      throw new RuntimeError(
        'VALIDATION_FAILED',
        'A passing result cannot create a feedback ticket'
      );
    }
    const existing = database.prepare(`
      SELECT * FROM feedback_tickets
      WHERE run_id = ? AND sample_id = ?
        AND status NOT IN ('resolved', 'closed')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(runId, sampleId);
    if (existing) {
      return { ticket: mapTicketRow(existing), created: false };
    }
    const id = `ticket_${crypto.randomUUID()}`;
    const timestamp = now();
    const findingType =
      result.failedStage === 'answer'
        ? 'answer_error'
        : result.failedStage === 'expression'
          ? 'rule_conflict'
          : 'miss';
    database.prepare(`
      INSERT INTO feedback_tickets (
        id, workspace_id, project_id, run_id, sample_id, query,
        finding_type, related_object_ids_json, failed_stage, status,
        assignee, source, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', '', ?, ?, ?, ?)
    `).run(
      id,
      run.workspaceId,
      run.projectId,
      runId,
      sampleId,
      result.query,
      findingType,
      JSON.stringify(result.expected.relatedObjectIds ?? []),
      result.failedStage,
      `evaluation:${runId}`,
      actorId,
      timestamp,
      timestamp
    );
    return {
      ticket: mapTicketRow(
        database.prepare(
          'SELECT * FROM feedback_tickets WHERE id = ?'
        ).get(id)
      ),
      created: true
    };
  }

  function listTickets(workspaceId, projectId) {
    return database.prepare(`
      SELECT * FROM feedback_tickets
      WHERE workspace_id = ? AND project_id = ?
      ORDER BY created_at DESC
    `).all(workspaceId, projectId).map(mapTicketRow);
  }

  function verifyTicket(ticketId) {
    const row = database.prepare(
      'SELECT * FROM feedback_tickets WHERE id = ?'
    ).get(ticketId);
    const ticket = mapTicketRow(row);
    if (!ticket) {
      throw new RuntimeError('NOT_FOUND', 'Feedback ticket not found', 404);
    }
    const run = getRun(ticket.runId);
    const original = getResult(ticket.runId, ticket.sampleId);
    let snapshot;
    let scope;
    if (run.targetType === 'workspace') {
      const draft = database.prepare(`
        SELECT content_json FROM workspace_drafts
        WHERE workspace_id = ? AND project_id = ?
      `).get(run.workspaceId, run.projectId);
      if (!draft) {
        throw new RuntimeError('NOT_FOUND', 'Workspace draft not found', 404);
      }
      snapshot = parseJson(draft.content_json, {});
      scope = 'workspace';
    } else {
      const release = database.prepare(`
        SELECT snapshot_json FROM release_snapshots WHERE id = ?
      `).get(run.releaseId);
      if (!release) {
        throw new RuntimeError(
          'RELEASE_NOT_FOUND',
          'Evaluation release not found',
          404
        );
      }
      snapshot = parseJson(release.snapshot_json, {});
      scope = 'published';
    }
    const input = original.expected.input ?? {};
    const recognition = recognizeKnowledge(snapshot, {
      query: original.query,
      channel: input.channel,
      category: input.category,
      dimensions: input.dimensions,
      context: input.context,
      scope
    });
    const verification = evaluateRecognitionExpectation(
      original.expected,
      recognition
    );
    const status = verification.passed ? 'resolved' : 'fixing';
    database.prepare(`
      UPDATE feedback_tickets
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, now(), ticketId);
    return {
      ticket: mapTicketRow(
        database.prepare(
          'SELECT * FROM feedback_tickets WHERE id = ?'
        ).get(ticketId)
      ),
      verification: {
        ...verification,
        actual: {
          decision: recognition.decision,
          knowledgePointId: recognition.knowledgePointId,
          answer: recognition.answer,
          extractedSlots: recognition.extractedSlots,
          actionIds: recognition.actionIds
        }
      }
    };
  }

  return {
    close: () => database.close(),
    createTicket,
    createDataset,
    getDataset,
    getRun,
    listDatasets,
    listRuns,
    listRunResults,
    listTickets,
    replaceSamples,
    runEvaluation,
    updateDataset,
    verifyTicket
  };
}

module.exports = {
  createEvaluationService
};
