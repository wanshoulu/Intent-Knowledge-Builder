import { vi } from 'vitest';
import {
  createEvaluationDataset,
  createEvaluationFeedbackTicket,
  createEvaluationRun,
  listEvaluationDatasets,
  listEvaluationRunResults,
  listRuntimeFeedbackTickets,
  replaceEvaluationSamples,
  verifyRuntimeFeedbackTicket
} from '../src/services/xiaoiRuntimeApi';

function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      data,
      meta: { request_id: 'req-eval', version: 'v1' },
      error: null
    })
  } as Response;
}

describe('evaluation runtime API client', () => {
  it('uses persisted dataset and run endpoints with exact payloads', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      calls.push({ url: String(input), init });
      return response(
        String(input).endsWith('/evaluation-runs')
          ? { id: 'run-1', status: 'passed' }
          : []
      );
    }));

    await listEvaluationDatasets('retail-finance', 'mobile-banking');
    await createEvaluationDataset({
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      name: '核心回归',
      description: '核心样例',
      tags: ['核心']
    });
    await replaceEvaluationSamples('dataset-1', 2, []);
    await createEvaluationRun({
      datasetId: 'dataset-1',
      datasetVersion: 3,
      mode: 'full',
      targetType: 'workspace',
      workspaceId: 'retail-finance',
      projectId: 'mobile-banking',
      targetRevision: 8
    });
    await listEvaluationRunResults('run-1');
    await createEvaluationFeedbackTicket('run-1', 'sample-1');
    await listRuntimeFeedbackTickets('retail-finance', 'mobile-banking');
    await verifyRuntimeFeedbackTicket('ticket-1');

    expect(calls.map((call) => call.url)).toEqual([
      '/api/xiaoi/runtime/evaluation-datasets?workspace_id=retail-finance&project_id=mobile-banking',
      '/api/xiaoi/runtime/evaluation-datasets',
      '/api/xiaoi/runtime/evaluation-datasets/dataset-1/samples',
      '/api/xiaoi/runtime/evaluation-runs',
      '/api/xiaoi/runtime/evaluation-runs/run-1/results',
      '/api/xiaoi/runtime/evaluation-runs/run-1/results/sample-1/ticket',
      '/api/xiaoi/runtime/feedback-tickets?workspace_id=retail-finance&project_id=mobile-banking',
      '/api/xiaoi/runtime/feedback-tickets/ticket-1/verify'
    ]);
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({
      dataset_id: 'dataset-1',
      dataset_version: 3,
      mode: 'full',
      target_type: 'workspace',
      workspace_id: 'retail-finance',
      project_id: 'mobile-banking',
      target_revision: 8
    });
  });
});
