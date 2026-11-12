import {
  ApartmentOutlined,
  AuditOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip
} from 'antd';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useWorkbench } from '../state/WorkbenchProvider';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台总览' },
  { key: '/knowledge-items', icon: <BookOutlined />, label: '知识点管理' },
  { key: '/language', icon: <ExperimentOutlined />, label: '语言规则' },
  { key: '/concepts', icon: <ApartmentOutlined />, label: '业务概念模型' },
  { key: '/interactions', icon: <ThunderboltOutlined />, label: '交互编排' },
  { key: '/governance', icon: <AuditOutlined />, label: '治理与发布' },
  { key: '/quality', icon: <CheckCircleOutlined />, label: '评测与质检' },
  { type: 'divider' as const },
  { key: '/settings', icon: <SettingOutlined />, label: '平台设置' }
];

export function WorkbenchLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [conflictOpen, setConflictOpen] = useState(false);
  const {
    state,
    draftSync,
    runtimeStatus,
    retryDraftSync,
    resolveDraftConflict,
    updateContext
  } = useWorkbench();
  const syncPresentation = {
    loading: { color: 'processing', label: '正在读取草稿' },
    saving: { color: 'processing', label: '保存中' },
    synced: {
      color: 'success',
      label: `已同步 v${draftSync.revision ?? '-'}`
    },
    conflict: { color: 'error', label: '版本冲突' },
    offline: { color: 'warning', label: '本地恢复' }
  }[draftSync.status];
  const environmentLabel = {
    development: '开发环境',
    staging: '预发布环境',
    production: '生产环境'
  }[state.context.environment];
  const runtimePresentation = {
    loading: { color: 'processing', label: `${environmentLabel} · 查询中` },
    active: {
      color: 'success',
      label: `${environmentLabel} · 线上 v${runtimeStatus.release?.releaseVersion ?? '-'}`
    },
    unpublished: {
      color: 'default',
      label: `${environmentLabel} · 尚未发布`
    },
    error: {
      color: 'warning',
      label: `${environmentLabel} · 状态不可用`
    }
  }[runtimeStatus.status];

  const selectedKey =
    menuItems
      .filter((item) => 'key' in item && typeof item.key === 'string')
      .map((item) => ('key' in item ? item.key : ''))
      .find((key) => location.pathname.startsWith(key)) ?? '/dashboard';

  return (
    <Layout className="workbench-shell">
      <Sider
        theme="light"
        width={224}
        collapsedWidth={72}
        collapsed={collapsed}
        trigger={null}
        className="workbench-sider"
      >
        <div className="workbench-brand">
          <div className="brand-mark">小i</div>
          {!collapsed ? (
            <div className="brand-copy">
              <strong>小 i 知识工作台</strong>
              <span>Intent-Knowledge-Builder</span>
            </div>
          ) : null}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="workbench-menu"
        />
        <Button
          type="text"
          className="collapse-trigger"
          aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed((value) => !value)}
        >
          {!collapsed ? '收起导航' : null}
        </Button>
      </Sider>
      <Layout>
        <Header className="workbench-header">
          <Space size={8} wrap>
            <Select
              aria-label="当前空间"
              value={state.context.workspaceName}
              options={[{ value: state.context.workspaceName }]}
              className="context-select context-select-wide"
            />
            <Select
              aria-label="当前机器人"
              value={state.context.projectName}
              options={[{ value: state.context.projectName }]}
              className="context-select"
            />
            <Select
              aria-label="当前环境"
              value={state.context.environment}
              onChange={(environment) => updateContext({ environment })}
              options={[
                { value: 'development', label: '开发环境' },
                { value: 'staging', label: '预发布环境' },
                { value: 'production', label: '生产环境' }
              ]}
              className="context-select"
            />
          </Space>
          <Space size={12}>
            <Tooltip title={runtimeStatus.message ?? '应用当前活动发布版本'}>
              <Tag color={runtimePresentation.color}>
                {runtimePresentation.label}
              </Tag>
            </Tooltip>
            <Tooltip title={draftSync.message ?? '服务端工作草稿状态'}>
              <Space size={4}>
                <Tag color={syncPresentation.color}>{syncPresentation.label}</Tag>
                {draftSync.status === 'offline' ? (
                  <Button
                    size="small"
                    aria-label="重新连接草稿"
                    onClick={() => void retryDraftSync()}
                  >
                    重新连接
                  </Button>
                ) : null}
                {draftSync.status === 'conflict' ? (
                  <Button
                    size="small"
                    danger
                    aria-label="处理草稿冲突"
                    onClick={() => setConflictOpen(true)}
                  >
                    处理冲突
                  </Button>
                ) : null}
              </Space>
            </Tooltip>
            <Input
              aria-label="全局搜索"
              prefix={<SearchOutlined />}
              placeholder="搜索知识、规则、模板…"
              className="global-search"
            />
            <Tooltip title="AI 建模助手">
              <Button icon={<BulbOutlined />} />
            </Tooltip>
            <Badge count={3} size="small">
              <Button>任务</Button>
            </Badge>
            <Avatar className="user-avatar">王</Avatar>
          </Space>
        </Header>
        <Content className="workbench-content">
          <div className="workbench-surface">
            <Outlet />
          </div>
        </Content>
        <Modal
          open={conflictOpen}
          title="解决草稿版本冲突"
          onCancel={() => setConflictOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setConflictOpen(false)}>
              暂不处理
            </Button>,
            <Button
              key="remote"
              onClick={() => {
                void resolveDraftConflict('use-remote');
                setConflictOpen(false);
              }}
            >
              采用服务端草稿
            </Button>,
            <Button
              key="local"
              danger
              type="primary"
              onClick={() => {
                void resolveDraftConflict('keep-local');
                setConflictOpen(false);
              }}
            >
              用本地草稿覆盖服务端
            </Button>
          ]}
        >
          <p>
            本地恢复内容与服务端草稿不同。请选择一个版本继续，系统不会自动覆盖任何一方。
          </p>
        </Modal>
      </Layout>
    </Layout>
  );
}
