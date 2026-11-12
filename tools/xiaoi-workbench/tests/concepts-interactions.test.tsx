import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';

describe('概念模板与交互编排', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('维护真实业务概念语义块，不展示固定生成统计', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('业务概念模型'));
    expect(await screen.findByText('时间查询类')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存语义配置' })).toBeInTheDocument();
    expect(screen.queryByText('新增 3')).not.toBeInTheDocument();
  });

  it('切换渠道并预览动作呈现', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('交互编排'));
    expect(await screen.findByText('打开信用卡账单')).toBeInTheDocument();
    await user.click(screen.getByText('微信'));

    expect(screen.getAllByText('微信')).toHaveLength(2);
    expect(screen.getByText('open_credit_card_bill')).toBeInTheDocument();
  });

  it('生成动作调用前校验必填参数映射', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('交互编排'));
    await user.click(await screen.findByText('打开网点预约'));
    expect(screen.getByText('参数映射（1）')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /解析并校验/ })
    );
    expect(screen.getByText('动作调用不可执行')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', {
        name: '测试参数 appointment_time'
      }),
      '明天下午'
    );
    await user.click(
      screen.getByRole('button', { name: /解析并校验/ })
    );

    expect(screen.getByText('动作调用可执行')).toBeInTheDocument();
    expect(
      screen.getByText(
        '{"path":"/branch/appointment?appointment_time=明天下午"}'
      )
    ).toBeInTheDocument();
  });
});
