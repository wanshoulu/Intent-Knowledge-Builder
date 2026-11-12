import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { HashRouter } from 'react-router-dom';
import { WorkbenchProvider } from '../state/WorkbenchProvider';
import { AppRoutes } from './routes';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorBgLayout: '#f0f2f5',
          borderRadius: 6,
          borderRadiusLG: 8,
          fontSize: 14
        }
      }}
    >
      <WorkbenchProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </WorkbenchProvider>
    </ConfigProvider>
  );
}
