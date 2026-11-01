import { useRef, useState } from 'react'
import { Link } from 'react-router'

import { resetPassword } from '../../lib/api'
import {
  passwordResetError,
  passwordResetProblem,
  PASSWORD_MAX,
  readHashToken,
} from '../../lib/password-reset'

const INVALID_LINK = '重置链接不完整或无效，请让管理员重新发送。'

export default function ResetPasswordPage() {
  // Read once during the first render: StrictMode replays effects, and a
  // second read after the fragment was cleared would look like a bad link.
  const initial = useRef<string | null>(null)
  if (initial.current === null) initial.current = readHashToken()
  const [token, setToken] = useState(initial.current)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(initial.current.length < 16 ? INVALID_LINK : '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const busyRef = useRef(false)

  async function submit() {
    if (busyRef.current || token.length < 16) return
    const problem = passwordResetProblem(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
      setToken('')
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(passwordResetError(err))
      // A used/expired link cannot be retried; drop the token so the page
      // only offers the login entry.
      if ((err as { status?: number }).status === 409) setToken('')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const invalid = token.length < 16

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
            <h3>重置密码</h3>
            <p className="help" style={{ margin: '0 0 20px' }}>
              设置新的登录密码后，现有登录会话会被撤销。
            </p>

            {done ? (
              <>
                <div className="banner info mb-14" role="status">
                  <div>密码已重置，请使用新密码登录。</div>
                </div>
                <Link className="btn primary lg block" to="/login">
                  去登录
                </Link>
              </>
            ) : invalid ? (
              <>
                <div className="banner danger mb-14" role="alert">
                  <div>{error || INVALID_LINK}</div>
                </div>
                <Link className="btn primary lg block" to="/login">
                  去登录
                </Link>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
              >
                {error ? (
                  <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
                    <div>{error}</div>
                  </div>
                ) : null}
                <div className="field mb-14">
                  <label className="form-label" htmlFor="reset-password">
                    <span className="req">*</span>新密码
                  </label>
                  <div className="input">
                    <input
                      id="reset-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      aria-label="新密码"
                      onChange={(event) => {
                        setPassword(event.target.value)
                        if (error) setError('')
                      }}
                    />
                  </div>
                  <div className="help" style={{ textAlign: 'right' }}>
                    {[...password].length}/{PASSWORD_MAX}
                  </div>
                </div>
                <div className="field mb-14">
                  <label className="form-label" htmlFor="reset-password-confirm">
                    <span className="req">*</span>确认新密码
                  </label>
                  <div className="input">
                    <input
                      id="reset-password-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      aria-label="确认新密码"
                      onChange={(event) => {
                        setConfirm(event.target.value)
                        if (error) setError('')
                      }}
                    />
                  </div>
                </div>
                <button className="btn primary lg block" type="submit" disabled={busy}>
                  {busy ? '保存中…' : '设置新密码'}
                </button>
              </form>
            )}

            <p className="help" style={{ margin: '18px 0 0' }}>
              如果链接已失效，请联系组织管理员重新发送；管理员不会看到您的新密码。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
