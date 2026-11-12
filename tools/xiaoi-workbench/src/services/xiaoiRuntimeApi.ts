import type {
  ChangeSet,
  EvaluationDataset,
  PersistedEvaluationResult,
  PersistedEvaluationRun,
  PersistedEvaluationSample,
  WorkbenchState
} from '../domain/types';

const API_ROOT = '/api/xiaoi/runtime';

interface ApiEnvelope<T> {
  data: T | null;
  meta: {
    request_id: string;
    version: string;
  };
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  } | null;
}

export class XiaoiRuntimeApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'XiaoiRuntimeApiError';
  }
}

export interface RuntimeDraft {
  workspaceId: string;
  projectId: string;
  revision: number;
  checksum: string;
  content: WorkbenchState;
  updatedAt: string;
}

export interface RuntimeGateCheck {
  code: string;
  passed: boolean;
  message: string;
}

export interface RuntimeGateResult {
  passed: boolean;
  checkedRevision: number;
  evaluationRunId?: string;
  checkedAt?: string;
  checks: RuntimeGateCheck[];
  blockingIssues: Array<{
    code: string;
    objectId?: string;
    message: string;
  }>;
  warnings: string[];
}

export interface RuntimeChangeSet {
  id: string;
  status: 'draft' | 'approved' | 'published';
}

export interface RuntimeRelease {
  id: string;
  version: number;
  changeSetId?: string;
  checksum: string;
  publishedAt: string;
  publishedBy?: string;
}

export interface RuntimeApplicationReleaseStatus {
  applicationId: string;
  environment: string;
  status?: 'active';
  releaseId: string;
  releaseVersion: number;
  checksum: string;
  publishedAt: string;
}

export interface RuntimeApplicationUnpublishedStatus {
  applicationId: string;
  environment: string;
  status: 'unpublished';
  releaseId: null;
  releaseVersion: null;
  checksum: null;
  publishedAt: null;
}

export type RuntimeApplicationStatus =
  | RuntimeApplicationReleaseStatus
  | RuntimeApplicationUnpublishedStatus;

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers
    }
  });
  const envelope = await response.json() as ApiEnvelope<T>;
  if (!response.ok || envelope.error) {
    throw new XiaoiRuntimeApiError(
      envelope.error?.code ?? 'RUNTIME_REQUEST_FAILED',
      envelope.error?.message ?? '小 i 运行时请求失败',
      response.status,
      envelope.error?.details
    );
  }
  if (envelope.data === null) {
    throw new XiaoiRuntimeApiError(
      'EMPTY_RESPONSE',
      '小 i 运行时返回了空结果',
      response.status
    );
  }
  return envelope.data;
}

export function getRuntimeDraft(workspaceId: string, projectId: string) {
  return request<RuntimeDraft>(
    `/workspaces/${encodeURIComponent(workspaceId)}/draft?project_id=${encodeURIComponent(projectId)}`
  );
}

export function saveRuntimeDraft(state: WorkbenchState, expectedRevision: number) {
  return request<RuntimeDraft>(
    `/workspaces/${encodeURIComponent(state.context.workspaceId)}/draft`,
    {
      method: 'PUT',
      body: JSON.stringify({
        project_id: state.context.projectId,
        expected_revision: expectedRevision,
        content: state
      })
    }
  );
}

export function createRuntimeChangeSet(
  state: WorkbenchState,
  changeSet: ChangeSet,
  draftRevision: number,
  applicationId: string
) {
  return request<RuntimeChangeSet>('/change-sets', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: state.context.workspaceId,
      project_id: state.context.projectId,
      application_id: applicationId,
      title: changeSet.title,
      business_reason: changeSet.businessReason,
      draft_revision: draftRevision,
      object_refs: changeSet.objectRefs
    })
  });
}

export function checkRuntimeChangeSet(
  changeSetId: string,
  evaluationRunId?: string
) {
  return request<RuntimeGateResult>(
    `/change-sets/${encodeURIComponent(changeSetId)}/check`,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(evaluationRunId
          ? { evaluation_run_id: evaluationRunId }
          : {})
      })
    }
  );
}

export function approveRuntimeChangeSet(changeSetId: string) {
  return request<RuntimeChangeSet>(
    `/change-sets/${encodeURIComponent(changeSetId)}/approve`,
    { method: 'POST', body: '{}' }
  );
}

export function publishRuntimeChangeSet(
  changeSetId: string,
  applicationId: string,
  environment: string
) {
  return request<RuntimeRelease>('/releases', {
    method: 'POST',
    body: JSON.stringify({
      change_set_id: changeSetId,
      application_id: applicationId,
      environment
    })
  });
}

export function listRuntimeReleases(workspaceId: string, projectId: string) {
  return request<RuntimeRelease[]>(
    `/releases?workspace_id=${encodeURIComponent(workspaceId)}&project_id=${encodeURIComponent(projectId)}`
  );
}

export function getRuntimeApplicationStatus(
  applicationId: string,
  environment: string
) {
  return request<RuntimeApplicationStatus>(
    `/applications/${encodeURIComponent(applicationId)}/runtime-status?environment=${encodeURIComponent(environment)}`
  );
}

export function rollbackRuntimeRelease(
  applicationId: string,
  environment: string,
  releaseId: string
) {
  return request<{
    activeReleaseId: string;
    releaseVersion: number;
  }>(
    `/applications/${encodeURIComponent(applicationId)}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({
        environment,
        release_id: releaseId
      })
    }
  );
}

export interface CreateEvaluationDatasetInput {
  workspaceId: string;
  projectId: string;
  name: string;
  description?: string;
  tags?: string[];
}

export interface CreateEvaluationRunInput {
  datasetId: string;
  datasetVersion: number;
  mode: 'incremental' | 'full';
  targetType: 'workspace' | 'release';
  workspaceId: string;
  projectId: string;
  targetRevision?: number;
  releaseId?: string;
}

export function listEvaluationDatasets(
  workspaceId: string,
  projectId: string
) {
  return request<EvaluationDataset[]>(
    `/evaluation-datasets?workspace_id=${encodeURIComponent(workspaceId)}&project_id=${encodeURIComponent(projectId)}`
  );
}

export function getEvaluationDataset(datasetId: string) {
  return request<EvaluationDataset>(
    `/evaluation-datasets/${encodeURIComponent(datasetId)}`
  );
}

export function createEvaluationDataset(
  input: CreateEvaluationDatasetInput
) {
  return request<EvaluationDataset>('/evaluation-datasets', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      name: input.name,
      description: input.description ?? '',
      tags: input.tags ?? []
    })
  });
}

export function updateEvaluationDataset(
  datasetId: string,
  expectedVersion: number,
  patch: Partial<Pick<
    EvaluationDataset,
    'name' | 'description' | 'tags' | 'status'
  >>
) {
  return request<EvaluationDataset>(
    `/evaluation-datasets/${encodeURIComponent(datasetId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        expected_version: expectedVersion,
        ...patch
      })
    }
  );
}

export function replaceEvaluationSamples(
  datasetId: string,
  expectedVersion: number,
  samples: PersistedEvaluationSample[]
) {
  return request<EvaluationDataset>(
    `/evaluation-datasets/${encodeURIComponent(datasetId)}/samples`,
    {
      method: 'PUT',
      body: JSON.stringify({
        expected_version: expectedVersion,
        samples
      })
    }
  );
}

export function listEvaluationRuns(
  workspaceId: string,
  projectId: string
) {
  return request<PersistedEvaluationRun[]>(
    `/evaluation-runs?workspace_id=${encodeURIComponent(workspaceId)}&project_id=${encodeURIComponent(projectId)}`
  );
}

export function createEvaluationRun(input: CreateEvaluationRunInput) {
  return request<PersistedEvaluationRun>('/evaluation-runs', {
    method: 'POST',
    body: JSON.stringify({
      dataset_id: input.datasetId,
      dataset_version: input.datasetVersion,
      mode: input.mode,
      target_type: input.targetType,
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      ...(input.targetRevision === undefined
        ? {}
        : { target_revision: input.targetRevision }),
      ...(input.releaseId ? { release_id: input.releaseId } : {})
    })
  });
}

export function listEvaluationRunResults(runId: string) {
  return request<PersistedEvaluationResult[]>(
    `/evaluation-runs/${encodeURIComponent(runId)}/results`
  );
}

export interface RuntimeFeedbackTicket {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  sampleId: string;
  query: string;
  findingType: 'miss' | 'wrong_hit' | 'answer_error' | 'rule_conflict';
  relatedObjectIds: string[];
  failedStage?: string;
  status: 'open' | 'fixing' | 'verifying' | 'resolved' | 'closed';
  assignee: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export function createEvaluationFeedbackTicket(
  runId: string,
  sampleId: string
) {
  return request<RuntimeFeedbackTicket>(
    `/evaluation-runs/${encodeURIComponent(runId)}/results/${encodeURIComponent(sampleId)}/ticket`,
    { method: 'POST', body: '{}' }
  );
}

export function listRuntimeFeedbackTickets(
  workspaceId: string,
  projectId: string
) {
  return request<RuntimeFeedbackTicket[]>(
    `/feedback-tickets?workspace_id=${encodeURIComponent(workspaceId)}&project_id=${encodeURIComponent(projectId)}`
  );
}

export function verifyRuntimeFeedbackTicket(ticketId: string) {
  return request<{
    ticket: RuntimeFeedbackTicket;
    verification: {
      passed: boolean;
      failedStage: string | null;
      failureReasons: string[];
      actual: Record<string, unknown>;
    };
  }>(
    `/feedback-tickets/${encodeURIComponent(ticketId)}/verify`,
    { method: 'POST', body: '{}' }
  );
}
