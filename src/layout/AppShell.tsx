import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router'

import StateBlock from '../components/StateBlock'
import { logout, setLogoutHandler } from '../lib/session'
import { closeTabFrom, evictionCandidate, pushTab } from '../lib/tabs'
import { store } from '../store'
import { panelApi } from '../store/api'
import { applyThemeMode, getStoredTheme, type ThemeMode } from '../lib/theme'
import { useGetMeQuery } from '../store/api'

interface NavEntry {
  key: string
  label: string
  permission?: string
  ready?: boolean
  icon: ReactElement
}

const ICONS: Record<string, ReactElement> = {
  devices: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2.5" y="3.5" width="13" height="8.5" rx="1.5" />
      <path d="M6 15h6M9 12v3" />
    </svg>
  ),
  members: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2.8 15c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6" />
      <path d="M12 5.4a2.2 2.2 0 010 4.2" />
    </svg>
  ),
  addressbook: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M4 2.5h8.5A1.5 1.5 0 0114 4v10a1.5 1.5 0 01-1.5 1.5H4z" />
      <path d="M4 2.5v13" />
      <path d="M7 6.5h4M7 9.5h4" />
    </svg>
  ),
  sessions: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="9" cy="9" r="6.2" />
      <path d="M9 5.5V9l2.5 1.6" />
    </svg>
  ),
  access: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M9 2.5l5.5 2.2v4.1c0 3.1-2.2 5.6-5.5 6.7-3.3-1.1-5.5-3.6-5.5-6.7V4.7z" />
      <path d="M6.8 8.8l1.6 1.6 2.9-3" />
    </svg>
  ),
  alerts: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 2.8l6 10.4H3z" />
      <path d="M9 7v3M9 12h.01" />
    </svg>
  ),
  approvals: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="12" height="12" rx="2" />
      <path d="M6 9l2 2 4-4" />
    </svg>
  ),
  policies: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 5.5h12M3 12.5h12" />
      <circle cx="6.5" cy="5.5" r="1.8" />
      <circle cx="11.5" cy="12.5" r="1.8" />
    </svg>
  ),
  audit: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <rect x="3" y="2.5" width="12" height="13" rx="1.5" />
      <path d="M6 6h6M6 9h6M6 12h4" />
    </svg>
  ),
  builds: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M9 2.5l5.5 3v5c0 2.6-2.3 4.4-5.5 5.5-3.2-1.1-5.5-2.9-5.5-5.5v-5z" />
      <path d="M6.8 9l1.5 1.5 2.9-3" />
    </svg>
  ),
}

const GROUPS: { title: string; items: NavEntry[] }[] = [
  {
    title: '资产与身份',
    items: [
      {
        key: 'devices',
        label: '设备',
        ready: true,
        permission: 'device.read',
        icon: ICONS.devices,
      },
      { key: 'members', label: '组织与成员', ready: true, icon: ICONS.members },
      { key: 'roles', label: '角色与权限', ready: true, icon: ICONS.access },
      { key: 'addressbook', label: '地址簿', permission: 'device.read', icon: ICONS.addressbook },
    ],
  },
  {
    title: '会话与策略',
    items: [
      {
        key: 'sessions',
        label: '会话记录',
        ready: true,
        permission: 'device.read',
        icon: ICONS.sessions,
      },
      { key: 'policies', label: '连接策略', ready: true, icon: ICONS.policies },
      { key: 'approvals', label: '审批中心', ready: true, icon: ICONS.approvals },
      { key: 'alerts', label: '告警中心', ready: true, icon: ICONS.alerts },
      { key: 'access', label: '访问控制', permission: 'access.manage', icon: ICONS.access },
    ],
  },
  {
    title: '运维与审计',
    items: [
      { key: 'audit', label: '审计与日志', permission: 'audit.read', icon: ICONS.audit },
      {
        key: 'builds',
        label: '客户端生成器',
        permission: 'client_build.manage',
        icon: ICONS.builds,
      },
    ],
  },
]

const TAB_LABELS: Record<string, string> = {
  devices: '设备',
  members: '组织与成员',
  roles: '角色与权限',
  sessions: '会话记录',
  policies: '连接策略',
  approvals: '审批中心',
  alerts: '告警中心',
}
const PAGE_KEYS = Object.keys(TAB_LABELS)

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { orgId } = useParams()
  const { data: me, isLoading, error } = useGetMeQuery()
  const [collapsed, setCollapsed] = useState(false)
  const [orgOpen, setOrgOpen] = useState(false)
  // Open tabs, least-recently-used first (design D3: tabs are route handles).
  const [tabs, setTabs] = useState<string[]>(['members'])
  const tabbarRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())

  useEffect(() => {
    setLogoutHandler(() => {
      // The cache is keyed by organization, not by user: without this the next
      // account to sign in would read the previous one's members and roles.
      store.dispatch(panelApi.util.resetApiState())
      navigate('/login', { replace: true })
    })
    return () => setLogoutHandler(null)
  }, [navigate])

  useEffect(() => {
    applyThemeMode(theme)
  }, [theme])

  // A wrong organization id in the URL must not silently render the first org:
  // that made 404s look like a successful load of somebody else's scope.
  // `Number("abc")` is NaN, which is falsy: selecting on it explicitly (rather
  // than `requested ? find : first`) keeps an invalid id from showing org #1.
  const requestedOrgId = orgId === undefined ? undefined : Number(orgId)
  const current =
    orgId === undefined
      ? me?.orgs[0]
      : me?.orgs.find((org) => Number.isInteger(requestedOrgId) && org.id === requestedOrgId)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const activeKey = PAGE_KEYS.find((key) => location.pathname.endsWith(`/${key}`)) ?? 'members'

  useEffect(() => {
    setTabs((prev) => pushTab(prev, activeKey))
  }, [activeKey])

  // Overflow drops the least recently used tab; the active one never goes.
  useEffect(() => {
    const el = tabbarRef.current
    if (!el || el.clientWidth === 0) return
    const victim = evictionCandidate(tabs, activeKey)
    if (victim && el.scrollWidth > el.clientWidth + 1) setTabs((prev) => closeTabFrom(prev, victim))
  }, [tabs, activeKey])

  if (isLoading) {
    return (
      <div className="shell">
        <div
          className="main"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="help">正在加载会话…</div>
        </div>
      </div>
    )
  }
  if (error || !me) return <Navigate to="/login" replace />
  if (!current) {
    const fallback = me.orgs[0]
    return (
      <div className="shell">
        <div
          className="main"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <StateBlock
            code="404"
            title="组织不存在或你不是成员"
            description={
              requestedOrgId
                ? `当前账号不在组织 #${requestedOrgId} 中，或该组织已被删除。`
                : '当前账号还没有加入任何组织。'
            }
            actionLabel={fallback ? `前往 ${fallback.name}` : undefined}
            onAction={fallback ? () => navigate(`/orgs/${fallback.id}/members`) : undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="shell">
      <aside className="side" data-collapsed={collapsed ? 'true' : 'false'}>
        <div className="side-head">
          <div className="brand-logo">R</div>
          <div className="brand">
            <b>RustDesk Panel</b>
            <span>C O N T R O L · P A N E L</span>
          </div>
        </div>

        <nav className="side-nav">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="nav-group">{group.title}</div>
              {group.items.map((item) => {
                const allowed = item.permission ? perms.has(item.permission) : true
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`nav-item ${item.key === activeKey ? 'active' : ''}`}
                    aria-disabled={!item.ready || !allowed}
                    title={item.ready ? item.label : `${item.label}（后续波次）`}
                    onClick={() => {
                      if (!item.ready) {
                        Toast.info('该域在后续波次接入')
                        return
                      }
                      if (!allowed) {
                        Toast.warning('当前角色没有该域的权限')
                        return
                      }
                      navigate(`/orgs/${current.id}/${item.key}`)
                    }}
                  >
                    <span className="ic">{item.icon}</span>
                    <span className="txt">{item.label}</span>
                    {item.ready ? null : <span className="nav-badge soft">后续</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div className="secure-pill side-secure">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M6 1.5l4 1.6v2.7c0 2.2-1.6 4-4 4.7-2.4-.7-4-2.5-4-4.7V3.1z" />
              <path d="M4.5 6l1.1 1.1 2-2.1" />
            </svg>
            <span className="sp-txt">TLS 1.3 · 审计开启</span>
          </div>
          <div className="ver-row">
            <span className="live" />
            <span>
              API <b>v0.12.0</b> · Web <b>v0.1.0</b>
            </span>
          </div>
          <div className="copyright">© 2026 RustDesk Panel</div>
        </div>

        <button
          type="button"
          className="side-toggle"
          title={collapsed ? '展开侧栏' : '收起侧栏'}
          onClick={() => setCollapsed((v) => !v)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 4L5.5 8l4 4" />
          </svg>
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="spacer" />
          <button className="top-search" type="button" title="全局搜索（后续波次）">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="7" cy="7" r="4.4" />
              <path d="M10.4 10.4l3 3" />
            </svg>
            搜索设备 / 会话 / 成员
            <kbd>⌘K</kbd>
          </button>

          <div style={{ position: 'relative' }}>
            <button
              className="org-switch"
              type="button"
              title="切换组织"
              aria-haspopup="listbox"
              aria-expanded={orgOpen}
              onClick={() => setOrgOpen((v) => !v)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOrgOpen(false)
              }}
            >
              <span className="org-ava">{current.name.slice(0, 1).toUpperCase()}</span>
              <span className="nm">{current.name}</span>
              <span className="tag primary">{current.role_kind}</span>
              <svg
                className="chev"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M3 4.5L6 7.5l3-3" />
              </svg>
            </button>
            {orgOpen ? (
              <>
                <div className="org-scrim" onClick={() => setOrgOpen(false)} />
                <div className="org-menu">
                  {me.orgs.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      className={`org-menu-item ${org.id === current.id ? 'on' : ''}`}
                      onClick={() => {
                        setOrgOpen(false)
                        navigate(`/orgs/${org.id}/members`)
                      }}
                    >
                      <span className="org-ava">{org.name.slice(0, 1).toUpperCase()}</span>
                      <span className="nm">{org.name}</span>
                      <span className="tag primary">{org.role_kind}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="theme-switch" title="配色模式">
            <button
              type="button"
              className={theme === 'light' ? 'on' : ''}
              title="浅色"
              onClick={() => setTheme('light')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1.6v1.4M8 13v1.4M1.6 8h1.4M13 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M12.5 3.5l-1 1M4.5 11.5l-1 1" />
              </svg>
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'on' : ''}
              title="深色"
              onClick={() => setTheme('dark')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              >
                <path d="M13 9.4A5.6 5.6 0 016.6 3 5.6 5.6 0 1013 9.4z" />
              </svg>
            </button>
            <button
              type="button"
              className={theme === 'auto' ? 'on' : ''}
              title="跟随系统"
              onClick={() => setTheme('auto')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="12" height="8" rx="1.4" />
                <path d="M5.5 13.5h5M8 11v2.5" />
              </svg>
            </button>
          </div>

          <div className="user-chip">
            <div className="avatar">{me.user.email.slice(0, 1).toUpperCase()}</div>
            <div className="desk-only">
              <div className="nm">{me.user.email}</div>
              <div className="rl">{current.role_kind}</div>
            </div>
            <button className="btn tertiary sm" type="button" onClick={() => logout()}>
              退出
            </button>
          </div>
        </header>

        <div className="tabbar" role="tablist" ref={tabbarRef}>
          {tabs.map((key) => (
            <div
              key={key}
              className={`tab-item ${key === activeKey ? 'on' : ''}`}
              role="tab"
              tabIndex={0}
              aria-selected={key === activeKey}
              onClick={() => navigate(`/orgs/${current.id}/${key}`)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/orgs/${current.id}/${key}`)
                }
              }}
            >
              <span className="tt">{TAB_LABELS[key] ?? key}</span>
              {tabs.length > 1 ? (
                <button
                  className="tx"
                  type="button"
                  title="关闭"
                  onClick={(event) => {
                    event.stopPropagation()
                    const remaining = closeTabFrom(tabs, key)
                    setTabs(remaining)
                    if (key === activeKey && remaining.length > 0) {
                      navigate(`/orgs/${current.id}/${remaining[remaining.length - 1]}`)
                    }
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
