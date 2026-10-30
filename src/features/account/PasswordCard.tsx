import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import Modal from '../../components/Modal'
import { ApiError, removePassword, setPassword as apiSetPassword } from '../../lib/api'
import {
  accountSecurityError,
  MIN_PASSWORD_LENGTH,
  passwordLength,
  passwordRemoveWarning,
} from '../../lib/account-security'
import { webAuthnErrorMessage, webAuthnSupported } from '../../lib/webauthn'
import { useStepup } from './useStepup'

function passwordFailure(err: unknown, context: 'password-set' | 'password-remove'): string {
  return err instanceof ApiError ? accountSecurityError(err, context) : webAuthnErrorMessage(err)
}

export default function PasswordCard({
  hasPassword,
  passkeys,
  passkeysReady,
  passkeysChecking,
  passkeysUnavailable,
  totpEnabled,
  totpPending,
  accountFetching,
  onChanged,
}: {
  hasPassword: boolean
  passkeys: number
  passkeysReady: boolean
  passkeysChecking: boolean
  passkeysUnavailable: boolean
  totpEnabled: boolean
  totpPending: boolean
  accountFetching: boolean
  onChanged: () => void
}) {
  const stepUp = useStepup()
  const [mode, setMode] = useState<'set' | 'remove' | null>(null)
  const [value, setValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const supported = webAuthnSupported()
  const canRemove =
    !accountFetching && !totpPending && passkeysReady && passkeys >= 2 && !totpEnabled && supported
  const canSet = !accountFetching && passkeysReady && passkeys >= 1 && supported
  const blockedReason = (() => {
    if (accountFetching) return '正在刷新账户状态…'
    if (passkeysChecking) return '正在确认 Passkey 状态…'
    if (passkeysUnavailable) return 'Passkey 列表不可用，暂时无法确认或执行密码变更。'
    if (hasPassword) {
      if (totpPending) {
        return '存在待启用的 TOTP 配置；请先完成启用，再停用两步验证后删除密码。'
      }
      if (totpEnabled) return '请先停用两步验证，再删除本地密码。'
      if (passkeys < 2) {
        return `删除本地密码需要至少 2 个 Passkey（当前 ${passkeys} 个）。`
      }
      if (!supported) return '当前浏览器不支持 Passkey，无法完成敏感操作验证。'
      return null
    }
    if (passkeys < 1) return '设置本地密码需要用 Passkey 完成敏感操作验证。'
    if (!supported) return '当前浏览器不支持 Passkey，无法完成敏感操作验证。'
    return null
  })()

  function closeMode() {
    if (busy) return
    setMode(null)
    setValue('')
    setPassword('')
    setError(null)
  }

  async function submit() {
    if (busy || !mode) return
    if (mode === 'set' && passwordLength(value) < MIN_PASSWORD_LENGTH) {
      setError(`新密码至少 ${MIN_PASSWORD_LENGTH} 个字符`)
      return
    }
    if (mode === 'set' && !canSet) return
    if (mode === 'remove' && !canRemove) return
    if (mode === 'remove' && password === '') {
      setError('请输入当前密码')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let stepupToken: string
      try {
        stepupToken = await stepUp()
      } catch (err) {
        setError(
          err instanceof ApiError ? accountSecurityError(err, 'stepup') : webAuthnErrorMessage(err),
        )
        return
      }
      if (mode === 'set') {
        await apiSetPassword(value, stepupToken)
        Toast.success('本地密码已设置')
        setMode(null)
        setValue('')
        onChanged()
      } else {
        const result = await removePassword(password, stepupToken)
        setWarnings(result.warnings)
        setMode(null)
        setPassword('')
        onChanged()
      }
    } catch (err) {
      setError(passwordFailure(err, mode === 'set' ? 'password-set' : 'password-remove'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card" data-testid="password-card">
        <div className="card-head">
          <div className="card-title">本地密码</div>
          <span className={`tag ${hasPassword ? 'green' : 'grey'}`}>
            {hasPassword ? '已设置' : 'passkey-only'}
          </span>
        </div>
        <div className="card-body">
          <div className="help">
            {hasPassword
              ? '本地密码可用于密码登录与 compat 客户端。删除前需至少 2 个 Passkey 且未启用 TOTP。'
              : '账户当前只能通过 Passkey 登录；可设置本地密码作为第二通道。'}
          </div>
          {blockedReason ? (
            <div className="help" style={{ marginTop: 8 }}>
              {blockedReason}
            </div>
          ) : null}
          <div className="hstack" style={{ marginTop: 12 }}>
            {hasPassword ? (
              <button
                className="btn danger sm"
                type="button"
                disabled={busy || !canRemove}
                onClick={() => {
                  setError(null)
                  setMode('remove')
                }}
              >
                删除本地密码
              </button>
            ) : (
              <button
                className="btn primary sm"
                type="button"
                disabled={busy || !canSet}
                onClick={() => {
                  setError(null)
                  setMode('set')
                }}
              >
                设置本地密码
              </button>
            )}
          </div>
        </div>
      </div>

      {mode ? (
        <Modal
          title={mode === 'set' ? '设置本地密码' : '删除本地密码'}
          onClose={closeMode}
          footer={
            <>
              <button className="btn tertiary" type="button" disabled={busy} onClick={closeMode}>
                取消
              </button>
              <button
                className={mode === 'set' ? 'btn primary' : 'btn danger'}
                type="button"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? '等待 Passkey…' : mode === 'set' ? '设置' : '删除'}
              </button>
            </>
          }
        >
          {error ? (
            <div className="banner danger mb-14">
              <div>{error}</div>
            </div>
          ) : null}
          {mode === 'set' ? (
            <>
              <p className="help">提交前会要求使用 Passkey 完成一次验证。</p>
              <div className="field">
                <label className="form-label" htmlFor="new-password">
                  新密码
                </label>
                <div className="input">
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </div>
                <div className="help">至少 {MIN_PASSWORD_LENGTH} 个字符。</div>
              </div>
            </>
          ) : (
            <>
              <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
                <div>删除后若丢失全部 Passkey 将无法登录，compat 客户端密码登录也会失效。</div>
              </div>
              <p className="help">提交前会要求使用 Passkey 完成一次验证。</p>
              <div className="field">
                <label className="form-label" htmlFor="current-password-remove">
                  当前密码
                </label>
                <div className="input">
                  <input
                    id="current-password-remove"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </Modal>
      ) : null}

      {warnings ? (
        <Modal
          title="本地密码已删除"
          onClose={() => setWarnings(null)}
          footer={
            <button className="btn primary" type="button" onClick={() => setWarnings(null)}>
              知道了
            </button>
          }
        >
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>以下影响需要知悉：</div>
          </div>
          <ul>
            {warnings.map((warning) => (
              <li key={warning} className="help">
                {passwordRemoveWarning(warning)}
              </li>
            ))}
          </ul>
        </Modal>
      ) : null}
    </>
  )
}
