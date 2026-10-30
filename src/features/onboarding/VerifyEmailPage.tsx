import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { verifyEmail } from '../../lib/api'
import { clearTokenParam, isRetryableVerifyError, verifyEmailError } from '../../lib/onboarding'

type Status = 'verifying' | 'success' | 'invalid' | 'retryable'

const INVALID_TOKEN_MESSAGE = '验证链接不完整或无效，请重新打开邮件中的链接。'

export default function VerifyEmailPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [token, setToken] = useState<string | null>(() => searchParams.get('token'))
  const [status, setStatus] = useState<Status>(() =>
    (searchParams.get('token')?.length ?? 0) >= 16 ? 'verifying' : 'invalid',
  )
  const [message, setMessage] = useState(() =>
    (searchParams.get('token')?.length ?? 0) >= 16 ? '' : INVALID_TOKEN_MESSAGE,
  )
  const startedRef = useRef(false)

  // The token is a one-shot credential: take it out of the address bar before
  // the exchange resolves, and keep it only in memory for a manual retry.
  useEffect(() => {
    clearTokenParam(searchParams, setSearchParams)
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (!token || token.length < 16) return
    void submit(token)
  }, [])

  async function submit(value: string) {
    setStatus('verifying')
    setMessage('')
    try {
      await verifyEmail(value)
      setStatus('success')
      setToken(null)
    } catch (err) {
      const retryable = isRetryableVerifyError(err)
      setMessage(verifyEmailError(err))
      setStatus(retryable ? 'retryable' : 'invalid')
      if (!retryable) setToken(null)
    }
  }

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
            <h3>验证邮箱</h3>
            <p className="help" style={{ margin: '0 0 20px' }}>
              邮箱验证完成后即可登录控制台。
            </p>

            {status === 'verifying' ? (
              <div className="banner info" role="status">
                <div>正在验证邮箱…</div>
              </div>
            ) : status === 'success' ? (
              <>
                <div className="banner info mb-14" role="status">
                  <div>邮箱已验证，现在可以登录控制台。</div>
                </div>
                <Link className="btn primary lg block" to="/login">
                  去登录
                </Link>
              </>
            ) : (
              <>
                <div
                  className={`banner ${status === 'retryable' ? 'warning' : 'danger'} mb-14`}
                  role="alert"
                >
                  <div>{message}</div>
                </div>
                {status === 'retryable' && token ? (
                  <>
                    <button
                      className="btn primary lg block"
                      type="button"
                      onClick={() => void submit(token)}
                    >
                      重试
                    </button>
                    <Link className="btn tertiary block" style={{ marginTop: 8 }} to="/login">
                      去登录
                    </Link>
                  </>
                ) : (
                  <Link className="btn primary lg block" to="/login">
                    去登录
                  </Link>
                )}
              </>
            )}

            <p className="help" style={{ margin: '18px 0 0' }}>
              为安全起见，验证链接只自动提交一次；刷新页面后请重新打开邮件中的链接。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
