import { seedState } from '../src/data/seed';
import { inspectDsl } from '../src/engine/dslInspection';

describe('DSL 本地诊断', () => {
  it('无括号表达式明确解释为顺序不限', () => {
    const result = inspectDsl(
      '[查询动作?][信用卡][还款时间]',
      seedState.lexicons,
      [],
      []
    );

    expect(result.valid).toBe(true);
    expect(result.explanation).toContain('顺序不限');
    expect(result.explanation).not.toContain('按顺序');
  });

  it('正例未命中时阻止候选通过', () => {
    const result = inspectDsl(
      '[信用卡][还款时间]',
      seedState.lexicons,
      ['信用卡怎么激活'],
      []
    );

    expect(result.valid).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.issues).toContain('正例未命中：信用卡怎么激活');
  });

  it('反例误命中时阻止候选通过', () => {
    const result = inspectDsl(
      '[信用卡]',
      seedState.lexicons,
      [],
      ['信用卡怎么激活']
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContain('反例被错误命中：信用卡怎么激活');
  });
});
