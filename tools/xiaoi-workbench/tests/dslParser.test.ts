import { parseExpression } from '../src/engine/dslParser';

describe('小 i 兼容语义模板解析器', () => {
  it.each([
    ['[信用卡][激活]', 'normal'],
    ['&[信用卡][激活]', 'boost'],
    ['&&[信用卡][激活]', 'exact'],
    ['&+[信用卡][激活]', 'fallback']
  ] as const)('解析模板前缀 %s', (dsl, mode) => {
    expect(parseExpression(dsl).mode).toBe(mode);
  });

  it('解析可选、或运算和局部有序分组', () => {
    const parsed = parseExpression(
      '[开通|办理]([信用卡][激活])[方法?]([网点][查询])'
    );

    expect(parsed.terms).toEqual([
      expect.objectContaining({
        alternatives: ['开通', '办理'],
        optional: false,
        orderGroup: undefined
      }),
      expect.objectContaining({ alternatives: ['信用卡'], orderGroup: 1 }),
      expect.objectContaining({ alternatives: ['激活'], orderGroup: 1 }),
      expect.objectContaining({ alternatives: ['方法'], optional: true }),
      expect.objectContaining({ alternatives: ['网点'], orderGroup: 2 }),
      expect.objectContaining({ alternatives: ['查询'], orderGroup: 2 })
    ]);
  });

  it.each([
    ['[信用卡', '未闭合'],
    ['([信用卡]([激活]))', '不支持嵌套'],
    ['[信用卡]&[激活]', '模板模式符号只能位于开头'],
    ['[信用卡])', '缺少起始括号'],
    ['[信用卡|]', '或运算不能包含空词类'],
    ['()[信用卡]', '有序分组不能为空']
  ])('拒绝非法模板 %s', (dsl, expectedError) => {
    expect(() => parseExpression(dsl)).toThrow(expectedError);
  });
});
