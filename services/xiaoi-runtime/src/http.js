const crypto = require('node:crypto');
const http = require('node:http');
const { createReleaseService, RuntimeError } = require('./release-service');
const { createEvaluationService } = require('./evaluation-service');
const { recognizeSnapshot } = require('./recognizer');

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new RuntimeError('PAYLOAD_TOO_LARGE', 'Request body is too large', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new RuntimeError('INVALID_JSON', 'Request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function send(response, statusCode, requestId, data = null, error = null) {
  const payload = JSON.stringify({
    data,
    meta: {
      request_id: requestId,
      version: 'v1'
    },
    error
  });
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-request-id': requestId
  });
  response.end(payload);
}

function createRuntimeServer({ databasePath = ':memory:' } = {}) {
  const releaseService = createReleaseService({ databasePath });
  const evaluationService = createEvaluationService({ databasePath });
  const server = http.createServer(async (request, response) => {
    const requestId = request.headers['x-request-id'] || crypto.randomUUID();
    const actorId = request.headers['x-actor-id'] || 'anonymous';
    const url = new URL(request.url, 'http://xiaoi-runtime');

    try {
      if (request.method === 'GET' && url.pathname === '/api/v1/health') {
        send(response, 200, requestId, {
          status: 'ok',
          database: 'ready',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/api/v1/evaluation-datasets'
      ) {
        const body = await readJson(request);
        const dataset = evaluationService.createDataset({
          workspaceId: body.workspace_id,
          projectId: body.project_id,
          name: body.name,
          description: body.description,
          tags: body.tags,
          actorId
        });
        send(response, 201, requestId, dataset);
        return;
      }
      if (
        request.method === 'GET' &&
        url.pathname === '/api/v1/evaluation-datasets'
      ) {
        const workspaceId = url.searchParams.get('workspace_id');
        const projectId = url.searchParams.get('project_id');
        if (!workspaceId || !projectId) {
          throw new RuntimeError(
            'VALIDATION_FAILED',
            'workspace_id and project_id are required'
          );
        }
        send(
          response,
          200,
          requestId,
          evaluationService.listDatasets(workspaceId, projectId)
        );
        return;
      }
      const datasetMatch = url.pathname.match(
        /^\/api\/v1\/evaluation-datasets\/([^/]+)$/
      );
      if (datasetMatch && request.method === 'GET') {
        const dataset = evaluationService.getDataset(
          decodeURIComponent(datasetMatch[1])
        );
        if (!dataset) {
          throw new RuntimeError(
            'NOT_FOUND',
            'Evaluation dataset not found',
            404
          );
        }
        send(response, 200, requestId, dataset);
        return;
      }
      if (datasetMatch && request.method === 'PUT') {
        const body = await readJson(request);
        send(
          response,
          200,
          requestId,
          evaluationService.updateDataset({
            datasetId: decodeURIComponent(datasetMatch[1]),
            expectedVersion: body.expected_version,
            name: body.name,
            description: body.description,
            tags: body.tags,
            status: body.status,
            actorId
          })
        );
        return;
      }
      const sampleMatch = url.pathname.match(
        /^\/api\/v1\/evaluation-datasets\/([^/]+)\/samples$/
      );
      if (sampleMatch && request.method === 'PUT') {
        const body = await readJson(request);
        send(
          response,
          200,
          requestId,
          evaluationService.replaceSamples({
            datasetId: decodeURIComponent(sampleMatch[1]),
            expectedVersion: body.expected_version,
            samples: Array.isArray(body.samples) ? body.samples : [],
            actorId
          })
        );
        return;
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/api/v1/evaluation-runs'
      ) {
        const body = await readJson(request);
        send(
          response,
          201,
          requestId,
          evaluationService.runEvaluation({
            datasetId: body.dataset_id,
            datasetVersion: body.dataset_version,
            mode: body.mode,
            targetType: body.target_type,
            workspaceId: body.workspace_id,
            projectId: body.project_id,
            targetRevision: body.target_revision,
            releaseId: body.release_id,
            actorId
          })
        );
        return;
      }
      if (
        request.method === 'GET' &&
        url.pathname === '/api/v1/evaluation-runs'
      ) {
        const workspaceId = url.searchParams.get('workspace_id');
        const projectId = url.searchParams.get('project_id');
        if (!workspaceId || !projectId) {
          throw new RuntimeError(
            'VALIDATION_FAILED',
            'workspace_id and project_id are required'
          );
        }
        send(
          response,
          200,
          requestId,
          evaluationService.listRuns(workspaceId, projectId)
        );
        return;
      }
      const runResultMatch = url.pathname.match(
        /^\/api\/v1\/evaluation-runs\/([^/]+)\/results$/
      );
      if (runResultMatch && request.method === 'GET') {
        send(
          response,
          200,
          requestId,
          evaluationService.listRunResults(
            decodeURIComponent(runResultMatch[1])
          )
        );
        return;
      }
      const resultTicketMatch = url.pathname.match(
        /^\/api\/v1\/evaluation-runs\/([^/]+)\/results\/([^/]+)\/ticket$/
      );
      if (resultTicketMatch && request.method === 'POST') {
        await readJson(request);
        const created = evaluationService.createTicket({
          runId: decodeURIComponent(resultTicketMatch[1]),
          sampleId: decodeURIComponent(resultTicketMatch[2]),
          actorId
        });
        send(
          response,
          created.created ? 201 : 200,
          requestId,
          created.ticket
        );
        return;
      }
      const runMatch = url.pathname.match(
        /^\/api\/v1\/evaluation-runs\/([^/]+)$/
      );
      if (runMatch && request.method === 'GET') {
        const run = evaluationService.getRun(
          decodeURIComponent(runMatch[1])
        );
        if (!run) {
          throw new RuntimeError(
            'NOT_FOUND',
            'Evaluation run not found',
            404
          );
        }
        send(response, 200, requestId, run);
        return;
      }
      if (
        request.method === 'GET' &&
        url.pathname === '/api/v1/feedback-tickets'
      ) {
        const workspaceId = url.searchParams.get('workspace_id');
        const projectId = url.searchParams.get('project_id');
        if (!workspaceId || !projectId) {
          throw new RuntimeError(
            'VALIDATION_FAILED',
            'workspace_id and project_id are required'
          );
        }
        send(
          response,
          200,
          requestId,
          evaluationService.listTickets(workspaceId, projectId)
        );
        return;
      }
      const verifyTicketMatch = url.pathname.match(
        /^\/api\/v1\/feedback-tickets\/([^/]+)\/verify$/
      );
      if (verifyTicketMatch && request.method === 'POST') {
        await readJson(request);
        send(
          response,
          200,
          requestId,
          evaluationService.verifyTicket(
            decodeURIComponent(verifyTicketMatch[1])
          )
        );
        return;
      }

      const draftMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/draft$/);
      if (draftMatch && request.method === 'GET') {
        const projectId = url.searchParams.get('project_id');
        if (!projectId) {
          throw new RuntimeError('VALIDATION_FAILED', 'project_id is required');
        }
        const draft = releaseService.getDraft(
          decodeURIComponent(draftMatch[1]),
          projectId
        );
        if (!draft) throw new RuntimeError('NOT_FOUND', 'Draft not found', 404);
        send(response, 200, requestId, draft);
        return;
      }
      if (draftMatch && request.method === 'PUT') {
        const body = await readJson(request);
        const draft = releaseService.saveDraft({
          workspaceId: decodeURIComponent(draftMatch[1]),
          projectId: body.project_id,
          expectedRevision: body.expected_revision,
          content: body.content,
          actorId
        });
        send(response, 200, requestId, draft);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/v1/change-sets') {
        const body = await readJson(request);
        const changeSet = releaseService.createChangeSet({
          workspaceId: body.workspace_id,
          projectId: body.project_id,
          applicationId: body.application_id,
          title: body.title,
          businessReason: body.business_reason,
          draftRevision: body.draft_revision,
          objectRefs: body.object_refs,
          dependencyRefs: body.dependency_refs,
          actorId
        });
        send(response, 201, requestId, changeSet);
        return;
      }

      const checkMatch = url.pathname.match(/^\/api\/v1\/change-sets\/([^/]+)\/check$/);
      if (checkMatch && request.method === 'POST') {
        const body = await readJson(request);
        send(
          response,
          200,
          requestId,
          releaseService.checkChangeSet(
            decodeURIComponent(checkMatch[1]),
            actorId,
            body.evaluation_run_id
          )
        );
        return;
      }

      const approveMatch = url.pathname.match(/^\/api\/v1\/change-sets\/([^/]+)\/approve$/);
      if (approveMatch && request.method === 'POST') {
        await readJson(request);
        send(
          response,
          200,
          requestId,
          releaseService.approveChangeSet(decodeURIComponent(approveMatch[1]), actorId)
        );
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/v1/releases') {
        const body = await readJson(request);
        const release = releaseService.publishChangeSet({
          changeSetId: body.change_set_id,
          applicationId: body.application_id,
          environment: body.environment,
          actorId
        });
        send(response, 201, requestId, release);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/releases') {
        const workspaceId = url.searchParams.get('workspace_id');
        const projectId = url.searchParams.get('project_id');
        if (!workspaceId || !projectId) {
          throw new RuntimeError(
            'VALIDATION_FAILED',
            'workspace_id and project_id are required'
          );
        }
        send(
          response,
          200,
          requestId,
          releaseService.listReleases(workspaceId, projectId)
        );
        return;
      }

      const rollbackMatch = url.pathname.match(
        /^\/api\/v1\/applications\/([^/]+)\/rollback$/
      );
      if (rollbackMatch && request.method === 'POST') {
        const body = await readJson(request);
        const result = releaseService.rollback({
          applicationId: decodeURIComponent(rollbackMatch[1]),
          environment: body.environment,
          releaseId: body.release_id,
          actorId
        });
        send(response, 200, requestId, result);
        return;
      }

      const statusMatch = url.pathname.match(
        /^\/api\/v1\/applications\/([^/]+)\/runtime-status$/
      );
      if (statusMatch && request.method === 'GET') {
        const environment = url.searchParams.get('environment') || 'production';
        const release = releaseService.getActiveRelease(
          decodeURIComponent(statusMatch[1]),
          environment
        );
        if (!release) {
          send(response, 200, requestId, {
            applicationId: decodeURIComponent(statusMatch[1]),
            environment,
            status: 'unpublished',
            releaseId: null,
            releaseVersion: null,
            checksum: null,
            publishedAt: null
          });
          return;
        }
        send(response, 200, requestId, {
          applicationId: decodeURIComponent(statusMatch[1]),
          environment,
          status: 'active',
          releaseId: release.id,
          releaseVersion: release.version,
          checksum: release.checksum,
          publishedAt: release.publishedAt
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/v1/runtime/recognize') {
        const body = await readJson(request);
        const release = releaseService.getActiveRelease(
          body.application_id,
          body.environment || 'production'
        );
        if (!release) {
          throw new RuntimeError(
            'APPLICATION_BINDING_NOT_FOUND',
            'Application has no active release',
            404
          );
        }
        const result = recognizeSnapshot(release, {
          query: body.query,
          channel: body.channel,
          category: body.category,
          dimensions: body.dimensions,
          context: body.context
        });
        send(response, 200, requestId, result);
        return;
      }

      throw new RuntimeError('NOT_FOUND', 'Route not found', 404);
    } catch (error) {
      const known = error instanceof RuntimeError;
      const statusCode = known ? error.statusCode : 500;
      send(response, statusCode, requestId, null, {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'Internal runtime error',
        details: known ? error.details : {}
      });
    }
  });

  return {
    address: () => server.address(),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        evaluationService.close();
        releaseService.close();
        if (error) reject(error);
        else resolve();
      });
    }),
    listen: (port, host) => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    }),
    releaseService,
    evaluationService
  };
}

module.exports = {
  createRuntimeServer,
  readJson
};
