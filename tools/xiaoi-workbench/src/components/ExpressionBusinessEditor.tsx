import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Select,
  Space,
  Tag
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ExpressionBusinessConfig } from '../domain/expressionBusiness';
import type { LexiconClass } from '../domain/types';
import { compileBusinessExpression } from '../engine/expressionBusinessCompiler';
import { BusinessLexiconPicker } from './BusinessLexiconPicker';
import { AiRuleAssistant } from './AiRuleAssistant';
import { roundTripBusinessExpression } from '../engine/expressionBusinessCompiler';

interface ExpressionBusinessEditorProps {
  config: ExpressionBusinessConfig;
  lexicons: LexiconClass[];
  description?: string;
  positiveExamples?: string[];
  negativeExamples?: string[];
  onChange: (config: ExpressionBusinessConfig) => void;
  onCreateLexicon?: (lexicon: LexiconClass) => void;
}

export function ExpressionBusinessEditor({
  config,
  lexicons,
  description,
  positiveExamples,
  negativeExamples,
  onChange,
  onCreateLexicon
}: ExpressionBusinessEditorProps) {
  let preview:
    | ReturnType<typeof compileBusinessExpression>
    | undefined;
  let error = '';
  try {
    preview = compileBusinessExpression(config, lexicons);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : '业务条件不完整';
  }

  const update = (patch: Partial<ExpressionBusinessConfig>) =>
    onChange({ ...config, ...patch });

  return (
    <div className="business-expression-editor">
      <div className="business-editor-intro">
        <div>
          <Tag color={config.purpose === 'negative' ? 'red' : 'green'}>
            {config.purpose === 'negative' ? '排除规则' : '识别规则'}
          </Tag>
          <h3>用业务条件描述用户会怎么说</h3>
          <p>选择已有业务词即可，系统会自动生成技术表达式。</p>
        </div>
        {config.purpose === 'positive' ? (
          <AiRuleAssistant
            kind="dsl"
            value={preview?.dsl ?? ''}
            purpose={config.purpose}
            description={description}
            lexicons={lexicons}
            positiveExamples={positiveExamples}
            negativeExamples={negativeExamples}
            onApply={(dsl) => {
              const conversion = roundTripBusinessExpression(
                dsl,
                lexicons,
                config.purpose
              );
              if (conversion.convertible) onChange(conversion.config);
            }}
          />
        ) : null}
      </div>

      {config.purpose === 'positive' ? (
        <>
          <Card size="small" className="business-condition-card">
            <Form.Item
              label="必须说到"
              help="这里选择的业务词必须全部出现在用户问法中"
            >
              <BusinessLexiconPicker
                ariaLabel="必须说到"
                value={config.requiredLexiconIds}
                lexicons={lexicons}
                placeholder="选择必要的业务对象、动作或属性"
                onCreateLexicon={onCreateLexicon}
                onChange={(requiredLexiconIds) => update({ requiredLexiconIds })}
              />
            </Form.Item>
            <Form.Item
              label="可以说到"
              help="这些内容不出现也不影响规则命中"
            >
              <BusinessLexiconPicker
                ariaLabel="可以说到"
                value={config.optionalLexiconIds}
                lexicons={lexicons}
                placeholder="选择可选的补充业务词"
                onCreateLexicon={onCreateLexicon}
                onChange={(optionalLexiconIds) => update({ optionalLexiconIds })}
              />
            </Form.Item>
          </Card>

          <div className="alternative-group-list">
            {config.alternativeGroups.map((group, index) => (
              <Card
                key={group.id}
                size="small"
                title={`至少说到一个 · 条件组 ${index + 1}`}
                extra={
                  <Button
                    type="link"
                    danger
                    onClick={() =>
                      update({
                        alternativeGroups: config.alternativeGroups.filter(
                          (candidate) => candidate.id !== group.id
                        )
                      })
                    }
                  >
                    删除
                  </Button>
                }
              >
                <BusinessLexiconPicker
                  ariaLabel={`任选业务词 ${index + 1}`}
                  value={group.lexiconIds}
                  lexicons={lexicons}
                  placeholder="组内任意一个业务词出现即可"
                  onCreateLexicon={onCreateLexicon}
                  onChange={(lexiconIds) =>
                    update({
                      alternativeGroups: config.alternativeGroups.map(
                        (candidate) =>
                          candidate.id === group.id
                            ? { ...candidate, lexiconIds }
                            : candidate
                      )
                    })
                  }
                />
              </Card>
            ))}
            <Button
              icon={<PlusOutlined />}
              onClick={() =>
                update({
                  alternativeGroups: [
                    ...config.alternativeGroups,
                    {
                      id: `group-${Date.now().toString(36)}`,
                      lexiconIds: []
                    }
                  ]
                })
              }
            >
              增加“至少说到一个”
            </Button>
          </div>
        </>
      ) : (
        <Card size="small" className="business-condition-card">
          <Form.Item
            label="业务语境"
            help="限定这条排除规则只影响哪一类问题"
          >
            <BusinessLexiconPicker
              ariaLabel="业务语境"
              value={config.contextLexiconIds ?? []}
              lexicons={lexicons}
              placeholder="例如：信用卡、还款时间"
              onCreateLexicon={onCreateLexicon}
              onChange={(contextLexiconIds) => update({ contextLexiconIds })}
            />
          </Form.Item>
          <Form.Item
            label="排除信号"
            help="用户说到这些内容时排除当前知识目标"
          >
            <BusinessLexiconPicker
              ariaLabel="排除信号"
              value={config.exclusionLexiconIds ?? []}
              lexicons={lexicons}
              placeholder="例如：不要、取消、已还清"
              onCreateLexicon={onCreateLexicon}
              onChange={(exclusionLexiconIds) => update({ exclusionLexiconIds })}
            />
          </Form.Item>
        </Card>
      )}

      <Card size="small" title="规则设置" className="business-settings-card">
        <Space wrap size="large">
          <Checkbox
            checked={config.ordered}
            onChange={(event) => update({ ordered: event.target.checked })}
          >
            要求业务词按配置顺序出现
          </Checkbox>
          <Select
            aria-label="规则角色"
            value={config.matchMode}
            style={{ width: 190 }}
            options={[
              { value: 'normal', label: '普通规则' },
              { value: 'fallback', label: '候补规则' },
              { value: 'boost', label: '高置信规则（高级）' },
              { value: 'exact', label: '最高置信规则（高级）' }
            ]}
            onChange={(matchMode) => update({ matchMode })}
          />
        </Space>
      </Card>

      {preview ? (
        <Alert
          type="success"
          showIcon
          message="业务解释"
          description={
            <div>
              <p>{preview.explanation}</p>
              <details>
                <summary>查看系统生成的技术表达式</summary>
                <code>{preview.dsl}</code>
              </details>
            </div>
          }
        />
      ) : (
        <Alert type="warning" showIcon message="条件尚未完整" description={error} />
      )}
    </div>
  );
}
