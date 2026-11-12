import { seedState } from '../src/data/seed';
import { selectRelevantLexicons } from '../src/services/xiaoiAiAssist';

describe('AI 辅助上下文裁剪', () => {
  it('优先保留业务描述和当前 DSL 涉及的词类', () => {
    const selected = selectRelevantLexicons(
      seedState.lexicons,
      '信用卡还款日期查询 &[信用卡][还款时间]'
    );

    expect(selected.map((item) => item.name)).toEqual(
      expect.arrayContaining(['信用卡', '还款时间'])
    );
  });

  it('发送给模型的词类不超过 30 个', () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      ...seedState.lexicons[0],
      id: `lex-${index}`,
      name: `词类${index}`,
      standardTerm: `词类${index}`
    }));

    expect(selectRelevantLexicons(many, '词类').length).toBeLessThanOrEqual(30);
  });
});
