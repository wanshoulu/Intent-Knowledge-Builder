import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';

describe('小 i 知识工作台应用壳', () => {
  it('展示统一工作台品牌、上下文和全部工作域', () => {
    render(<App />);

    expect(screen.getByText('小 i 知识工作台')).toBeInTheDocument();
    expect(screen.getByText('知识点管理')).toBeInTheDocument();
    expect(screen.getByText('语言规则')).toBeInTheDocument();
    expect(screen.getByText('业务概念模型')).toBeInTheDocument();
    expect(screen.getByText('交互编排')).toBeInTheDocument();
    expect(screen.getByText('治理与发布')).toBeInTheDocument();
    expect(screen.getByText('评测与质检')).toBeInTheDocument();
    expect(screen.getByText('平台设置')).toBeInTheDocument();
    expect(screen.getByText('零售金融知识空间')).toBeInTheDocument();
    expect(screen.getByText('手机银行助手')).toBeInTheDocument();
  });

  it('通过主导航切换业务工作域', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('语言规则'));

    expect(await screen.findByRole('heading', { name: '语言规则' })).toBeInTheDocument();
    expect(window.location.hash).toContain('/language');
  });
});
