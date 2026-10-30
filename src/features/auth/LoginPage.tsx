import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router'

import {
  ApiError,
  beginPasskeyLogin,
  fetchCaptcha,
  fetchProviders,
  finishPasskeyLogin,
  login,
  verifyTwoFactor,
  type TwoFactorChallenge,
} from '../../lib/api'
import {
  assertPasskeyCredential,
  webAuthnErrorMessage,
  webAuthnSupported,
  type RequestOptions,
} from '../../lib/webauthn'
import { setTokens } from '../../lib/session'
import { panelApi } from '../../store/api'

type Step = 'credentials' | 'totp'

export default function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('credentials')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [methods, setMethods] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [providers, setProviders] = useState<string[]>([])

  useEffect(() => {
    // Both probes are best-effort: a slow panel must not block the form.
    fetchCaptcha()
      .then((info) => setCaptchaEnabled(info.enabled))
      .catch(() => setCaptchaEnabled(false))
    fetchProviders()
      .then((info) => {
        const names: string[] = []
        if (info.oidc?.enabled) names.push(info.oidc.name ? `OIDC · ${info.oidc.name}` : 'OIDC')
        if (info.ldap?.enabled) names.push('LDAP')
        setProviders(names)
      })
      .catch(() => setProviders([]))
  }, [])

  function finish(accessToken: string, refreshToken: string) {
    setTokens({ access_token: accessToken, refresh_token: refreshToken })
    // The cache is keyed by resource, not by user: signing in as another account
    // from /login must not serve the previous account's passkeys or org data.
    dispatch(panelApi.util.resetApiState())
    navigate('/', { replace: true })
  }

  async function onSubmitCredentials(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const pair = await login(email.trim(), password)
      finish(pair.access_token, pair.refresh_token)
    } catch (err) {
      const apiError = err as ApiError
      if (apiError.code === 'two_factor_required') {
        // The account has TOTP: the server hands back a short-lived challenge
        // token and issues no token pair until the code is verified.
        const detail = apiError.detail as TwoFactorChallenge | undefined
        if (detail?.challenge_token) {
          setChallenge(detail.challenge_token)
          setMethods(detail.methods ?? [])
          setStep('totp')
          setCode('')
          return
        }
      }
      const message = loginMessage(apiError)
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function finishPasskey(ceremony: Awaited<ReturnType<typeof beginPasskeyLogin>>) {
    const credential = await assertPasskeyCredential(ceremony.options as unknown as RequestOptions)
    const pair = await finishPasskeyLogin({
      ceremony_token: ceremony.ceremony_token,
      credential,
    })
    finish(pair.access_token, pair.refresh_token)
  }

  async function onPasskeyLogin() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await finishPasskey(await beginPasskeyLogin({ email: email.trim() || undefined }))
    } catch (err) {
      const message = passkeyFailureMessage(err, 'discoverable')
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onPasskeySecondFactor() {
    if (submitting || !challenge) return
    setSubmitting(true)
    setError(null)
    try {
      await finishPasskey(await beginPasskeyLogin({ challenge_token: challenge }))
    } catch (err) {
      const message = passkeyFailureMessage(err, 'second-factor')
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitCode(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || !challenge) return
    setSubmitting(true)
    setError(null)
    try {
      const pair = await verifyTwoFactor(challenge, code.trim())
      finish(pair.access_token, pair.refresh_token)
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
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            >
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
          {step === 'credentials' ? (
            <form className="login-card" onSubmit={onSubmitCredentials}>
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

              {captchaEnabled ? (
                <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
                  <div>
                    该部署启用了交互式验证码，控制台将在后续波次支持；请暂时使用 API 或等待更新。
                  </div>
                </div>
              ) : null}

              <div className="field mb-14">
                <label className="form-label" htmlFor="login-email">
                  <span className="req">*</span>邮箱
                </label>
                <div className="input lg" style={{ height: 40 }}>
                  <input
                    id="login-email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </div>

              <div className="field mb-14">
                <label className="form-label" htmlFor="login-password">
                  <span className="req">*</span>密码
                </label>
                <div className="input lg" style={{ height: 40 }}>
                  <input
                    id="login-password"
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

              <button
                className="btn primary lg block"
                type="submit"
                disabled={submitting || captchaEnabled}
              >
                {submitting ? '登录中…' : '登录'}
              </button>

              <div className="divider">
                <span>或</span>
              </div>
              <button
                className="btn outline lg block"
                type="button"
                disabled
                title={
                  providers.length
                    ? `部署已启用 ${providers.join(' / ')}，控制台对接将在后续波次完成`
                    : '未启用外部身份源'
                }
              >
                {providers.length
                  ? `使用 ${providers.join(' / ')} 登录（后续）`
                  : '使用企业 SSO 登录'}
              </button>
              {webAuthnSupported() ? (
                <button
                  className="btn tertiary lg block"
                  type="button"
                  style={{ marginTop: 8 }}
                  disabled={submitting}
                  title="邮箱可留空，使用设备上的可发现凭据直接登录"
                  onClick={() => void onPasskeyLogin()}
                >
                  使用 Passkey 登录
                </button>
              ) : null}
              <p className="help" style={{ textAlign: 'center', margin: '18px 0 0' }}>
                没有账号？请联系组织管理员邀请你加入
              </p>
            </form>
          ) : (
            <form className="login-card" onSubmit={onSubmitCode}>
              <h3>两步验证</h3>
              <p className="help" style={{ margin: '0 0 20px' }}>
                账号已启用 TOTP，请输入 6 位动态码或一次性恢复码
              </p>

              {error ? (
                <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
                  <div>
                    <span className="t">{error}</span>
                  </div>
                </div>
              ) : null}

              <div className="field mb-14">
                <label className="form-label" htmlFor="login-code">
                  <span className="req">*</span>动态码
                </label>
                <div className="input lg" style={{ height: 40 }}>
                  <input
                    id="login-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                  />
                </div>
                <div className="help">挑战令牌 5 分钟内有效；每个动态码仅在其时间步内可用。</div>
              </div>

              <button className="btn primary lg block" type="submit" disabled={submitting}>
                {submitting ? '校验中…' : '验证并登录'}
              </button>
              {webAuthnSupported() && methods.includes('passkey') ? (
                <button
                  className="btn outline lg block"
                  type="button"
                  style={{ marginTop: 8 }}
                  disabled={submitting}
                  onClick={() => void onPasskeySecondFactor()}
                >
                  使用 Passkey 验证
                </button>
              ) : null}
              <button
                className="btn tertiary block"
                type="button"
                style={{ marginTop: 8 }}
                disabled={submitting}
                onClick={() => {
                  setStep('credentials')
                  setChallenge(null)
                  setMethods([])
                  setCode('')
                  setError(null)
                }}
              >
                返回
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// WebAuthn throws DOMException; fetch throws TypeError; only the latter is a
// network problem. ApiError is the server answering with a status.
type PasskeyLoginMode = 'discoverable' | 'second-factor'

function passkeyFailureMessage(err: unknown, mode: PasskeyLoginMode): string {
  if (err instanceof ApiError) return passkeyLoginMessage(err, mode)
  if (err instanceof DOMException) return webAuthnErrorMessage(err)
  return '网络异常，请稍后重试'
}

function passkeyLoginMessage(err: ApiError, mode: PasskeyLoginMode): string {
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 503) return '该部署未启用 Passkey 登录'
  if (err.status === 409) {
    // The server returns 409 only when the account has no credential; an
    // expired challenge is a 401 from ParseChallenge.
    return mode === 'second-factor'
      ? '该账户没有可用的 Passkey，请改用动态码或返回重新登录'
      : '该账户没有可用的 Passkey'
  }
  if (err.status === 429) return '尝试过于频繁，请稍后再试'
  if (err.status === 401) {
    return mode === 'second-factor'
      ? '验证挑战已失效或未通过，请返回重新登录'
      : 'Passkey 验证失败，请重试'
  }
  if (err.status >= 500) return '服务异常，请稍后重试'
  if (err.code === 'email_not_verified') return '邮箱尚未验证，请先完成邮件验证'
  return loginMessage(err)
}

function loginMessage(err: ApiError): string {
  switch (err.code) {
    case 'email_not_verified':
      return '邮箱尚未验证，请先完成邮件验证'
    case 'captcha_required':
    case 'captcha_invalid':
      return '需要完成交互式验证码'
    case 'captcha_unavailable':
      return '验证码服务不可用，请稍后再试'
    case 'rate_limited':
      return '尝试过于频繁，请稍后再试'
    case 'two_factor_required':
      return '需要两步验证'
    case 'unauthorized':
      return '邮箱或密码不正确'
    default:
      return err.message || '登录失败，请稍后再试'
  }
}
