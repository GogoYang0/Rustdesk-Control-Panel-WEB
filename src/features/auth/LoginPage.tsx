import { Button, Form, Toast, Typography } from '@douyinfe/semi-ui'
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router'

import { ApiError, login } from '../../lib/api'
import { setTokens } from '../../lib/session'
import { panelApi } from '../../store/api'

const { Title, Text } = Typography

interface Credentials {
  email: string
  password: string
}

export default function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function onSubmit(values: Credentials) {
    setSubmitting(true)
    setError(null)
    try {
      const pair = await login(values.email.trim(), values.password)
      setTokens(pair)
      // The cached /me is stale after a login; drop it so the shell refetches.
      dispatch(panelApi.util.invalidateTags(['Me']))
      navigate('/', { replace: true })
    } catch (err) {
      const e = err as ApiError
      setError(loginMessage(e))
      Toast.error(loginMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--semi-color-fill-0)] p-6">
      <div className="w-full max-w-[380px] rounded-xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] p-8 shadow-lg">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--semi-color-primary)] text-sm font-bold text-white">
            R
          </span>
          <Text strong>RustDesk Panel</Text>
        </div>
        <Title heading={4} className="!mb-1 !mt-4">
          登录管理台
        </Title>
        <Text type="tertiary" size="small">
          部署级单点登录与企业目录由后端配置，启用后在此出现入口。
        </Text>

        <Form<Credentials>
          className="mt-6"
          initValues={{ email: '', password: '' }}
          onSubmit={onSubmit}
        >
          <Form.Input
            field="email"
            label="邮箱"
            placeholder="name@company.com"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
            autoComplete="username"
          />
          <Form.Input
            field="password"
            label="密码"
            mode="password"
            placeholder="至少 8 位"
            rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '至少 8 位' }]}
            autoComplete="current-password"
          />
          {error ? (
            <div className="mb-2 rounded-md border border-[var(--semi-color-danger-light-default)] bg-[var(--semi-color-danger-light-default)] px-3 py-2 text-xs text-[var(--semi-color-danger)]">
              {error}
            </div>
          ) : null}
          <Button theme="solid" type="primary" htmlType="submit" block loading={submitting}>
            登录
          </Button>
        </Form>

        <p className="mt-4 text-xs text-[var(--semi-color-text-2)]">
          令牌策略：access 仅存内存，refresh 存 localStorage；刷新页面自动续期。
        </p>
      </div>
    </div>
  )
}

function loginMessage(err: ApiError): string {
  switch (err.code) {
    case 'email_not_verified':
      return '邮箱尚未验证，请先完成邮件验证。'
    case 'captcha_required':
    case 'captcha_invalid':
      return '需要完成交互式验证码。'
    case 'rate_limited':
      return '尝试过于频繁，请稍后再试。'
    case 'unauthorized':
      return '邮箱或密码不正确。'
    default:
      return err.message || '登录失败，请稍后再试。'
  }
}
