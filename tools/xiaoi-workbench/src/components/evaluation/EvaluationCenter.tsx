import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
  Typography
} from 'antd';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  exportEvaluationSamples,
  parseEvaluationSamples
} from '../../domain/evaluationCsv';
import {
  classifyEvaluationSample,
  disabledSampleReason
} from '../../domain/evaluationSampleClassification';
import type {
  EvaluationDataset,
  PersistedEvaluationResult,
  PersistedEvaluationRun,
  PersistedEvaluationSample
} from '../../domain/types';
import {
  createEvaluationDataset,
  createEvaluationFeedbackTicket,
  createEvaluationRun,
  listEvaluationRunResults,
  listRuntimeFeedbackTickets,
  replaceEvaluationSamples,
  verifyRuntimeFeedbackTicket,
  type RuntimeFeedbackTicket
} from '../../services/xiaoiRuntimeApi';

interface EvaluationCenterProps {
  datasets: EvaluationDataset[];
  runs: PersistedEvaluationRun[];
  resultsByRun: Record<string, PersistedEvaluationResult[]>;
  selectedDatasetId?: string;
  workspaceId: string;
  projectId: string;
  draftRevision: number | null;
  knowledgePointIds: Set<string>;
  onSelectedDatasetIdChange: (datasetId: string) => void;
  onDatasetsChange: (datasets: EvaluationDataset[]) => void;
  onRunsChange: (runs: PersistedEvaluationRun[]) => void;
  onResultsChange: (
    runId: string,
    results: PersistedEvaluationResult[]
  ) => void;
  onError: (error: unknown) => void;
}

interface DatasetFormValue {
  name: string;
  description?: string;
}

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function readFileText(file: File) {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('CSV 文件读取失败'));
    reader.readAsText(file, 'UTF-8');
  });
}

function targetLabel(run: PersistedEvaluationRun) {
  if (run.targetType === 'workspace') {
    return `工作区草稿 r${run.targetRevision ?? '-'}`;
  }
  return `线上发布 ${run.releaseVersion ?? run.releaseId ?? '-'}`;
}

function statusTag(status: PersistedEvaluationRun['status']) {
  const labels = {
    queued: '排队中',
    running: '运行中',
    passed: '通过',
    failed: '失败'
  };
  const colors = {
    queued: 'default',
    running: 'processing',
    passed: 'success',
    failed: 'error'
  } as const;
  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

function ResultDetails({
  results,
  renderActions
}: {
  results: PersistedEvaluationResult[];
  renderActions?: (result: PersistedEvaluationResult) => ReactNode;
}) {
  if (!results.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无逐条结果" />;
  }
  return (
    <List
      dataSource={results}
      renderItem={(result) => (
        <List.Item>
          <Card
            size="small"
            style={{ width: '100%' }}
            title={
              <Space wrap>
                <Tag color={result.passed ? 'green' : 'red'}>
                  {result.passed ? '通过' : '失败'}
                </Tag>
                <span>{result.query}</span>
              </Space>
            }
            extra={renderActions?.(result)}
          >
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="失败阶段">
                {result.failedStage ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {result.durationMs} ms
              </Descriptions.Item>
              <Descriptions.Item label="失败原因" span={2}>
                {result.failureReasons.length
                  ? result.failureReasons.join('；')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="预期结果">
                <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
                  {formatJson(result.expected)}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="实际结果">
                <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
                  {formatJson(result.actual)}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </List.Item>
      )}
    />
  );
}

export function EvaluationCenter({
  datasets,
  runs,
  resultsByRun,
  selectedDatasetId,
  workspaceId,
  projectId,
  draftRevision,
  knowledgePointIds,
  onSelectedDatasetIdChange,
  onDatasetsChange,
  onRunsChange,
  onResultsChange,
  onError
}: EvaluationCenterProps) {
  const [activeTab, setActiveTab] = useState('datasets');
  const [createOpen, setCreateOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runMode, setRunMode] =
    useState<PersistedEvaluationRun['mode']>('full');
  const [expandedRunId, setExpandedRunId] = useState<string>();
  const [resultLoadingId, setResultLoadingId] = useState<string>();
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    samples: PersistedEvaluationSample[];
    errors: string[];
  }>();
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [tickets, setTickets] = useState<RuntimeFeedbackTicket[]>([]);
  const [ticketBusyKey, setTicketBusyKey] = useState<string>();
  const [form] = Form.useForm<DatasetFormValue>();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedDataset = useMemo(
    () => datasets.find((item) => item.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );
  const failedResults = useMemo(
    () => Object.values(resultsByRun).flat().filter((result) => !result.passed),
    [resultsByRun]
  );
  const sampleCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sample of selectedDataset?.samples ?? []) {
      const category = classifyEvaluationSample(sample);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [selectedDataset]);

  useEffect(() => {
    let cancelled = false;
    void listRuntimeFeedbackTickets(workspaceId, projectId)
      .then((items) => {
        if (!cancelled) setTickets(items);
      })
      .catch(onError);
    return () => {
      cancelled = true;
    };
  }, [onError, projectId, workspaceId]);

  const handleCreateTicket = async (result: PersistedEvaluationResult) => {
    const key = `${result.runId}:${result.sampleId}`;
    setTicketBusyKey(key);
    try {
      const ticket = await createEvaluationFeedbackTicket(
        result.runId,
        result.sampleId
      );
      setTickets((current) => [
        ticket,
        ...current.filter((item) => item.id !== ticket.id)
      ]);
    } catch (ticketError) {
      onError(ticketError);
    } finally {
      setTicketBusyKey(undefined);
    }
  };

  const handleVerifyTicket = async (ticket: RuntimeFeedbackTicket) => {
    setTicketBusyKey(ticket.id);
    try {
      const verified = await verifyRuntimeFeedbackTicket(ticket.id);
      setTickets((current) =>
        current.map((item) =>
          item.id === verified.ticket.id ? verified.ticket : item
        )
      );
    } catch (ticketError) {
      onError(ticketError);
    } finally {
      setTicketBusyKey(undefined);
    }
  };

  const handleCreateDataset = async () => {
    try {
      const value = await form.validateFields();
      setCreateSubmitting(true);
      const created = await createEvaluationDataset({
        workspaceId,
        projectId,
        name: value.name.trim(),
        description: value.description?.trim() ?? '',
        tags: []
      });
      onDatasetsChange([created, ...datasets]);
      onSelectedDatasetIdChange(created.id);
      setCreateOpen(false);
      form.resetFields();
    } catch (createError) {
      if (
        createError &&
        typeof createError === 'object' &&
        'errorFields' in createError
      ) {
        return;
      }
      onError(createError);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleRun = async () => {
    if (!selectedDataset || draftRevision === null) return;
    setRunSubmitting(true);
    try {
      const created = await createEvaluationRun({
        datasetId: selectedDataset.id,
        datasetVersion: selectedDataset.version,
        mode: runMode,
        targetType: 'workspace',
        workspaceId,
        projectId,
        targetRevision: draftRevision
      });
      onRunsChange([created, ...runs.filter((item) => item.id !== created.id)]);
      setRunOpen(false);
      setActiveTab('runs');
      setExpandedRunId(created.id);
      setResultLoadingId(created.id);
      const results = await listEvaluationRunResults(created.id);
      onResultsChange(created.id, results);
    } catch (runError) {
      onError(runError);
    } finally {
      setRunSubmitting(false);
      setResultLoadingId(undefined);
    }
  };

  const handleViewResults = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(undefined);
      return;
    }
    setExpandedRunId(runId);
    if (resultsByRun[runId]) return;
    setResultLoadingId(runId);
    try {
      onResultsChange(runId, await listEvaluationRunResults(runId));
    } catch (resultError) {
      onError(resultError);
    } finally {
      setResultLoadingId(undefined);
    }
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key !== 'failures') return;
    const unloadedFailedRuns = runs.filter(
      (item) => item.failed > 0 && !resultsByRun[item.id]
    );
    if (!unloadedFailedRuns.length) return;
    setResultLoadingId('failures');
    void Promise.all(
      unloadedFailedRuns.map(async (item) => {
        const results = await listEvaluationRunResults(item.id);
        onResultsChange(item.id, results);
      })
    )
      .catch(onError)
      .finally(() => setResultLoadingId(undefined));
  };

  const handleCsvFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseEvaluationSamples(
        await readFileText(file),
        knowledgePointIds
      );
      setImportPreview({
        fileName: file.name,
        samples: parsed.samples,
        errors: parsed.errors
      });
    } catch (readError) {
      onError(readError);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (
      !selectedDataset ||
      !importPreview?.samples.length ||
      importPreview.errors.length
    ) {
      return;
    }
    setImportSubmitting(true);
    try {
      const updated = await replaceEvaluationSamples(
        selectedDataset.id,
        selectedDataset.version,
        importPreview.samples
      );
      onDatasetsChange(
        datasets.map((item) => item.id === updated.id ? updated : item)
      );
      setImportPreview(undefined);
    } catch (importError) {
      onError(importError);
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleExport = () => {
    if (!selectedDataset) return;
    const blob = new Blob(
      [`\uFEFF${exportEvaluationSamples(selectedDataset.samples)}`],
      { type: 'text/csv;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedDataset.name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const datasetPane = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {datasets.length ? (
        <List
          grid={{ gutter: 16, column: 2 }}
          dataSource={datasets}
          renderItem={(item) => (
            <List.Item>
              <Card
                hoverable
                onClick={() => onSelectedDatasetIdChange(item.id)}
                style={{
                  borderColor: item.id === selectedDatasetId
                    ? '#1677ff'
                    : undefined
                }}
                title={
                  <Space wrap>
                    <span>{item.name}</span>
                    <Tag>{item.status}</Tag>
                  </Space>
                }
              >
                <p>{item.description || '暂无说明'}</p>
                <Space wrap>
                  <span>版本 v{item.version}</span>
                  <span>样例 {item.samples.length}</span>
                  {item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </Space>
              </Card>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="服务端暂无评测集" />
      )}
    </Space>
  );

  const samplePane = selectedDataset ? (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <strong>{selectedDataset.name}</strong>
            <Tag>v{selectedDataset.version}</Tag>
            <Button onClick={() => inputRef.current?.click()}>导入 CSV</Button>
            <Button onClick={handleExport}>导出 CSV</Button>
          </Space>
          <Space wrap>
            {sampleCategoryCounts.map(([category, count]) => (
              <Tag key={category} color="blue">{category} {count}</Tag>
            ))}
            <Tag color="orange">
              暂停 {selectedDataset.samples.filter((sample) => sample.enabled === false).length}
            </Tag>
          </Space>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="导入评测样例"
            style={{ display: 'none' }}
            onChange={(event) =>
              void handleCsvFile(event.target.files?.[0])
            }
          />
        </Space>
      </Card>
      {importPreview ? (
        <Alert
          type={importPreview.errors.length ? 'error' : 'success'}
          showIcon
          message={
            importPreview.errors.length
              ? `预检失败：${importPreview.errors.length} 个问题`
              : `预检通过：${importPreview.samples.length} 条样例`
          }
          description={
            importPreview.errors.length
              ? importPreview.errors.join('；')
              : `${importPreview.fileName} 将覆盖当前数据集全部样例，确认后才会写入服务端。`
          }
          action={
            <Space>
              <Button size="small" onClick={() => setImportPreview(undefined)}>
                取消
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={Boolean(importPreview.errors.length)}
                loading={importSubmitting}
                onClick={() => void handleConfirmImport()}
              >
                确认写入
              </Button>
            </Space>
          }
        />
      ) : null}
      <Table
        rowKey="id"
        size="small"
        dataSource={selectedDataset.samples}
        locale={{ emptyText: '当前数据集暂无样例' }}
        columns={[
          { title: 'Query', dataIndex: 'query' },
          {
            title: '样例类型',
            key: 'sampleCategory',
            render: (_: unknown, sample: PersistedEvaluationSample) => (
              <Tag>{classifyEvaluationSample(sample)}</Tag>
            )
          },
          {
            title: '预期决策',
            dataIndex: 'expectedDecision',
            render: (value: string) => <Tag>{value}</Tag>
          },
          {
            title: '预期知识点',
            dataIndex: 'expectedKnowledgePointId',
            render: (value?: string) => value ?? '-'
          },
          {
            title: '来源',
            dataIndex: 'source'
          },
          {
            title: '状态',
            dataIndex: 'enabled',
            render: (enabled: boolean, sample: PersistedEvaluationSample) =>
              enabled ? <Tag color="green">启用</Tag> : (
                <Space direction="vertical" size={0}>
                  <Tag color="orange">暂停</Tag>
                  <span>{disabledSampleReason(sample)}</span>
                </Space>
              )
          }
        ]}
      />
    </Space>
  ) : (
    <Empty description="请先创建或选择评测集" />
  );

  const runPane = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap>
          <span>
            当前数据集：
            <strong>{selectedDataset?.name ?? '未选择'}</strong>
          </span>
          <span>
            运行目标：
            <strong>
              {draftRevision === null
                ? '工作区草稿尚未同步'
                : `工作区草稿 r${draftRevision}`}
            </strong>
          </span>
        </Space>
      </Card>
      {runs.length ? (
        <List
          dataSource={runs}
          renderItem={(item) => (
            <List.Item>
              <Card
                size="small"
                style={{ width: '100%' }}
                title={
                  <Space wrap>
                    {statusTag(item.status)}
                    <span>{targetLabel(item)}</span>
                    <Tag>{item.mode === 'full' ? '全量' : '增量'}</Tag>
                  </Space>
                }
                extra={
                  <Button
                    loading={resultLoadingId === item.id}
                    onClick={() => void handleViewResults(item.id)}
                  >
                    {expandedRunId === item.id ? '收起结果' : '查看结果'}
                  </Button>
                }
              >
                <Space wrap>
                  <span>通过 / 总数：{item.passed} / {item.total}</span>
                  <span>失败：{item.failed}</span>
                  <span>数据集版本：v{item.datasetVersion}</span>
                </Space>
                {expandedRunId === item.id ? (
                  <div style={{ marginTop: 16 }}>
                    <ResultDetails results={resultsByRun[item.id] ?? []} />
                  </div>
                ) : null}
              </Card>
            </List.Item>
          )}
        />
      ) : (
        <Empty description="服务端暂无运行记录" />
      )}
    </Space>
  );

  const failurePane = (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="失败样例闭环"
        description="失败结果可创建真实工单；修复草稿后可重新验证，验证通过后工单自动解决。"
      />
      {failedResults.length ? (
        <ResultDetails
          results={failedResults}
          renderActions={(result) => {
            const ticket = tickets.find(
              (item) =>
                item.runId === result.runId &&
                item.sampleId === result.sampleId
            );
            if (!ticket) {
              const key = `${result.runId}:${result.sampleId}`;
              return (
                <Button
                  loading={ticketBusyKey === key}
                  onClick={() => void handleCreateTicket(result)}
                >
                  创建修复工单
                </Button>
              );
            }
            return (
              <Space>
                <Tag color={ticket.status === 'resolved' ? 'green' : 'blue'}>
                  工单：{ticket.status}
                </Tag>
                {ticket.status !== 'resolved' && ticket.status !== 'closed' ? (
                  <Button
                    loading={ticketBusyKey === ticket.id}
                    onClick={() => void handleVerifyTicket(ticket)}
                  >
                    重新验证
                  </Button>
                ) : null}
              </Space>
            );
          }}
        />
      ) : (
        <Empty description="请先在运行记录中加载失败结果" />
      )}
    </Space>
  );

  return (
    <>
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8
          }}
        >
          <Typography.Text type="secondary">
            当前数据集：{selectedDataset?.name ?? '未选择'}
          </Typography.Text>
          <Space>
            <Button onClick={() => setCreateOpen(true)}>新建数据集</Button>
            <Button
              type="primary"
              disabled={!selectedDataset || draftRevision === null}
              onClick={() => setRunOpen(true)}
            >
              运行评测
            </Button>
          </Space>
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            { key: 'datasets', label: '评测集', children: datasetPane },
            { key: 'samples', label: '样例', children: samplePane },
            { key: 'runs', label: '运行记录', children: runPane },
            { key: 'failures', label: '失败与工单', children: failurePane }
          ]}
        />
      </Card>

      <Modal
        title="新建评测集"
        open={createOpen}
        okText="确认创建"
        cancelText="取消"
        confirmLoading={createSubmitting}
        onOk={() => void handleCreateDataset()}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="数据集名称"
            rules={[{ required: true, whitespace: true, message: '请输入数据集名称' }]}
          >
            <Input aria-label="数据集名称" maxLength={80} />
          </Form.Item>
          <Form.Item name="description" label="数据集说明">
            <Input.TextArea aria-label="数据集说明" rows={3} maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="运行工作区评测"
        open={runOpen}
        okText="开始运行"
        cancelText="取消"
        confirmLoading={runSubmitting}
        okButtonProps={{
          disabled: !selectedDataset || draftRevision === null
        }}
        onOk={() => void handleRun()}
        onCancel={() => setRunOpen(false)}
      >
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="数据集">
            {selectedDataset?.name ?? '-'} v{selectedDataset?.version ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="运行目标">
            {draftRevision === null
              ? '工作区草稿尚未同步'
              : `工作区草稿 r${draftRevision}`}
          </Descriptions.Item>
          <Descriptions.Item label="运行范围">
            <Radio.Group
              value={runMode}
              onChange={(event) => setRunMode(event.target.value)}
            >
              <Radio value="full">全量</Radio>
              <Radio value="incremental">增量</Radio>
            </Radio.Group>
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    </>
  );
}
