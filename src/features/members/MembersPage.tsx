import { Banner, Button, Empty, Spin, Table, Tag, Typography } from '@douyinfe/semi-ui'
import { useParams } from 'react-router'

import { useGetMembersQuery } from '../../store/api'
import type { Member } from '../../lib/api'

const { Title, Text } = Typography

function roleColor(kind?: string): 'blue' | 'green' | 'grey' | 'orange' {
  switch (kind) {
    case 'owner':
      return 'orange'
    case 'admin':
      return 'blue'
    case 'member':
      return 'green'
    default:
      return 'grey'
  }
}

export default function MembersPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data, isLoading, error } = useGetMembersQuery(id, { skip: !id })

  const columns = [
    {
      title: '成员',
      dataIndex: 'email',
      render: (email: string, row: Member) => (
        <div>
          <div className="text-sm">{email}</div>
          <div className="font-mono text-[11px] text-[var(--semi-color-text-2)]">user #{row.user_id}</div>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role_name',
      width: 160,
      render: (name: string, row: Member) => (
        <Tag color={roleColor(row.role_kind)} size="small">
          {name}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'disabled',
      width: 110,
      render: (disabled: boolean) =>
        disabled ? (
          <Tag color="red" size="small">
            已停用
          </Tag>
        ) : (
          <Tag color="green" size="small">
            正常
          </Tag>
        ),
    },
    {
      title: '加入时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value: string) => <span className="font-mono text-xs">{formatTime(value)}</span>,
    },
  ]

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div>
          <Title heading={4} className="!mb-1">
            组织与成员
          </Title>
          <Text type="tertiary" size="small">
            成员角色决定权限矩阵；owner/admin 不受访问规则限制。
          </Text>
        </div>
        <div className="ml-auto">
          <Button theme="solid" type="primary" disabled>
            邀请成员
          </Button>
        </div>
      </div>

      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`加载成员失败：${(error as { message?: string }).message ?? '未知错误'}`}
        />
      ) : (
        <Table<Member>
          rowKey="id"
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          loading={isLoading}
          empty={
            isLoading ? (
              <Spin />
            ) : (
              <Empty title="还没有成员" description="邀请成员后他们会出现在这里" />
            )
          }
        />
      )}

      <p className="mt-3 text-xs text-[var(--semi-color-text-2)]">
        停用/移除会撤销该成员的 compat 会话；面板会话按每请求会籍复核。
      </p>
    </div>
  )
}

function formatTime(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 16).replace('T', ' ')
}
