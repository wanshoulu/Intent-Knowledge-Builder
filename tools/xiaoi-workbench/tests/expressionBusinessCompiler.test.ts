import { seedState } from '../src/data/seed';
import type { ExpressionBusinessConfig } from '../src/domain/expressionBusiness';
import {
  compileBusinessExpression,
  roundTripBusinessExpression
} from '../src/engine/expressionBusinessCompiler';

const positiveConfig: ExpressionBusinessConfig = {
  schemaVersion: 2,
  editorMode: 'business',
  purpose: 'positive',
  requiredLexiconIds: ['lex-credit-card', 'lex-repayment-date'],
  optionalLexiconIds: ['lex-query-action'],
  alternativeGroups: [],
  ordered: false,
  matchMode: 'boost'
};

describe('中文条件与小 i DSL 编译', () => {
  it('将必须和可选业务词编译为增强表达式', () => {
    expect(
      compileBusinessExpression(positiveConfig, seedState.lexicons)
    ).toEqual(
      expect.objectContaining({
        dsl: '&[信用卡][还款时间][查询动作?]',
        lexiconIds: [
          'lex-credit-card',
          'lex-repayment-date',
          'lex-query-action'
        ],
        polarity: 'positive'
      })
    );
  });

  it('将语境和排除信号编译为完整排除表达式', () => {
    const result = compileBusinessExpression(
      {
        ...positiveConfig,
        purpose: 'negative',
        requiredLexiconIds: [],
        optionalLexiconIds: [],
        contextLexiconIds: ['lex-credit-card', 'lex-repayment-date'],
        exclusionLexiconIds: ['lex-negative'],
        matchMode: 'normal'
      },
      seedState.lexicons
    );

    expect(result.dsl).toBe('[信用卡][还款时间][否定]');
    expect(result.polarity).toBe('negative');
  });

  it('阻止没有必要条件的识别规则', () => {
    expect(() =>
      compileBusinessExpression(
        {
          ...positiveConfig,
          requiredLexiconIds: [],
          optionalLexiconIds: ['lex-query-action']
        },
        seedState.lexicons
      )
    ).toThrow('至少需要一个“必须说到”或“至少说到一个”条件');
  });

  it('只允许可无损往返的历史 DSL 进入业务模式', () => {
    expect(
      roundTripBusinessExpression(
        '&[信用卡][还款时间][查询动作?]',
        seedState.lexicons,
        'positive'
      )
    ).toEqual(
      expect.objectContaining({
        convertible: true,
        config: expect.objectContaining({
          requiredLexiconIds: ['lex-credit-card', 'lex-repayment-date'],
          optionalLexiconIds: ['lex-query-action'],
          matchMode: 'boost'
        })
      })
    );

    expect(
      roundTripBusinessExpression(
        '([信用卡][还款时间])[查询动作?]',
        seedState.lexicons,
        'positive'
      )
    ).toEqual(
      expect.objectContaining({
        convertible: false,
        reason: expect.stringContaining('局部有序')
      })
    );
  });

  it('拒绝不存在和已停用的业务词引用', () => {
    expect(() =>
      compileBusinessExpression(
        {
          ...positiveConfig,
          requiredLexiconIds: ['missing-lexicon']
        },
        seedState.lexicons
      )
    ).toThrow('不存在或不可用');
  });
});
