import { RobotOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Drawer,
  Input,
  Space,
  Spin,
  Tag
} from 'antd';
import { useState } from 'react';
import type { LexiconClass } from '../domain/types';
import {
  testRegex,
  validateRegex
} from '../engine/ruleTesting';
import { inspectDsl } from '../engine/dslInspection';
import {
  requestXiaoiAiAssist,
  selectRelevantLexicons,
  type AiAssistResult,
  type AiAssistTask
} from '../services/xiaoiAiAssist';

interface AiRuleAssistantProps {
  kind: 'dsl' | 'regex';
  value: string;
  purpose?: 'positive' | 'negative';
  description?: string;
  lexicons?: LexiconClass[];
  positiveExamples?: string[];
  negativeExamples?: string[];
  onApply: (candidate: string) => void;
}

interface LocalValidation {
  valid: boolean;
  error?: string;
}

export function AiRuleAssistant({
  kind,
  value,
  purpose = 'positive',
  description = '',
  lexicons = [],
  positiveExamples = [],
  negativeExamples = [],
  onApply
}: AiRuleAssistantProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);

  const validateLocally = (candidate: string): LocalValidation => {
    if (kind === 'regex') {
      const syntax = validateRegex(candidate);
      if (!syntax.valid) return syntax;
      const failedPositive = positiveExamples.find(
        (example) => !testRegex(candidate, example).matched
      );
      if (failedPositive) {
        return { valid: false, error: `正例未命中：${failedPositive}` };
      }
      const failedNegative = negativeExamples.find(
        (example) => testRegex(candidate, example).matched
      );
      return failedNegative
        ? { valid: false, error: `反例被错误命中：${failedNegative}` }
        : { valid: true };
    }
    const inspection = inspectDsl(
      candidate,
      lexicons,
      positiveExamples,
      negativeExamples
    );
    return {
      valid: inspection.valid,
      error: inspection.issues.join('；') || undefined
    };
  };

  const currentInspection =
    kind === 'dsl' && value.trim()
      ? inspectDsl(value, lexicons, positiveExamples, negativeExamples)
      : null;
  const resultInspection =
    kind === 'dsl' && result?.candidate
      ? inspectDsl(
          result.candidate,
          lexicons,
          positiveExamples,
          negativeExamples
        )
      : null;
  const localValidation = result
    ? validateLocally(result.candidate)
    : { valid: false, error: '' };
  const canApply = Boolean(
    result?.candidate &&
    result.validation.valid &&
    localValidation.valid
  );

  const run = async (task: AiAssistTask) => {
    const startedAt = performance.now();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const relevantLexicons = selectRelevantLexicons(
        lexicons,
        [
          instruction,
          value,
          description,
          ...positiveExamples,
          ...negativeExamples
        ].join('\n')
      );
      const next = await requestXiaoiAiAssist(task, {
        purpose,
        instruction,
        currentValue: value,
        description,
        positiveExamples,
        negativeExamples,
        lexicons: relevantLexicons.map((lexicon) => ({
          name: lexicon.name,
          lexiconType: lexicon.lexiconType,
          standardTerm: lexicon.standardTerm,
          aliases: lexicon.aliases
        }))
      });
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '模型辅助暂不可用');
    } finally {
      setElapsedMs(Math.round(performance.now() - startedAt));
      setLoading(false);
    }
  };

  const generateTask: AiAssistTask =
    kind === 'dsl' ? 'generate_dsl' : 'generate_regex';
  return (
    <>
      <Button
        icon={<RobotOutlined />}
        aria-label="AI 辅助"
        onClick={() => setOpen(true)}
      >
        AI 辅助
      </Button>
      <Drawer
        title={kind === 'dsl' ? 'AI 辅助编写小 i DSL' : 'AI 辅助编写正则'}
        width={520}
        open={open}
        onClose={() => setOpen(false)}
        extra={<Tag color="cyan">DeepSeek</Tag>}
      >
        <Alert
          type="info"
          showIcon
          message={
            kind === 'dsl'
              ? '这里生成的是小 i 语义规则表达式（DSL），不是正则表达式'
              : '这里生成的是动态词 JavaScript 正则表达式，不是小 i DSL'
          }
          description="解释、语法检查、词类检查和样例测试均由本地规则引擎即时完成；DeepSeek 只负责生成候选。"
        />
        {currentInspection ? (
          <div className="ai-local-inspection">
            <div className="ai-result-heading">
              <strong>当前规则 · 即时诊断</strong>
              <Tag color={currentInspection.valid ? 'green' : 'red'}>
                {currentInspection.valid ? '可运行' : '需修改'}
              </Tag>
            </div>
            <p>{currentInspection.explanation}</p>
            <span>
              语法 {currentInspection.syntaxValid ? '通过' : '失败'} · 词类引用{' '}
              {currentInspection.referencesValid ? '通过' : '失败'} · 样例验证{' '}
              {currentInspection.passed}/{currentInspection.passed + currentInspection.failed}
            </span>
            {currentInspection.issues.map((issue) => (
              <p className="ai-inspection-issue" key={issue}>{issue}</p>
            ))}
          </div>
        ) : null}
        <div className="ai-assistant-section">
          <label htmlFor="ai-rule-instruction">告诉 AI 你想实现什么</label>
          <Input.TextArea
            id="ai-rule-instruction"
            aria-label="告诉 AI 你想实现什么"
            rows={4}
            value={instruction}
            placeholder={
              kind === 'dsl'
                ? '例如：识别用户查询信用卡还款日期，查询动作可以省略'
                : '例如：匹配今天、明天、后天，可选上午、下午或晚上'
            }
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
        <Space wrap className="ai-assistant-actions">
          <Button
            type="primary"
            disabled={!instruction.trim()}
            onClick={() => run(generateTask)}
          >
            生成规则
          </Button>
          {value.trim() ? <span>当前内容已在上方即时检查，无需等待模型</span> : null}
        </Space>

        {loading ? (
          <div className="ai-assistant-loading">
            <Spin />
            <span>DeepSeek 正在分析，系统稍后还会进行确定性校验</span>
          </div>
        ) : null}
        {error ? (
          <Alert type="error" showIcon message="AI 辅助失败" description={error} />
        ) : null}
        {result ? (
          <div className="ai-assistant-result">
            <div className="ai-result-heading">
              <strong>候选结果</strong>
              <span>{elapsedMs ? `生成耗时 ${(elapsedMs / 1000).toFixed(1)}s` : ''}</span>
            </div>
            <pre className="ai-candidate-code">{result.candidate || '未生成候选'}</pre>
            {result.explanation ? <p>{result.explanation}</p> : null}
            {result.issues.map((issue) => (
              <Alert key={issue} type="warning" showIcon message={issue} />
            ))}
            <Alert
              type={canApply ? 'success' : 'error'}
              showIcon
              message={canApply ? '系统校验通过' : '系统校验未通过'}
              description={
                result.validation.error ||
                localValidation.error ||
                (canApply ? '候选可写入当前草稿' : '候选不可采纳')
              }
            />
            {resultInspection ? (
              <div className="ai-evidence-row">
                <Tag color={resultInspection.syntaxValid ? 'green' : 'red'}>
                  语法{resultInspection.syntaxValid ? '通过' : '失败'}
                </Tag>
                <Tag color={resultInspection.referencesValid ? 'green' : 'red'}>
                  词类{resultInspection.referencesValid ? '通过' : '失败'}
                </Tag>
                <Tag color={resultInspection.failed === 0 ? 'green' : 'red'}>
                  {`样例验证 ${resultInspection.passed}/${
                    resultInspection.passed + resultInspection.failed
                  }`}
                </Tag>
              </div>
            ) : null}
            <Space>
              <Button
                type="primary"
                aria-label="采纳候选"
                disabled={!canApply}
                onClick={() => {
                  onApply(result.candidate);
                  setOpen(false);
                }}
              >
                采纳候选
              </Button>
              <Button onClick={() => run(generateTask)}>重新生成</Button>
            </Space>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
