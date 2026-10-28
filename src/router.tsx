import { Banner, Spin, Typography } from '@douyinfe/semi-ui'
import { createBrowserRouter, Navigate } from 'react-router'

import LoginPage from './features/auth/LoginPage'
import MembersPage from './features/members/MembersPage'
import DevicesPage from './features/devices/DevicesPage'
import RolesPage from './features/roles/RolesPage'
import SessionsPage from './features/sessions/SessionsPage'
import StateBlock from './components/StateBlock'
import AppShell from './layout/AppShell'
import { useGetMeQuery } from './store/api'

const { Title, Text } = Typography

function RootRedirect() {
  const { data, isLoading, error } = useGetMeQuery()
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
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-[520px]">
          <Title heading={4}>还没有组织</Title>
          <Text type="tertiary" size="small">
            当前账号 {data.user.email} 尚未加入任何组织。
          </Text>
          <Banner
            className="mt-4"
            type="info"
            closeIcon={null}
            description="创建组织与邀请成员将在后续波次接入；后端可用 POST /api/v1/orgs 先建立组织。"
          />
        </div>
      </div>
    )
  }
  return <Navigate to={`/orgs/${first.id}/members`} replace />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <RootRedirect /> },
  {
    path: '/orgs/:orgId',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="members" replace /> },
      { path: 'members', element: <MembersPage /> },
      { path: 'roles', element: <RolesPage /> },
      { path: 'devices', element: <DevicesPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      {
        path: '*',
        element: (
          <StateBlock
            code="404"
            title="页面不存在"
            description="该地址没有对应的控制台页面，请从左侧导航进入。"
          />
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
