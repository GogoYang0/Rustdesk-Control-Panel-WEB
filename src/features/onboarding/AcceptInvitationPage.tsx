import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { acceptInvitation, ApiError, fetchCaptcha, type Member } from '../../lib/api'
import { MIN_PASSWORD_LENGTH, passwordLength } from '../../lib/account-security'
import {
  acceptInvitationError,
  clearTokenParam,
  INVITATION_CAPTCHA_NOTICE,
} from '../../lib/onboarding'

export default function AcceptInvitationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [token, setToken] = useState<string | null>(() => searchParams.get('token'))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState<Member | null>(null)
  const [captchaEnabled, setCaptchaEnabled] = useState<boolean | null>(null)
  const [captchaProbeFailed, setCaptchaProbeFailed] = useState(false)
  const captchaBlocked = captchaEnabled === true
  // Unknown while the probe is in flight; a failed probe may still try because
  // the server answers captcha_required without consuming the invitation.
  const captchaPending = captchaEnabled === null && !captchaProbeFailed

  // The invitation token is a one-shot credential: keep it in memory only and
  // drop it from the address bar before the user starts typing.
  useEffect(() => {
    clearTokenParam(searchParams, setSearchParams)
  }, [])

  useEffect(() => {
    if (!token) return
    fetchCaptcha()
      .then((info) => setCaptchaEnabled(info.enabled))
      .catch(() => {
        setCaptchaEnabled(null)
        setCaptchaProbeFailed(true)
      })
  }, [])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || !token || captchaBlocked || captchaPending) return
    if (passwordLength(password) < MIN_PASSWORD_LENGTH) {
      setError(`密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`)
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const member = await acceptInvitation(token, password)
      setAccepted(member)
      setPassword('')
      setConfirm('')
      setToken(null)
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'captcha_required' || err.code === 'captcha_invalid')
      ) {
        // The deployment needs a proof this wave cannot produce: stop
        // resubmitting and show the same 17c limit as the probe path.
        setCaptchaEnabled(true)
        setError('')
      } else {
        setError(acceptInvitationError(err))
      }
      if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        setPassword('')
        setConfirm('')
      }
      if (err instanceof ApiError && err.status === 409) setToken(null)
    } finally {
      setSubmitting(false)
    }
  }

  const roleName = accepted?.role_name?.trim() || accepted?.role?.trim() || ''

  return (
    <div className="login-page">
      <div className="login-wrap onboarding-wrap">
        <div className="login-form">
          <div className="login-card">
            <div className="hstack" style={{ gap: 10, marginBottom: 18 }}>
              <div className="brand-logo" style={{ width: 32, height: 32, borderRadius: 9 }}>
                R
              </div>
              <b style={{ fontSize: 14 }}>RustDesk Panel</b>
            </div>
            <h3>接受组织邀请</h3>

            {accepted ? (
              <>
                <div className="banner info mb-14" role="status">
                  <div>
                    已加入组织{roleName ? `，角色：${roleName}` : ''}。
                    <div className="help" style={{ marginTop: 4 }}>
                      登录邮箱：{accepted.email}
                    </div>
                  </div>
                </div>
                <p className="help" style={{ margin: '0 0 16px' }}>
                  邀请已接受，但不会自动登录。若这是新建账号，请先查收验证邮件并完成验证；已有账号如邮箱尚未验证也需先完成验证。
                </p>
                <Link className="btn primary lg block" to="/login">
                  去登录
                </Link>
              </>
            ) : !token ? (
              <>
                <p className="help" style={{ margin: '0 0 16px' }}>
                  设置或验证本地密码后即可加入组织。
                </p>
                <div className="banner danger mb-14" role="alert">
                  <div>{error || '邀请链接不完整或无效，请联系管理员重新邀请。'}</div>
                </div>
                <Link className="btn primary lg block" to="/login">
                  去登录
                </Link>
              </>
            ) : (
              <form onSubmit={onSubmit}>
                <p className="help" style={{ margin: '0 0 16px' }}>
                  设置或验证本地密码后即可加入组织；接受邀请不会自动登录。
                </p>

                <div className="banner info mb-14">
                  <div>
                    已有账号：请输入该账号当前的本地密码；新账号：这里设置的密码将作为登录密码（至少{' '}
                    {MIN_PASSWORD_LENGTH} 位）。仅使用 Passkey、没有本地密码的账号无法接受邀请。
                  </div>
                </div>

                {captchaEnabled === true ? (
                  <div className="banner warning mb-14">
                    <div>{INVITATION_CAPTCHA_NOTICE}</div>
                  </div>
                ) : captchaEnabled === null ? (
                  <div className="help mb-14">
                    {captchaProbeFailed
                      ? '无法确认验证码状态；提交时如要求验证码会给出提示。'
                      : '正在确认验证码状态…'}
                  </div>
                ) : null}

                {error ? (
                  <div className="banner danger mb-14" role="alert">
                    <div>{error}</div>
                  </div>
                ) : null}

                <div className="field mb-14">
                  <label className="form-label" htmlFor="invite-password">
                    <span className="req">*</span>密码
                  </label>
                  <div className="input lg" style={{ height: 40 }}>
                    <input
                      id="invite-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
                      autoComplete="new-password"
                      disabled={submitting || captchaBlocked || captchaPending}
                      required
                    />
                  </div>
                </div>

                <div className="field mb-14">
                  <label className="form-label" htmlFor="invite-confirm">
                    <span className="req">*</span>确认密码
                  </label>
                  <div className="input lg" style={{ height: 40 }}>
                    <input
                      id="invite-confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      disabled={submitting || captchaBlocked || captchaPending}
                      required
                    />
                  </div>
                </div>

                <button
                  className="btn primary lg block"
                  type="submit"
                  disabled={submitting || captchaBlocked || captchaPending}
                >
                  {submitting ? '提交中…' : '接受邀请'}
                </button>
                <Link className="btn tertiary block" style={{ marginTop: 8 }} to="/login">
                  去登录
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
