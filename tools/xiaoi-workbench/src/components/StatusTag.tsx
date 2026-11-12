import { Tag } from 'antd';
import type { EntityStatus, TicketStatus } from '../domain/types';

const statusConfig: Record<
  EntityStatus | TicketStatus | 'rejected',
  { color: string; label: string }
> = {
  draft: { color: 'blue', label: '草稿' },
  incomplete: { color: 'orange', label: '待完善' },
  in_review: { color: 'gold', label: '待审核' },
  approved: { color: 'cyan', label: '已批准' },
  published: { color: 'green', label: '已发布' },
  disabled: { color: 'default', label: '已停用' },
  archived: { color: 'default', label: '已归档' },
  open: { color: 'red', label: '待处理' },
  triaged: { color: 'orange', label: '已归因' },
  assigned: { color: 'gold', label: '已指派' },
  fixing: { color: 'blue', label: '修复中' },
  verifying: { color: 'cyan', label: '验证中' },
  resolved: { color: 'green', label: '已解决' },
  closed: { color: 'default', label: '已关闭' },
  rejected: { color: 'red', label: '已驳回' }
};

export function StatusTag({
  status
}: {
  status: EntityStatus | TicketStatus | 'rejected';
}) {
  const config = statusConfig[status];
  return <Tag color={config.color}>{config.label}</Tag>;
}
