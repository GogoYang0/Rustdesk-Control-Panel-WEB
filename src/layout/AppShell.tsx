import { Avatar, Button, Layout, Select, Spin, Tag, Typography } from '@douyinfe/semi-ui'
import { useEffect } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router'

import { logout, setLogoutHandler } from '../lib/session'
import { useGetMeQuery } from '../store/api'

const { Sider, Header, Content } = Layout
const { Text } = Typography

interface NavEntry {
  key: string
  label: string
  permission?: string
  ready?: boolean
}

const NAV_GROUPS: { title: string; items: NavEntry[] }[] = [
  {
    title: '资产与身份',
    items: [
      { key: 'devices', label: '设备', permission: 'device.read' },
      { key: 'members', label: '组织与成员', permission: 'device.read', ready: true },
      { key: 'addressbook', label: '地址簿', permission: 'device.read' },
    ],
  },
  {
    title: '会话与策略',
    items: [
      { key: 'sessions', label: '会话记录', permission: 'device.read' },
      { key: 'access', label: '访问控制', permission: 'access.manage' },
    ],
  },
  {
    title: '运维与审计',
    items: [
      { key: 'audit', label: '审计与日志', permission: 'audit.read' },
      { key: 'builds', label: '客户端生成器', permission: 'client_build.manage' },
    ],
  },
]

export default function AppShell() {
  const navigate = useNavigate()
  const { orgId } = useParams()
  const { data: me, isLoading, error } = useGetMeQuery()

  useEffect(() => {
    // Any 401 that survives a refresh means the session is gone.
    setLogoutHandler(() => navigate('/login', { replace: true }))
    return () => setLogoutHandler(() => undefined)
  }, [navigate])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }
  if (error || !me) {
    return <Navigate to="/login" replace />
  }

  const current = me.orgs.find((org) => String(org.id) === orgId) ?? me.orgs[0]
  if (!current) {
    return <Navigate to="/" replace />
  }
  const perms = new Set(current.permissions)

  return (
    <Layout className="h-screen">
      <Sider className="border-r border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)]">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--semi-color-primary)] text-sm font-bold text-white">
            R
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">RustDesk Panel</div>
            <div className="text-[10px] tracking-[0.18em] text-[var(--semi-color-text-2)]">CONTROL · PANEL</div>
          </div>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-2 pb-1 pt-3 text-[11px] tracking-wide text-[var(--semi-color-text-2)]">
                {group.title}
              </div>
              {group.items.map((item) => {
                const allowed = item.permission ? perms.has(item.permission) : true
                const active = item.key === 'members'
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!item.ready || !allowed}
                    onClick={() => {
                      if (item.ready) return
                    }}
                    className={[
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition',
                      active
                        ? 'bg-[var(--semi-color-primary-light-default)] font-medium text-[var(--semi-color-primary)]'
                        : 'text-[var(--semi-color-text-1)] hover:bg-[var(--semi-color-fill-0)]',
                      !item.ready || !allowed ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : '',
                    ].join(' ')}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                    <span>{item.label}</span>
                    {item.ready ? null : (
                      <span className="ml-auto rounded border border-[var(--semi-color-border)] px-1 text-[10px] text-[var(--semi-color-text-2)]">
                        后续
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full px-4 py-3 text-[10px] text-[var(--semi-color-text-2)]">
          <div>TLS 1.3 · 审计开启</div>
          <div className="mt-1 opacity-70">© 2026 RustDesk Panel</div>
        </div>
      </Sider>

      <Layout>
        <Header className="flex items-center gap-4 border-b border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] px-5">
          <Select
            value={current.id}
            style={{ width: 220 }}
            onChange={(value) => navigate(`/orgs/${value}/members`)}
            optionList={me.orgs.map((org) => ({ label: org.name, value: org.id }))}
          />
          <Tag color="blue" size="small">
            {current.role_kind}
          </Tag>
          <div className="ml-auto flex items-center gap-3">
            <Text type="secondary" size="small">
              {me.user.email}
            </Text>
            <Avatar size="small" color="light-blue">
              {me.user.email.slice(0, 1).toUpperCase()}
            </Avatar>
            <Button
              size="small"
              type="tertiary"
              onClick={() => {
                logout()
              }}
            >
              退出
            </Button>
          </div>
        </Header>
        <Content className="overflow-auto bg-[var(--semi-color-fill-0)] p-5">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
