import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiRuleAssistant } from '../src/components/AiRuleAssistant';
import { seedState } from '../src/data/seed';

describe('小 i AI 规则助手', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('生成并采纳通过系统校验的 DSL 候选', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          candidate: '&[信用卡][还款时间][查询动作?]',
          explanation: '信用卡和还款时间必需，查询动作可选',
          issues: [],
          suggestedLexicons: [],
          positiveExamples: ['查一下信用卡还款日期'],
          negativeExamples: ['信用卡怎么激活'],
          confidence: 0.9,
          validation: { valid: true },
          model: 'deepseek-chat'
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AiRuleAssistant
        kind="dsl"
        value=""
        purpose="positive"
        description="信用卡还款日查询"
        lexicons={seedState.lexicons}
        positiveExamples={['查一下信用卡还款日期']}
        negativeExamples={['信用卡怎么激活']}
        onApply={onApply}
      />
    );

    await user.click(screen.getByRole('button', { name: 'AI 辅助' }));
    await user.type(
      screen.getByLabelText('告诉 AI 你想实现什么'),
      '识别用户查询信用卡还款日期'
    );
    await user.click(screen.getByRole('button', { name: '生成规则' }));

    expect(await screen.findByText('&[信用卡][还款时间][查询动作?]'))
      .toBeInTheDocument();
    expect(screen.getByText(/系统校验通过/)).toBeInTheDocument();
    expect(screen.getByText('样例验证 2/2')).toBeInTheDocument();
    expect(screen.queryByText('模型置信度')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '检查当前内容' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '采纳候选' }));
    expect(onApply).toHaveBeenCalledWith('&[信用卡][还款时间][查询动作?]');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/xiaoi/ai/assist',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('系统校验失败时禁止采纳模型候选', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          candidate: '[不存在词类]',
          explanation: '模型候选',
          issues: [],
          suggestedLexicons: [],
          positiveExamples: [],
          negativeExamples: [],
          confidence: 0.2,
          validation: { valid: false, error: '未定义词类：不存在词类' },
          model: 'deepseek-chat'
        }
      })
    }));

    render(
      <AiRuleAssistant
        kind="dsl"
        value="[信用卡]"
        purpose="positive"
        lexicons={seedState.lexicons}
        onApply={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'AI 辅助' }));
    await user.type(
      screen.getByLabelText('告诉 AI 你想实现什么'),
      '优化当前规则'
    );
    await user.click(screen.getByRole('button', { name: '生成规则' }));
    expect(await screen.findByText(/未定义词类/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '采纳候选' })).toBeDisabled();
  });
});
