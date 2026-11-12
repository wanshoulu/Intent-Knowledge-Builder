import {
  DeleteOutlined,
  ExperimentOutlined,
  PlusOutlined
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Switch
} from 'antd';
import { useState } from 'react';
import type { ExpressionTestCase } from '../domain/expressionBusiness';
import type { KnowledgeItem } from '../domain/types';

interface TestRunSummary {
  passed: number;
  failed: number;
  blocking: string[];
  warnings: string[];
}

interface ExpressionTestCaseEditorProps {
  testCases: ExpressionTestCase[];
  knowledgeItems: KnowledgeItem[];
  onChange: (testCases: ExpressionTestCase[]) => void;
  onRunAll: () => TestRunSummary;
}

const expectationOptions = [
  { value: 'match', label: '这句话应命中本规则' },
  { value: 'not_match', label: '这句话不应命中本规则' },
  { value: 'exclude', label: '这句话应触发排除' },
  { value: 'target', label: '整链路应命中指定知识目标' }
];

export function ExpressionTestCaseEditor({
  testCases,
  knowledgeItems,
  onChange,
  onRunAll
}: ExpressionTestCaseEditorProps) {
  const [summary, setSummary] = useState<TestRunSummary>();
  const update = (id: string, patch: Partial<ExpressionTestCase>) => {
    onChange(
      testCases.map((testCase) =>
        testCase.id === id ? { ...testCase, ...patch } : testCase
      )
    );
    setSummary(undefined);
  };

  return (
    <section className="expression-test-cases">
      <div className="structured-list-header">
        <div>
          <h3>规则样例</h3>
          <p>用真实问法说明规则应该命中什么、不应该命中什么。</p>
        </div>
        <Space wrap>
          <Button
            aria-label="运行当前规则的全部样例"
            icon={<ExperimentOutlined />}
            disabled={!testCases.some((testCase) => testCase.enabled)}
            onClick={() => setSummary(onRunAll())}
          >
            运行当前规则的全部样例
          </Button>
          <Button
            aria-label="新增规则样例"
            icon={<PlusOutlined />}
            onClick={() =>
              onChange([
                ...testCases,
                {
                  id: `case-${Date.now().toString(36)}`,
                  query: '',
                  expectation: 'match',
                  enabled: true,
                  source: 'manual'
                }
              ])
            }
          >
            新增样例
          </Button>
        </Space>
      </div>
      {testCases.length ? (
        <div className="expression-test-case-list">
          {testCases.map((testCase, index) => (
            <Card
              key={testCase.id}
              size="small"
              title={`样例 ${index + 1}`}
              extra={
                <Space>
                  <Switch
                    aria-label={`启用样例 ${index + 1}`}
                    checked={testCase.enabled}
                    onChange={(enabled) => update(testCase.id, { enabled })}
                  />
                  <Button
                    type="text"
                    danger
                    aria-label={`删除样例 ${index + 1}`}
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      onChange(
                        testCases.filter(
                          (candidate) => candidate.id !== testCase.id
                        )
                      )
                    }
                  />
                </Space>
              }
            >
              <div className="test-case-grid">
                <Input
                  aria-label={`样例问法 ${index + 1}`}
                  value={testCase.query}
                  placeholder="例如：查一下信用卡还款日期"
                  onChange={(event) =>
                    update(testCase.id, { query: event.target.value })
                  }
                />
                <Select
                  aria-label={`样例预期 ${index + 1}`}
                  value={testCase.expectation}
                  options={expectationOptions}
                  onChange={(expectation) =>
                    update(testCase.id, { expectation })
                  }
                />
                {testCase.expectation === 'target' ? (
                  <Select
                    aria-label={`预期知识目标 ${index + 1}`}
                    value={testCase.expectedTargetId}
                    placeholder="选择预期知识目标"
                    options={knowledgeItems.map((item) => ({
                      value: item.id,
                      label: item.name
                    }))}
                    onChange={(expectedTargetId) =>
                      update(testCase.id, { expectedTargetId })
                    }
                  />
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未配置样例，保存草稿后会产生质量提示"
        />
      )}
      {summary ? (
        <Alert
          className="rule-test-result"
          type={summary.failed ? 'error' : 'success'}
          showIcon
          message={`样例通过 ${summary.passed} 条，失败 ${summary.failed} 条`}
          description={[...summary.blocking, ...summary.warnings].join('；')}
        />
      ) : null}
    </section>
  );
}
