import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router'

import { ApiError, login } from '../../lib/api'
import { setTokens } from '../../lib/session'
import { panelApi } from '../../store/api'

export default function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const pair = await login(email.trim(), password)
      setTokens(pair)
      dispatch(panelApi.util.invalidateTags(['Me']))
      navigate('/', { replace: true })
    } catch (err) {
      const message = loginMessage(err as ApiError)
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrap">
      <div className="login-brand">
        <div className="hstack" style={{ gap: 11 }}>
          <div className="brand-logo" style={{ width: 38, height: 38, borderRadius: 10 }}>
            R
          </div>
          <div>
            <b style={{ fontSize: 15, display: 'block', lineHeight: '20px' }}>RustDesk Panel</b>
            <span style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,.55)' }}>
              C O N T R O L · P A N E L
            </span>
          </div>
        </div>
        <h2>
          把每一次远程连接
          <br />
          纳入可审计的治理闭环
        </h2>
        <p>连接票据 · 连接策略 · 审批中心 · 违规告警。面向多组织的 RustDesk 服务端控制面板。</p>
        <div className="login-feats">
          <div className="lf">
            <div className="lf-ic">◎</div>
            <div>
              <b>会话可追溯</b>
              <span>panel 与原生连接统一记录，时间线可回放</span>
            </div>
          </div>
          <div className="lf">
            <div className="lf-ic">◈</div>
            <div>
              <b>策略即代码</b>
              <span>时段 / 并发 / 时长三维策略，审批可追认</span>
            </div>
          </div>
          <div className="lf">
            <div className="lf-ic">◇</div>
            <div>
              <b>安全默认开启</b>
              <span>TLS 1.3 · AES-256 · 全量审计留痕</span>
            </div>
          </div>
        </div>
        <div className="login-secure">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
            <path d="M12 2.5l8 3.2v5.6c0 4.6-3.3 8.2-8 9.7-4.7-1.5-8-5.1-8-9.7V5.7z" />
            <path d="M9 11.6l2.2 2.2 4-4.4" />
          </svg>
          <div>
            <b>安全基线</b>
            <span>所有操作写入不可篡改审计链 · 会话吊销即时生效</span>
          </div>
        </div>
      </div>

      <div className="login-form">
        <form className="login-card" onSubmit={onSubmit}>
          <h3>登录 RustDesk Panel</h3>
          <p className="help" style={{ margin: '0 0 20px' }}>
            使用组织分配的账号继续
          </p>

          {error ? (
            <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
              <div>
                <span className="t">{error}</span>
              </div>
            </div>
          ) : null}

          <div className="field mb-14">
            <label className="form-label">
              <span className="req">*</span>邮箱
            </label>
            <div className="input lg" style={{ height: 40 }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="field mb-14">
            <label className="form-label">
              <span className="req">*</span>密码
            </label>
            <div className="input lg" style={{ height: 40 }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </div>
          </div>

          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
            <label className={`check ${remember ? 'on' : ''}`} onClick={() => setRemember((v) => !v)}>
              <i>{remember ? '✓' : ''}</i>30 天内保持登录
            </label>
            <a href="#" style={{ fontSize: 12.5, color: 'var(--primary)' }} onClick={(e) => e.preventDefault()}>
              忘记密码？
            </a>
          </div>

          <button className="btn primary lg block" type="submit" disabled={submitting}>
            {submitting ? '登录中…' : '登录'}
          </button>

          <div className="divider">
            <span>或</span>
          </div>
          <button className="btn outline lg block" type="button" disabled title="按部署配置启用（OIDC / LDAP / Passkey）">
            使用企业 SSO 登录
          </button>
          <p className="help" style={{ textAlign: 'center', margin: '18px 0 0' }}>
            没有账号？请联系组织管理员邀请你加入
          </p>
        </form>
      </div>
      </div>
    </div>
  )
}

function loginMessage(err: ApiError): string {
  switch (err.code) {
    case 'email_not_verified':
      return '邮箱尚未验证，请先完成邮件验证'
    case 'captcha_required':
    case 'captcha_invalid':
      return '需要完成交互式验证码'
    case 'rate_limited':
      return '尝试过于频繁，请稍后再试'
    case 'unauthorized':
      return '邮箱或密码不正确'
    default:
      return err.message || '登录失败，请稍后再试'
  }
}
