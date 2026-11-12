import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag
} from 'antd';
import { useEffect, useState } from 'react';
import type { LexiconClass } from '../domain/types';
import {
  testLexicon,
  validateRegex,
  type LexiconTestResult
} from '../engine/ruleTesting';
import { formatLexiconModifiers } from '../engine/lexiconModifiers';
import { AiRuleAssistant } from './AiRuleAssistant';

const matchSourceLabels = {
  standard: '标准词',
  alias: '别名',
  pinyin: '拼音纠错',
  dynamic: '动态模式'
} as const;

const posTypeLabels: Record<LexiconClass['posType'], string> = {
  noun: '名词',
  verb: '动词',
  other: '其他'
};

function formatWeightAdjustment(value: number): string {
  if (value === 0) return '无';
  return value > 0 ? `+${value}` : String(value);
}

interface RegexRuleEditorProps {
  lexicon: LexiconClass;
  onSave: (patch: Partial<LexiconClass>) => void;
}

export function RegexRuleEditor({ lexicon, onSave }: RegexRuleEditorProps) {
  const [draft, setDraft] = useState(lexicon);
  const [testQuery, setTestQuery] = useState(lexicon.examples?.[0] ?? '');
  const [result, setResult] = useState<LexiconTestResult | null>(null);

  useEffect(() => {
    setDraft(lexicon);
    setTestQuery(lexicon.examples?.[0] ?? '');
    setResult(null);
  }, [lexicon]);

  const validation = draft.dynamic
    ? validateRegex(draft.pattern ?? '')
    : { valid: true };
  const saveDisabled = !draft.name.trim() || !draft.standardTerm.trim() || !validation.valid;
  const runLexiconTest = () => {
    setResult(testLexicon(draft, testQuery));
  };

  return (
    <div className="rule-editor">
      <div className="rule-editor-heading">
        <div>
          <Tag color={draft.dynamic ? 'purple' : 'blue'}>
            {draft.dynamic ? '动态词正则' : '词类'}
          </Tag>
          <h3>{draft.name}</h3>
          <code className="modifier-preview">
            兼容符号：{formatLexiconModifiers(draft) || '无'}
          </code>
        </div>
        <Space>
          {draft.dynamic ? (
            <AiRuleAssistant
              kind="regex"
              value={draft.pattern ?? ''}
              description={draft.description}
              positiveExamples={draft.examples}
              onApply={(pattern) => {
                setDraft({ ...draft, pattern });
                setResult(null);
              }}
            />
          ) : null}
          <Button
            type="primary"
            aria-label="保存规则"
            disabled={saveDisabled}
            onClick={() => onSave(draft)}
          >
            保存规则
          </Button>
        </Space>
      </div>
      <Form layout="vertical">
        <Form.Item label="规则名称" required>
          <Input
            aria-label="规则名称"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Form.Item>
        <div className="rule-form-grid">
          <Form.Item label="词类类型">
            <Select
              aria-label="词类类型"
              value={draft.lexiconType ?? 'general'}
              options={[
                { label: '一般词', value: 'general' },
                { label: '集合词', value: 'collection' },
                { label: '动态词', value: 'dynamic' }
              ]}
              onChange={(value) =>
                setDraft({ ...draft, lexiconType: value, dynamic: value === 'dynamic' })
              }
            />
          </Form.Item>
          <Form.Item label="标准词" required>
            <Input
              aria-label="标准词"
              value={draft.standardTerm}
              onChange={(event) =>
                setDraft({ ...draft, standardTerm: event.target.value })
              }
            />
          </Form.Item>
          <Form.Item label="权重">
            <InputNumber
              aria-label="权重"
              min={0}
              step={0.1}
              value={draft.weight}
              onChange={(value) => setDraft({ ...draft, weight: value ?? 1 })}
            />
          </Form.Item>
          <Form.Item label="词性">
            <Select
              aria-label="词性"
              value={draft.posType}
              options={[
                { label: '名词', value: 'noun' },
                { label: '动词', value: 'verb' },
                { label: '其他', value: 'other' }
              ]}
              onChange={(value) => setDraft({ ...draft, posType: value })}
            />
          </Form.Item>
        </div>
        <Form.Item label="描述">
          <Input.TextArea
            aria-label="描述"
            rows={2}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </Form.Item>
        <div className="lexicon-modifier-panel">
          <div className="inspector-label">小 i 词类修饰符</div>
          <Space wrap>
            <Checkbox
              checked={draft.weightMarked ?? false}
              onChange={(event) =>
                setDraft({ ...draft, weightMarked: event.target.checked })
              }
            >
              高权重（*）
            </Checkbox>
            <InputNumber
              aria-label="星号权重调整"
              disabled={!draft.weightMarked}
              placeholder="默认 +1"
              value={draft.weightAdjustment}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  weightAdjustment: value === null ? undefined : value
                })
              }
            />
            <Checkbox
              checked={draft.synonymsSimilar === false}
              onChange={(event) =>
                setDraft({ ...draft, synonymsSimilar: !event.target.checked })
              }
            >
              同义词互不相似（#）
            </Checkbox>
            <Checkbox
              checked={draft.pinyinCorrection ?? false}
              onChange={(event) =>
                setDraft({ ...draft, pinyinCorrection: event.target.checked })
              }
            >
              拼音纠错（@）
            </Checkbox>
            <Tag>{draft.posType === 'noun' ? '%n 名词' : draft.posType === 'verb' ? '%v 动词' : '无词性符号'}</Tag>
          </Space>
          {draft.pinyinCorrection ? (
            <Form.Item label="拼音别名（每行一个）">
              <Input.TextArea
                aria-label="拼音别名"
                rows={3}
                value={(draft.pinyinAliases ?? []).join('\n')}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    pinyinAliases: event.target.value
                      .split('\n')
                      .map((value) => value.trim().toLowerCase())
                      .filter(Boolean)
                  })
                }
              />
            </Form.Item>
          ) : null}
        </div>
        {draft.dynamic ? (
          <Form.Item
            label="正则表达式"
            validateStatus={validation.valid ? 'success' : 'error'}
            help={validation.valid ? '正则语法有效' : `正则校验失败：${validation.error}`}
            required
          >
            <Input.TextArea
              aria-label="正则表达式"
              className="dsl-input"
              rows={3}
              value={draft.pattern}
              onChange={(event) => {
                setDraft({ ...draft, pattern: event.target.value });
                setResult(null);
              }}
            />
          </Form.Item>
        ) : (
          <Form.Item label="别名（每行一个）">
            <Input.TextArea
              aria-label="词类别名"
              rows={4}
              value={draft.aliases.join('\n')}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  aliases: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean)
                })
              }
            />
          </Form.Item>
        )}
      </Form>
      <div className="single-rule-test">
        <h4>词类识别测试</h4>
        <p className="secondary-text">
          仅验证当前词类能否识别输入文本，不执行知识点竞争和答案阈值判断。
        </p>
        <Space.Compact block>
          <Input
            aria-label="词类识别测试语句"
            value={testQuery}
            placeholder={
              draft.dynamic
                ? '输入文本验证当前动态词正则'
                : '输入文本验证标准词、别名或拼音纠错'
            }
            onChange={(event) => {
              setTestQuery(event.target.value);
              setResult(null);
            }}
            onPressEnter={runLexiconTest}
          />
          <Button
            aria-label="运行词类识别测试"
            disabled={saveDisabled || !testQuery.trim()}
            onClick={runLexiconTest}
          >
            运行词类识别测试
          </Button>
        </Space.Compact>
        {result ? (
          <Alert
            className="rule-test-result"
            type={result.matched ? 'success' : 'warning'}
            showIcon
            message={
              result.matched
                ? draft.dynamic
                  ? `动态词命中：${result.matchText}`
                  : `词类命中：${result.matchText}`
                : '当前词类未命中'
            }
            description={
              result.matched ? (
                <div>
                  <p>命中原文：{result.matchText}</p>
                  <p>
                    命中方式：
                    {result.matchSource
                      ? matchSourceLabels[result.matchSource]
                      : '未知'}
                  </p>
                  <p>命中词条：{result.matchedTerm}</p>
                  <p>归一结果：{result.canonicalTerm}</p>
                  <p>词类：{result.lexiconName}</p>
                  <p>词性：{posTypeLabels[result.posType]}</p>
                  <p>基础权重：{result.baseWeight}</p>
                  <p>
                    权重修饰：
                    {formatWeightAdjustment(result.weightAdjustment)}
                  </p>
                  <p>有效权重：{result.effectiveWeight}</p>
                  <p>匹配区间：{result.start} - {result.end}</p>
                  {result.dynamic ? (
                    result.groups.length ? result.groups.map((group, index) => (
                      <p key={`${group}-${index}`}>捕获组 {index + 1}：{group || '（空）'}</p>
                    )) : <p>没有捕获组</p>
                  ) : null}
                </div>
              ) : null
            }
          />
        ) : null}
      </div>
    </div>
  );
}
