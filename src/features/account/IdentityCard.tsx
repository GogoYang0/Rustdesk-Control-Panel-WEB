import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import { ApiError, unlinkIdentity, type Identity } from '../../lib/api'
import { identityProviderLabel } from '../../lib/account-tokens'
import { accountSecurityError } from '../../lib/account-security'
import { formatTime } from '../../lib/format'
import { webAuthnErrorMessage } from '../../lib/webauthn'
import { panelApi, useGetIdentitiesQuery } from '../../store/api'
import { useStepup } from './useStepup'

type Proof = 'password' | 'stepup'

export default function IdentityCard({
  hasPassword,
  canStepup,
  stepupReason,
}: {
  hasPassword: boolean
  canStepup: boolean
  stepupReason: string
}) {
  const dispatch = useDispatch()
  const { data, isLoading, isFetching, error, refetch } = useGetIdentitiesQuery()
  const stepUp = useStepup()
  const identities = data?.identities ?? []
  const loading = isLoading || (isFetching && data === undefined)
  const unavailable = error instanceof ApiError && error.status === 503
  const canUnlink = hasPassword || canStepup

  const [target, setTarget] = useState<Identity | null>(null)
  const [proof, setProof] = useState<Proof>('password')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function openUnlink(identity: Identity) {
    setTarget(identity)
    setProof(hasPassword ? 'password' : 'stepup')
    setPassword('')
    setMessage(null)
  }

  function closeUnlink() {
    if (busy) return
    setTarget(null)
    setPassword('')
    setMessage(null)
  }

  async function submit() {
    if (!target || busy || !canUnlink) return
    if (proof === 'password' && password === '') {
      setMessage('请输入当前密码')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      if (proof === 'stepup') {
        let stepupToken: string
        try {
          stepupToken = await stepUp()
        } catch (err) {
          setMessage(
            err instanceof ApiError
              ? accountSecurityError(err, 'stepup')
              : webAuthnErrorMessage(err),
          )
          return
        }
        await unlinkIdentity({ identity_id: target.id, stepup_token: stepupToken })
      } else {
        await unlinkIdentity({ identity_id: target.id, password })
      }
      dispatch(panelApi.util.invalidateTags(['Identities']))
      Toast.success('外部身份已解绑')
      setTarget(null)
      setPassword('')
    } catch (err) {
      const text = accountSecurityError(err, 'identity')
      setMessage(text)
      if (err instanceof ApiError && err.status === 404) void refetch()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card" data-testid="identity-card">
        <div className="card-head">
          <div className="card-title">
            外部身份
            <span className="hint">SSO 登录与账户的绑定；绑定/重置由管理员处理</span>
          </div>
          {data?.active_provider && !unavailable ? (
            <span className="tag blue">
              当前身份源：{identityProviderLabel(data.active_provider)}
            </span>
          ) : null}
        </div>
        <div className="card-body">
          {unavailable ? (
            <div className="help">外部身份未启用。</div>
          ) : error && !data ? (
            <div className="banner danger mb-14">
              <div>{accountSecurityError(error, 'identity-list')}</div>
              <button className="btn tertiary sm" type="button" onClick={() => void refetch()}>
                重试
              </button>
            </div>
          ) : (
            <>
              {error ? (
                <div className="banner warning mb-14">
                  <div>外部身份刷新失败，当前展示的可能是上次结果。</div>
                  <button className="btn tertiary sm" type="button" onClick={() => void refetch()}>
                    重试
                  </button>
                </div>
              ) : null}
              {loading ? (
                <div className="help" role="status">
                  正在加载外部身份…
                </div>
              ) : identities.length === 0 ? (
                <div className="help">还没有外部身份绑定。</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>身份源</th>
                        <th>Issuer / 邮箱</th>
                        <th>绑定时间</th>
                        <th>最近登录</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {identities.map((identity) => (
                        <tr key={identity.id}>
                          <td>
                            <span className="tag grey">
                              {identityProviderLabel(identity.provider)}
                            </span>
                          </td>
                          <td>
                            <div className="mono cell-wrap">{identity.issuer}</div>
                            <div className="help">{identity.email}</div>
                            {identity.conflict_at ? (
                              <div className="help err">
                                SSO 已拒绝该绑定（冲突）；请联系管理员 reset。
                              </div>
                            ) : null}
                          </td>
                          <td className="help">{formatTime(identity.linked_at)}</td>
                          <td className="help">
                            {identity.last_login_at
                              ? formatTime(identity.last_login_at)
                              : '尚未登录'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn danger sm"
                              type="button"
                              disabled={!canUnlink || busy}
                              title={canUnlink ? undefined : stepupReason || '无法完成解绑验证'}
                              onClick={() => openUnlink(identity)}
                            >
                              解绑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!canUnlink && !unavailable ? (
            <div className="help" style={{ marginTop: 10 }}>
              账户没有本地密码{canStepup ? '' : `；${stepupReason}`}，无法解绑外部身份。
            </div>
          ) : null}
        </div>
      </div>

      {target ? (
        <Modal
          title={`解绑 ${identityProviderLabel(target.provider)} 身份`}
          onClose={closeUnlink}
          footer={
            <>
              <button className="btn tertiary" type="button" disabled={busy} onClick={closeUnlink}>
                取消
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? '解绑中…' : '解绑'}
              </button>
            </>
          }
        >
          {message ? (
            <div className="banner danger mb-14">
              <div>{message}</div>
            </div>
          ) : null}
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>解绑后 SSO 登录将不再匹配此账户；如果这是唯一登录通道，服务端会拒绝解绑。</div>
          </div>
          <div className="help" style={{ marginBottom: 10 }}>
            {target.email} · {target.issuer}
          </div>
          {hasPassword && canStepup ? (
            <div className="field mb-14">
              <span className="form-label">验证方式</span>
              <div className="hstack" style={{ gap: 12 }}>
                <label className="hstack" style={{ gap: 6 }}>
                  <input
                    type="radio"
                    name="identity-proof"
                    checked={proof === 'password'}
                    onChange={() => setProof('password')}
                  />
                  使用密码验证
                </label>
                <label className="hstack" style={{ gap: 6 }}>
                  <input
                    type="radio"
                    name="identity-proof"
                    checked={proof === 'stepup'}
                    onChange={() => setProof('stepup')}
                  />
                  使用 Passkey 验证
                </label>
              </div>
            </div>
          ) : null}
          {proof === 'password' && hasPassword ? (
            <div className="field">
              <label className="form-label" htmlFor="identity-password">
                当前密码
              </label>
              <div className="input">
                <input
                  id="identity-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="help">
              提交时会要求使用 Passkey 完成一次验证{canStepup ? '' : `；${stepupReason}`}。
            </div>
          )}
        </Modal>
      ) : null}
    </>
  )
}
