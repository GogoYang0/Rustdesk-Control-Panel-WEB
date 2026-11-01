import { Spin, Typography } from '@douyinfe/semi-ui'
import { useRef, useState } from 'react'
import { createBrowserRouter, Navigate, useNavigate, useSearchParams } from 'react-router'

import LoginPage from './features/auth/LoginPage'
import AcceptInvitationPage from './features/onboarding/AcceptInvitationPage'
import VerifyEmailPage from './features/onboarding/VerifyEmailPage'
import ResetPasswordPage from './features/onboarding/ResetPasswordPage'
import CreateOrgDialog from './features/orgs/CreateOrgDialog'
import OverviewPage from './features/overview/OverviewPage'
import AccountPage from './features/account/AccountPage'
import MembersPage from './features/members/MembersPage'
import AddressBookPage from './features/addressbooks/AddressBookPage'
import AddressBooksPage from './features/addressbooks/AddressBooksPage'
import AlertsPage from './features/alerts/AlertsPage'
import ApprovalsPage from './features/approvals/ApprovalsPage'
import AccessPage from './features/access/AccessPage'
import AuditPage from './features/audit/AuditPage'
import BuildsPage from './features/builds/BuildsPage'
import SettingsPage from './features/settings/SettingsPage'
import ControlRolesPage from './features/control-roles/ControlRolesPage'
import StrategiesPage from './features/strategies/StrategiesPage'
import LogsPage from './features/logs/LogsPage'
import DevicesPage from './features/devices/DevicesPage'
import PoliciesPage from './features/policies/PoliciesPage'
import RolesPage from './features/roles/RolesPage'
import SessionsPage from './features/sessions/SessionsPage'
import StateBlock from './components/StateBlock'
import LanguageSwitcher from './i18n/LanguageSwitcher'
import { withLocale } from './i18n/withLocale'
import AppShell from './layout/AppShell'
import { useGetMeQuery } from './store/api'

const { Title, Text } = Typography

export function RootRedirect() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const ticket = params.get('ticket')
  const oidcError = params.get('error')
  const { data, isLoading, error } = useGetMeQuery(undefined, {
    skip: Boolean(ticket || oidcError),
  })
  if (ticket || oidcError) {
    const next = new URLSearchParams()
    if (ticket) next.set('ticket', ticket)
    if (oidcError) next.set('error', oidcError)
    return <Navigate to={`/login?${next.toString()}`} replace />
  }
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }
  if (error || !data) return <Navigate to="/login" replace />
  const first = data.orgs[0]
  if (!first) {
    return (
      <>
        <LanguageSwitcher floating />
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-[520px]">
            <Title heading={4}>还没有组织</Title>
            <Text type="tertiary" size="small">
              当前账号 {data.user.email} 尚未加入任何组织。
            </Text>
            <div className="mt-4">
              <button
                ref={createButtonRef}
                className="btn primary"
                type="button"
                onClick={() => setCreateOpen(true)}
              >
                创建组织
              </button>
            </div>
            <Text type="tertiary" size="small">
              创建后你自动成为该组织的 Owner；组织名称可以重复，数据完全隔离。
            </Text>
          </div>
        </div>
        {createOpen ? (
          <CreateOrgDialog
            onClose={() => {
              setCreateOpen(false)
              createButtonRef.current?.focus()
            }}
            onCreated={(org) => navigate(`/orgs/${org.id}/overview`)}
          />
        ) : null}
      </>
    )
  }
  return <Navigate to={`/orgs/${first.id}/overview`} replace />
}

function NotFoundPage() {
  return (
    <StateBlock
      code="404"
      title="页面不存在"
      description="该地址没有对应的控制台页面，请从左侧导航进入。"
    />
  )
}

export const router = createBrowserRouter([
  { path: '/login', Component: withLocale(LoginPage) },
  { path: '/verify-email', Component: withLocale(VerifyEmailPage) },
  { path: '/reset-password', Component: withLocale(ResetPasswordPage) },
  { path: '/accept-invitation', Component: withLocale(AcceptInvitationPage) },
  { path: '/', Component: withLocale(RootRedirect) },
  {
    path: '/orgs/:orgId',
    Component: withLocale(AppShell),
    children: [
      { index: true, element: <Navigate to="overview" replace /> },
      { path: 'overview', Component: withLocale(OverviewPage) },
      { path: 'members', Component: withLocale(MembersPage) },
      { path: 'roles', Component: withLocale(RolesPage) },
      { path: 'devices', Component: withLocale(DevicesPage) },
      { path: 'sessions', Component: withLocale(SessionsPage) },
      { path: 'policies', Component: withLocale(PoliciesPage) },
      { path: 'strategies', Component: withLocale(StrategiesPage) },
      { path: 'approvals', Component: withLocale(ApprovalsPage) },
      { path: 'alerts', Component: withLocale(AlertsPage) },
      { path: 'audit', Component: withLocale(AuditPage) },
      { path: 'logs', Component: withLocale(LogsPage) },
      { path: 'builds', Component: withLocale(BuildsPage) },
      { path: 'access', Component: withLocale(AccessPage) },
      { path: 'control-roles', Component: withLocale(ControlRolesPage) },
      { path: 'address-books', Component: withLocale(AddressBooksPage) },
      { path: 'address-books/:bookId', Component: withLocale(AddressBookPage) },
      { path: 'account', Component: withLocale(AccountPage) },
      { path: 'settings', Component: withLocale(SettingsPage) },
      { path: '*', Component: withLocale(NotFoundPage) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
