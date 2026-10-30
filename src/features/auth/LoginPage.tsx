import { Toast } from '@douyinfe/semi-ui'

import { redirectTo } from '../../lib/browser'
import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router'

import {
  ApiError,
  beginPasskeyLogin,
  exchangeOidcLogin,
  fetchCaptcha,
  fetchProviders,
  finishPasskeyLogin,
  ldapLogin,
  login,
  startOidcLogin,
  verifyTwoFactor,
  type AuthProviders,
  type TwoFactorChallenge,
} from '../../lib/api'
import {
  assertPasskeyCredential,
  webAuthnErrorMessage,
  webAuthnSupported,
  type RequestOptions,
} from '../../lib/webauthn'
import {
  ldapLoginError,
  oidcCallbackError,
  oidcExchangeError,
  oidcStartError,
} from '../../lib/login-errors'
import { setTokens, type TokenPair } from '../../lib/session'
import { panelApi } from '../../store/api'

type Step = 'credentials' | 'totp'
type LoginMode = 'local' | 'ldap'

export default function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('credentials')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [methods, setMethods] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captchaEnabled, setCaptchaEnabled] = useState<boolean | null>(null)
  const [providers, setProviders] = useState<AuthProviders | null>(null)
  const [providersError, setProvidersError] = useState(false)
  const [captchaProbeFailed, setCaptchaProbeFailed] = useState(false)
  const [mode, setMode] = useState<LoginMode>('local')
  const [ldapUsername, setLdapUsername] = useState('')
  const [ldapPassword, setLdapPassword] = useState('')
  const handledCallbackRef = useRef(false)

  // OIDC callback: the ticket is a one-shot 60s credential. Strip it from the
  // URL and exchange it exactly once (StrictMode re-runs this effect).
  useEffect(() => {
    const ticket = searchParams.get('ticket')
    const errorCode = searchParams.get('error')
    if (!ticket && !errorCode) return
    if (handledCallbackRef.current) return
    handledCallbackRef.current = true
    const next = new URLSearchParams(searchParams)
    next.delete('ticket')
    next.delete('error')
    setSearchParams(next, { replace: true })
    if (!ticket) {
      setError(oidcCallbackError(errorCode))
      return
    }
    void completeOidcLogin(ticket)
  }, [])

  useEffect(() => {
    // Both probes are best-effort: a slow panel must not block the form.
    fetchCaptcha()
      .then((info) => setCaptchaEnabled(info.enabled))
      .catch(() => {
        setCaptchaEnabled(null)
        setCaptchaProbeFailed(true)
      })
    fetchProviders()
      .then((info) => setProviders(info))
      .catch(() => setProvidersError(true))
  }, [])

  function finish(pair: TokenPair) {
    setTokens(pair)
    // The cache is keyed by resource, not by user: signing in as another account
    // from /login must not serve the previous account's passkeys or org data.
    dispatch(panelApi.util.resetApiState())
    navigate('/', { replace: true })
  }

  function beginSecondFactor(err: unknown): boolean {
    if (!(err instanceof ApiError) || err.code !== 'two_factor_required') return false
    const detail = err.detail as TwoFactorChallenge | undefined
    if (!detail?.challenge_token) return false
    setChallenge(detail.challenge_token)
    setMethods(detail.methods ?? [])
    setStep('totp')
    setCode('')
    setError(null)
    return true
  }

  async function completeOidcLogin(ticket: string) {
    setSubmitting(true)
    setError(null)
    try {
      finish(await exchangeOidcLogin({ ticket }))
    } catch (err) {
      if (beginSecondFactor(err)) return
      const message = oidcExchangeError(err)
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitCredentials(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || mode !== 'local') return
    setSubmitting(true)
    setError(null)
    try {
      const pair = await login(email.trim(), password)
      finish(pair)
    } catch (err) {
      if (beginSecondFactor(err)) return
      const message = loginMessage(err as ApiError)
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitLdap(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || mode !== 'ldap') return
    if (captchaEnabled !== false) return
    if (!ldapUsername.trim() || !ldapPassword) {
      setError('请输入目录用户名和密码')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const pair = await ldapLogin({
        username: ldapUsername.trim(),
        password: ldapPassword,
      })
      finish(pair)
    } catch (err) {
      setLdapPassword('')
      if (beginSecondFactor(err)) return
      const message = ldapLoginError(err)
      setError(message)
      Toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function onOidcLogin() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const start = await startOidcLogin({ redirect_path: '/login' })
      redirectTo(start.authorization_url)
    } catch (err) {
      const message = oidcStartError(err)
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
    finish(pair)
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
      finish(pair)
    } catch (err) {
      const message = twoFactorMessage(err)
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
            <form
              className="login-card"
              onSubmit={mode === 'ldap' ? onSubmitLdap : onSubmitCredentials}
            >
              <h3>{mode === 'ldap' ? '目录账号登录' : '登录 RustDesk Panel'}</h3>
              <p className="help" style={{ margin: '0 0 20px' }}>
                {mode === 'ldap'
                  ? `使用 ${providers?.ldap?.name ?? 'LDAP'} 账号继续`
                  : '使用组织分配的账号继续'}
              </p>

              {providers?.ldap?.enabled ? (
                <div className="hstack mb-14" role="group" aria-label="登录方式" style={{ gap: 6 }}>
                  <button
                    className={`btn sm ${mode === 'local' ? 'primary' : 'borderless'}`}
                    type="button"
                    aria-pressed={mode === 'local'}
                    disabled={submitting}
                    onClick={() => {
                      setMode('local')
                      setError(null)
                      setLdapPassword('')
                    }}
                  >
                    本地账号
                  </button>
                  <button
                    className={`btn sm ${mode === 'ldap' ? 'primary' : 'borderless'}`}
                    type="button"
                    aria-pressed={mode === 'ldap'}
                    disabled={submitting}
                    onClick={() => {
                      setMode('ldap')
                      setError(null)
                      setLdapPassword('')
                    }}
                  >
                    目录账号
                  </button>
                </div>
              ) : null}

              {error ? (
                <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
                  <div>
                    <span className="t">{error}</span>
                  </div>
                </div>
              ) : null}

              {captchaEnabled === true ? (
                <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
                  <div>
                    该部署启用了交互式验证码，密码与目录登录暂不支持。
                    {providers?.oidc?.enabled
                      ? ' OIDC 登录（账户无本地 TOTP 时）仍可用。'
                      : ' 请暂时使用 API 或等待更新。'}
                  </div>
                </div>
              ) : null}

              {mode === 'ldap' && captchaEnabled === null ? (
                <div className="help mb-14">
                  {captchaProbeFailed
                    ? '无法确认验证码状态，目录登录暂不可用；密码登录仍可用。'
                    : '正在确认验证码状态，目录登录暂不可用。'}
                </div>
              ) : null}

              {providersError ? (
                <div className="help mb-14">
                  {captchaEnabled === true
                    ? '无法读取外部身份状态。'
                    : '无法读取外部身份状态；密码登录仍可用。'}
                </div>
              ) : null}

              {mode === 'local' ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="field mb-14">
                    <label className="form-label" htmlFor="ldap-username">
                      <span className="req">*</span>目录用户名
                    </label>
                    <div className="input lg" style={{ height: 40 }}>
                      <input
                        id="ldap-username"
                        autoComplete="username"
                        value={ldapUsername}
                        onChange={(e) => setLdapUsername(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="field mb-14">
                    <label className="form-label" htmlFor="ldap-password">
                      <span className="req">*</span>目录密码
                    </label>
                    <div className="input lg" style={{ height: 40 }}>
                      <input
                        id="ldap-password"
                        type="password"
                        value={ldapPassword}
                        onChange={(e) => setLdapPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                className="btn primary lg block"
                type="submit"
                disabled={
                  submitting ||
                  (mode === 'ldap' ? captchaEnabled !== false : captchaEnabled === true)
                }
              >
                {submitting ? '登录中…' : mode === 'ldap' ? '目录登录' : '登录'}
              </button>

              {mode === 'local' && providers?.oidc?.enabled ? (
                <>
                  <div className="divider">
                    <span>或</span>
                  </div>
                  <button
                    className="btn outline lg block"
                    type="button"
                    disabled={submitting}
                    onClick={() => void onOidcLogin()}
                  >
                    使用 {providers.oidc?.name ?? 'OIDC'} 登录
                  </button>
                </>
              ) : null}

              {mode === 'local' && webAuthnSupported() ? (
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

              <div
                id="totp-captcha-hint"
                role="status"
                aria-live="polite"
                className={captchaEnabled === true ? 'banner warning mb-14' : 'help mb-14'}
                style={captchaEnabled === true ? { padding: '9px 11px' } : undefined}
              >
                {captchaEnabled === true
                  ? '该部署启用了交互式验证码；TOTP 第二步需要验证码 proof，控制台将在 17c 接入，当前无法完成。'
                  : captchaEnabled === null
                    ? '正在确认验证码状态；若部署启用了验证码，TOTP 第二步将无法完成。'
                    : ''}
              </div>

              <div className="field mb-14">
                <label className="form-label" htmlFor="login-code">
                  <span className="req">*</span>动态码
                </label>
                <div className="input lg" style={{ height: 40 }}>
                  <input
                    id="login-code"
                    aria-describedby="totp-captcha-hint"
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

function twoFactorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return '网络异常，请稍后重试'
  if (err.status === 0) return '网络异常，请稍后重试'
  if (err.status === 401) return '动态码或恢复码不正确'
  if (err.status === 429) return '验证过于频繁，请稍后再试'
  if (err.status >= 500) return '服务异常，请稍后重试'
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
      return '登录失败，请稍后再试'
  }
}
