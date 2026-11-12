import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Drawer, List, Select, Space, Steps, Table, Tag, Timeline, message } from 'antd';
import { useEffect, useState } from 'react';
import { evaluateReleaseGates, type ReleaseGateResult } from '../domain/releaseGates';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { useWorkbench } from '../state/WorkbenchProvider';
import {
  approveRuntimeChangeSet,
  checkRuntimeChangeSet,
  createRuntimeChangeSet,
  getRuntimeDraft,
  listEvaluationRuns,
  listRuntimeReleases,
  publishRuntimeChangeSet,
  rollbackRuntimeRelease,
  saveRuntimeDraft,
  XiaoiRuntimeApiError,
  type RuntimeGateResult,
  type RuntimeRelease
} from '../services/xiaoiRuntimeApi';
import type { PersistedEvaluationRun } from '../domain/types';

export function GovernancePage() {
  const {
    state,
    draftSync,
    runtimeStatus,
    refreshRuntimeStatus
  } = useWorkbench();
  const [messageApi, contextHolder] = message.useMessage();
  const [selectedId, setSelectedId] = useState(state.changeSets[0]?.id);
  const [legacyResult, setLegacyResult] = useState<ReleaseGateResult | null>(null);
  const [runtimeGate, setRuntimeGate] = useState<RuntimeGateResult | null>(null);
  const [runtimeChangeSetId, setRuntimeChangeSetId] = useState<string>();
  const [approved, setApproved] = useState(false);
  const [releases, setReleases] = useState<RuntimeRelease[]>([]);
  const [publishedChangeSetId, setPublishedChangeSetId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<'check' | 'approve' | 'publish' | 'rollback'>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [evaluationRuns, setEvaluationRuns] = useState<PersistedEvaluationRun[]>([]);
  const [selectedEvaluationRunId, setSelectedEvaluationRunId] = useState<string>();
  const selected = state.changeSets.find((changeSet) => changeSet.id === selectedId);
  const applicationId = `${state.context.projectId}-assistant`;

  // 加载发布历史
  const loadReleases = async () => {
    setReleasesLoading(true);
    try {
      const history = await listRuntimeReleases(
        state.context.workspaceId,
        state.context.projectId
      );
      setReleases(history);
    } catch {
      // 离线模式 — 服务不可用时静默处理
    } finally {
      setReleasesLoading(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listEvaluationRuns(
      state.context.workspaceId,
      state.context.projectId
    ).then((runs) => {
      if (cancelled) return;
      setEvaluationRuns(runs);
      const eligible = runs.find((run) =>
        run.status === 'passed' &&
        run.targetType === 'workspace' &&
        run.targetRevision === draftSync.revision &&
        (!state.evaluationPolicy?.requireFullRun || run.mode === 'full')
      );
      setSelectedEvaluationRunId(eligible?.id);
    }).catch(() => {
      if (!cancelled) setEvaluationRuns([]);
    });
    return () => {
      cancelled = true;
    };
  }, [
    draftSync.revision,
    state.context.projectId,
    state.context.workspaceId,
    state.evaluationPolicy?.requireFullRun
  ]);

  const resetRuntimeState = () => {
    setLegacyResult(null);
    setRuntimeGate(null);
    setRuntimeChangeSetId(undefined);
    setApproved(false);
    setError(undefined);
    setNotice(undefined);
    setPublishedChangeSetId(undefined);
  };

  const executeCheck = async () => {
    if (!selected) return;
    resetRuntimeState();
    setBusy('check');
    try {
      let draft;
      try {
        draft = await getRuntimeDraft(
          state.context.workspaceId,
          state.context.projectId
        );
      } catch (requestError) {
        if (!(requestError instanceof XiaoiRuntimeApiError) || requestError.status !== 404) {
          throw requestError;
        }
        draft = await saveRuntimeDraft(state, 0);
      }
      const remoteChangeSet = await createRuntimeChangeSet(
        state,
        selected,
        draft.revision,
        applicationId
      );
      const gate = await checkRuntimeChangeSet(
        remoteChangeSet.id,
        selectedEvaluationRunId
      );
      setRuntimeChangeSetId(remoteChangeSet.id);
      setRuntimeGate(gate);
      if (!gate.passed) setError('服务端门禁发现阻断问题，请处理后重新检查。');
    } catch (requestError) {
      // Offline fallback keeps editing usable, but can never enable publishing.
      setLegacyResult(evaluateReleaseGates(selected.gates));
      setError(
        requestError instanceof Error
          ? `运行时服务不可用，当前仅展示本地预检查：${requestError.message}`
          : '运行时服务不可用，当前仅展示本地预检查。'
      );
    } finally {
      setBusy(undefined);
    }
  };

  const approve = async () => {
    if (!runtimeChangeSetId) return;
    setBusy('approve');
    setError(undefined);
    try {
      await approveRuntimeChangeSet(runtimeChangeSetId);
      setApproved(true);
      setNotice('变更已批准，可以发布到生产环境。');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '审批失败');
    } finally {
      setBusy(undefined);
    }
  };

  const publish = async () => {
    if (!runtimeChangeSetId) return;
    setBusy('publish');
    setError(undefined);
    try {
      const release = await publishRuntimeChangeSet(
        runtimeChangeSetId,
        applicationId,
        state.context.environment
      );
      const history = await listRuntimeReleases(
        state.context.workspaceId,
        state.context.projectId
      );
      setReleases(history);
      setPublishedChangeSetId(runtimeChangeSetId);
      await refreshRuntimeStatus();
      setNotice(`线上版本 v${release.version}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '发布失败');
    } finally {
      setBusy(undefined);
    }
  };

  const rollback = async (release: RuntimeRelease) => {
    setBusy('rollback');
    setError(undefined);
    try {
      const result = await rollbackRuntimeRelease(
        applicationId,
        state.context.environment,
        release.id
      );
      await refreshRuntimeStatus();
      setNotice(`已切换到 v${result.releaseVersion}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '回滚失败');
    } finally {
      setBusy(undefined);
    }
  };

  // 步骤索引：0=编辑, 1=校验, 2=审核, 3=回归, 4=发布
  const stepIndex =
    publishedChangeSetId &&
    publishedChangeSetId === runtimeChangeSetId
      ? 4
      : approved
        ? 3
        : runtimeGate?.passed
          ? 2
          : runtimeGate
            ? 1
            : 0;
  const activeVersion =
    runtimeStatus.status === 'active'
      ? runtimeStatus.release?.releaseVersion
      : undefined;

  return (
    <div>
      {contextHolder}
      <PageHeader
        title="治理与发布"
        description="以变更集聚合修改，通过审核、回归和引用校验后发布"
        actions={
          <Space>
            {activeVersion ? <Tag color="green">线上版本 v{activeVersion}</Tag> : null}
            <Button icon={<ReloadOutlined />} loading={releasesLoading} onClick={loadReleases}>刷新状态</Button>
            <Button type="primary" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>发布记录</Button>
          </Space>
        }
      />
      <div className="governance-grid">
        <Card title="变更集" size="small">
          <List
            dataSource={state.changeSets}
            renderItem={(changeSet) => (
              <List.Item
                className={changeSet.id === selectedId ? 'action-item active' : 'action-item'}
                onClick={() => {
                  setSelectedId(changeSet.id);
                  resetRuntimeState();
                }}
              >
                <List.Item.Meta
                  title={changeSet.title}
                  description={`${changeSet.objectRefs.length} 个对象 · ${changeSet.owner}`}
                />
                <StatusTag status={changeSet.status} />
              </List.Item>
            )}
          />
        </Card>
        <section>
          {selected ? (
            <>
              <Card
                size="small"
                title="发布门禁"
                extra={<Space>
                  <Button
                    aria-label="执行发布检查"
                    loading={busy === 'check'}
                    onClick={executeCheck}
                  >
                    执行发布检查
                  </Button>
                  {runtimeGate?.passed && !approved ? (
                    <Button
                      aria-label="批准变更"
                      loading={busy === 'approve'}
                      onClick={approve}
                    >
                      批准变更
                    </Button>
                  ) : null}
                  {approved ? (
                    <Button
                      type="primary"
                      aria-label="发布到生产"
                      loading={busy === 'publish'}
                      onClick={publish}
                    >
                      发布到生产
                    </Button>
                  ) : null}
                </Space>}
              >
                <Descriptions
                  className="section-card"
                  bordered
                  column={2}
                  size="small"
                >
                  <Descriptions.Item label="当前草稿 revision">
                    {draftSync.revision ?? '尚未同步'}
                  </Descriptions.Item>
                  <Descriptions.Item label="服务端评测证据">
                    <Select
                      aria-label="服务端评测证据"
                      allowClear
                      placeholder={
                        state.evaluationPolicy?.requireServerRun
                          ? '请选择当前 revision 的成功评测'
                          : '可选：绑定成功评测'
                      }
                      value={selectedEvaluationRunId}
                      onChange={setSelectedEvaluationRunId}
                      style={{ minWidth: 280 }}
                      options={evaluationRuns.map((run) => ({
                        value: run.id,
                        disabled:
                          run.status !== 'passed' ||
                          run.targetType !== 'workspace' ||
                          run.targetRevision !== draftSync.revision ||
                          Boolean(
                            state.evaluationPolicy?.requireFullRun &&
                            run.mode !== 'full'
                          ),
                        label:
                          `${run.mode === 'full' ? '全量' : '增量'} · ` +
                          `revision ${run.targetRevision ?? '-'} · ` +
                          `${run.passed}/${run.total} 通过`
                      }))}
                    />
                  </Descriptions.Item>
                </Descriptions>
                <Steps
                  size="small"
                  current={stepIndex}
                  items={[
                    { title: '编辑' },
                    { title: '校验' },
                    { title: '审核' },
                    { title: '回归' },
                    { title: '发布' }
                  ]}
                />
                {runtimeGate ? (
                  <List
                    className="section-card"
                    bordered
                    dataSource={runtimeGate.checks}
                    renderItem={(check) => (
                      <List.Item>
                        <Space>
                          {check.passed
                            ? <CheckCircleOutlined className="success-icon" />
                            : <CloseCircleOutlined className="error-icon" />}
                          <span>{check.message}</span>
                        </Space>
                        <Tag color={check.passed ? 'green' : 'red'}>
                          {check.passed ? '通过' : '阻断'}
                        </Tag>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Descriptions className="section-card" bordered column={2} size="small">
                    <Descriptions.Item label="检查来源">等待服务端检查</Descriptions.Item>
                    <Descriptions.Item label="发布环境">{state.context.environment}</Descriptions.Item>
                  </Descriptions>
                )}
              </Card>
              {runtimeGate ? (
                <Alert
                  className="section-card"
                  type={runtimeGate.passed ? 'success' : 'error'}
                  showIcon
                  message={runtimeGate.passed ? '服务端发布门禁通过' : '服务端发布门禁阻断'}
                  description={runtimeGate.blockingIssues.map((issue) => issue.message).join('；')}
                />
              ) : null}
              {legacyResult ? (
                <Alert
                  className="section-card"
                  type={legacyResult.blocked ? 'error' : 'warning'}
                  showIcon
                  message={legacyResult.blocked ? '发布已阻断' : '仅完成本地预检查'}
                  description={
                    <List
                      size="small"
                      dataSource={legacyResult.reasons}
                      renderItem={(reason) => <List.Item>{reason}</List.Item>}
                    />
                  }
                />
              ) : null}
              {error ? <Alert className="section-card" type="warning" showIcon message={error} /> : null}
              {notice ? <Alert className="section-card" type="success" showIcon message={notice} /> : null}
              {releases.length ? (
                <Card className="section-card" size="small" title="不可变发布快照">
                  <List
                    dataSource={releases}
                    renderItem={(release) => (
                      <List.Item
                        actions={[
                          <Button
                            key={release.id}
                            aria-label={`回滚到 v${release.version}`}
                            loading={busy === 'rollback'}
                            onClick={() => rollback(release)}
                          >
                            回滚到 v{release.version}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={`v${release.version}`}
                          description={release.publishedAt}
                        />
                        <Tag>{release.checksum}</Tag>
                      </List.Item>
                    )}
                  />
                </Card>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      <Drawer
        title="发布记录"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={600}
      >
        <Table
          rowKey="id"
          dataSource={releases}
          pagination={false}
          size="small"
          columns={[
            { title: '版本', dataIndex: 'version', render: (v: number) => <Tag color="blue">v{v}</Tag> },
            { title: '校验和', dataIndex: 'checksum', render: (c: string) => <code>{c.slice(0, 8)}</code> },
            { title: '发布时间', dataIndex: 'publishedAt' },
            {
              title: '操作',
              key: 'actions',
              render: (_: unknown, record: RuntimeRelease) => (
                <Button
                  size="small"
                  loading={busy === 'rollback'}
                  disabled={record.id === runtimeStatus.release?.releaseId}
                  onClick={() => {
                    rollback(record);
                    setHistoryOpen(false);
                  }}
                >
                  {record.id === runtimeStatus.release?.releaseId ? '当前版本' : '回滚'}
                </Button>
              ),
            },
          ]}
        />
        <Timeline style={{ marginTop: 24 }}
          items={releases.map((r) => ({
            color: r.id === runtimeStatus.release?.releaseId ? 'green' : 'gray',
            children: (
              <div>
                <strong>v{r.version}</strong>
                <span style={{ marginLeft: 12, color: '#888' }}>{r.publishedAt}</span>
                {r.id === runtimeStatus.release?.releaseId ? <Tag color="green" style={{ marginLeft: 8 }}>当前</Tag> : null}
              </div>
            ),
          }))}
        />
      </Drawer>
    </div>
  );
}
