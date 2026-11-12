import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Spin } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { EvaluationCenter } from '../components/evaluation/EvaluationCenter';
import { PageHeader } from '../components/PageHeader';
import type {
  EvaluationDataset,
  PersistedEvaluationResult,
  PersistedEvaluationRun
} from '../domain/types';
import {
  listEvaluationDatasets,
  listEvaluationRuns
} from '../services/xiaoiRuntimeApi';
import { useWorkbench } from '../state/WorkbenchProvider';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '评测运行时请求失败';
}

export function QualityPage() {
  const { state, draftSync } = useWorkbench();
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [runs, setRuns] = useState<PersistedEvaluationRun[]>([]);
  const [resultsByRun, setResultsByRun] = useState<
    Record<string, PersistedEvaluationResult[]>
  >({});
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const { workspaceId, projectId } = state.context;
  const handleError = useCallback(
    (nextError: unknown) => setError(errorMessage(nextError)),
    []
  );

  const loadEvaluationData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextDatasets, nextRuns] = await Promise.all([
        listEvaluationDatasets(workspaceId, projectId),
        listEvaluationRuns(workspaceId, projectId)
      ]);
      setDatasets(nextDatasets);
      setRuns(nextRuns);
      setSelectedDatasetId((current) =>
        current && nextDatasets.some((item) => item.id === current)
          ? current
          : nextDatasets[0]?.id
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId]);

  useEffect(() => {
    void loadEvaluationData();
  }, [loadEvaluationData]);

  return (
    <div>
      <PageHeader
        title="评测与质检"
        description="以持久化评测集验证工作区草稿，逐条查看预期、实际结果和失败阶段。"
        actions={
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void loadEvaluationData()}
          >
            刷新
          </Button>
        }
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          message="评测运行时不可用"
          description={error}
          onClose={() => setError(undefined)}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {loading && !datasets.length && !runs.length ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 12 }}>正在读取服务端评测数据</div>
        </div>
      ) : (
        <EvaluationCenter
          datasets={datasets}
          runs={runs}
          resultsByRun={resultsByRun}
          selectedDatasetId={selectedDatasetId}
          workspaceId={workspaceId}
          projectId={projectId}
          draftRevision={draftSync.revision}
          knowledgePointIds={new Set(
            state.knowledgeItems.map((item) => item.id)
          )}
          onSelectedDatasetIdChange={setSelectedDatasetId}
          onDatasetsChange={setDatasets}
          onRunsChange={setRuns}
          onResultsChange={(runId, results) =>
            setResultsByRun((current) => ({
              ...current,
              [runId]: results
            }))
          }
          onError={handleError}
        />
      )}
    </div>
  );
}
