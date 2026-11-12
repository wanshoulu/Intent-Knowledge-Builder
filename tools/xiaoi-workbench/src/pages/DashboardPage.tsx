import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  FormOutlined
} from '@ant-design/icons';
import { Button, Card, Col, List, Progress, Row, Space, Statistic, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { useWorkbench } from '../state/WorkbenchProvider';

export function DashboardPage() {
  const navigate = useNavigate();
  const { state } = useWorkbench();
  const drafts = state.knowledgeItems.filter((item) => item.status === 'draft').length;
  const pendingReviews = state.knowledgeItems.filter(
    (item) => item.status === 'in_review'
  ).length;
  const openTickets = state.tickets.filter(
    (ticket) => !['resolved', 'closed'].includes(ticket.status)
  ).length;
  const latestRun = state.evaluationRuns[0];
  const passRate = latestRun
    ? Math.round((latestRun.passed / (latestRun.passed + latestRun.failed)) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        title="工作台总览"
        description="聚合今天需要处理的知识任务、发布风险和质量反馈"
        actions={
          <Button type="primary" onClick={() => navigate('/knowledge-items')}>
            进入知识生产 <ArrowRightOutlined />
          </Button>
        }
      />

      <Row gutter={[12, 12]} className="metric-grid">
        <Col xs={24} sm={12} xl={6}>
          <Card className="metric-card" onClick={() => navigate('/knowledge-items')}>
            <Statistic title="我的草稿" value={drafts} prefix={<FormOutlined />} />
            <span>继续完善并验证</span>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="metric-card" onClick={() => navigate('/governance')}>
            <Statistic
              title="待审核对象"
              value={pendingReviews}
              prefix={<FileTextOutlined />}
            />
            <span>查看评审与发布门禁</span>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="metric-card" onClick={() => navigate('/quality')}>
            <Statistic
              title="质量工单"
              value={openTickets}
              prefix={<ExclamationCircleOutlined />}
            />
            <span>从线上问题回流修复</span>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="metric-card" onClick={() => navigate('/quality')}>
            <Statistic
              title="最近回归通过率"
              value={passRate}
              suffix="%"
              prefix={<CheckCircleOutlined />}
            />
            <Progress percent={passRate} showInfo={false} size="small" />
          </Card>
        </Col>
      </Row>

      <div className="dashboard-grid">
        <Card title="最近知识对象" extra={<Button type="link" onClick={() => navigate('/knowledge-items')}>查看全部</Button>}>
          <List
            dataSource={state.knowledgeItems}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    type="link"
                    key="open"
                    onClick={() => navigate(`/knowledge-items/${item.id}`)}
                  >
                    打开
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {item.name}
                      <StatusTag status={item.status} />
                    </Space>
                  }
                  description={`${item.domain} / ${item.category} · ${item.owner} · ${item.updatedAt}`}
                />
              </List.Item>
            )}
          />
        </Card>
        <Card title="发布风险">
          <List
            dataSource={state.changeSets}
            locale={{ emptyText: '暂无发布风险' }}
            renderItem={(changeSet) => (
              <List.Item>
                <List.Item.Meta
                  title={changeSet.title}
                  description={`${changeSet.objectRefs.length} 个关联对象 · ${changeSet.owner}`}
                />
                <Tag color={changeSet.riskLevel === 'high' ? 'red' : 'orange'}>
                  {changeSet.riskLevel === 'high' ? '高风险' : '中风险'}
                </Tag>
              </List.Item>
            )}
          />
        </Card>
      </div>
    </div>
  );
}
