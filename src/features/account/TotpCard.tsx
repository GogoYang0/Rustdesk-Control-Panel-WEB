import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import Modal from '../../components/Modal'
import { disableTotp, enableTotp, regenerateRecoveryCodes, setupTotp } from '../../lib/api'
import type { TotpSetup } from '../../lib/api'
import { accountSecurityError } from '../../lib/account-security'

type Mode = 'setup' | 'disable' | 'recovery' | null

export default function TotpCard({
  enabled,
  hasPassword,
  accountFetching,
  pending,
  onPendingChange,
  onChange,
}: {
  enabled: boolean
  hasPassword: boolean
  accountFetching: boolean
  pending: boolean
  onPendingChange: (pending: boolean) => void
  onChange: () => void
}) {
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function resetMode() {
    setMode(null)
    setSetup(null)
    setCode('')
    setPassword('')
    setError(null)
  }

  function closeMode() {
    if (busy) return
    resetMode()
  }

  function cancelSetup() {
    if (busy) return
    // Setup already wrote a pending row server-side; it blocks password removal
    // until this enrollment is completed or replaced.
    resetMode()
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      Toast.success(`${label}已复制`)
    } catch {
      Toast.error('复制失败，请手动选择')
    }
  }

  async function beginSetup() {
    if (busy || !hasPassword || accountFetching) return
    setBusy(true)
    setError(null)
    try {
      setSetup(await setupTotp())
      onPendingChange(true)
      setMode('setup')
    } catch (err) {
      setError(accountSecurityError(err, 'totp'))
    } finally {
      setBusy(false)
    }
  }

  async function submitSetup() {
    if (!setup || busy) return
    setBusy(true)
    setError(null)
    try {
      await enableTotp(code.trim())
      Toast.success('两步验证已启用')
      onPendingChange(false)
      resetMode()
      onChange()
    } catch (err) {
      setError(accountSecurityError(err, 'totp'))
    } finally {
      setBusy(false)
    }
  }

  async function submitSensitive() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'disable') {
        await disableTotp(password, code.trim())
        Toast.success('两步验证已停用')
        resetMode()
        onChange()
        return
      }
      if (mode === 'recovery') {
        const result = await regenerateRecoveryCodes(password, code.trim())
        setCodes(result.codes)
        resetMode()
      }
    } catch (err) {
      setError(accountSecurityError(err, 'totp'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card" data-testid="totp-card">
        <div className="card-head">
          <div className="card-title">两步验证</div>
          <span className={`tag ${enabled ? 'green' : 'grey'}`}>
            {enabled ? '已启用' : '未启用'}
          </span>
        </div>
        <div className="card-body">
          <div className="help">
            {enabled
              ? '登录第二步使用 TOTP 或一次性恢复码；恢复码只显示一次。'
              : '使用验证器 App 生成动态码；启用后密码登录需要第二步校验。'}
          </div>
          {!hasPassword ? (
            <div className="help" style={{ marginTop: 8 }}>
              当前账户是 passkey-only，没有本地密码，无法启用或维护 TOTP。
            </div>
          ) : null}
          {pending && !enabled ? (
            <div className="banner warning" style={{ marginTop: 10, padding: '9px 11px' }}>
              <div>
                已留下待启用配置；它会阻止删除本地密码。重新开始启用可覆盖旧配置，或完成启用后再停用。
              </div>
            </div>
          ) : null}
          {error && !mode ? (
            <div className="banner danger" style={{ marginTop: 10, padding: '9px 11px' }}>
              <div>{error}</div>
            </div>
          ) : null}
          <div className="hstack" style={{ marginTop: 12, gap: 8 }}>
            {!enabled ? (
              <button
                className="btn primary sm"
                type="button"
                disabled={busy || accountFetching || !hasPassword}
                title={hasPassword ? undefined : 'passkey-only 账户不能启用 TOTP'}
                onClick={() => void beginSetup()}
              >
                启用两步验证
              </button>
            ) : (
              <>
                <button
                  className="btn outline sm"
                  type="button"
                  disabled={busy || accountFetching || !hasPassword}
                  onClick={() => {
                    setMode('recovery')
                    setError(null)
                  }}
                >
                  恢复码
                </button>
                <button
                  className="btn borderless sm"
                  type="button"
                  disabled={busy || accountFetching || !hasPassword}
                  onClick={() => {
                    setMode('disable')
                    setError(null)
                  }}
                >
                  停用
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {mode === 'setup' && setup ? (
        <Modal
          title="启用两步验证"
          onClose={cancelSetup}
          footer={
            <>
              <button className="btn tertiary" type="button" disabled={busy} onClick={cancelSetup}>
                取消
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={busy || !code.trim()}
                onClick={() => void submitSetup()}
              >
                {busy ? '启用中…' : '验证并启用'}
              </button>
            </>
          }
        >
          {error ? (
            <div className="banner danger mb-14">
              <div>{error}</div>
            </div>
          ) : null}
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>初始化会留下待启用配置；未完成启用前不要关闭，否则删除本地密码会被阻止。</div>
          </div>
          <div className="field mb-14">
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <span className="form-label">Base32 秘密</span>
              <button
                className="btn borderless sm"
                type="button"
                aria-label="复制秘密"
                onClick={() => void copyText(setup.secret, '秘密')}
              >
                复制
              </button>
            </div>
            <pre
              className="mono"
              style={{ whiteSpace: 'pre-wrap', margin: 0 }}
              data-testid="totp-secret"
            >
              {setup.secret}
            </pre>
            <div className="help">可手动输入验证器；不会再次显示。</div>
          </div>
          <div className="field mb-14">
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <span className="form-label">otpauth URI</span>
              <button
                className="btn borderless sm"
                type="button"
                aria-label="复制 URI"
                onClick={() => void copyText(setup.otpauth_uri, 'URI')}
              >
                复制
              </button>
            </div>
            <pre className="mono cell-wrap" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {setup.otpauth_uri}
            </pre>
          </div>
          <div className="field">
            <label className="form-label" htmlFor="totp-code">
              首个动态码
            </label>
            <div className="input">
              <input
                id="totp-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {mode === 'disable' || mode === 'recovery' ? (
        <Modal
          title={mode === 'disable' ? '停用两步验证' : '重新生成恢复码'}
          onClose={closeMode}
          footer={
            <>
              <button className="btn tertiary" type="button" disabled={busy} onClick={closeMode}>
                取消
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={busy || !password || !code.trim()}
                onClick={() => void submitSensitive()}
              >
                {busy ? '处理中…' : mode === 'disable' ? '停用' : '生成'}
              </button>
            </>
          }
        >
          {error ? (
            <div className="banner danger mb-14">
              <div>{error}</div>
            </div>
          ) : null}
          <div className="field mb-14">
            <label className="form-label" htmlFor="totp-password">
              当前密码
            </label>
            <div className="input">
              <input
                id="totp-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="form-label" htmlFor="totp-confirm-code">
              动态码或恢复码
            </label>
            <div className="input">
              <input
                id="totp-confirm-code"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {codes ? (
        <Modal
          title="新的恢复码"
          onClose={() => setCodes(null)}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                onClick={() => void copyText(codes.join(String.fromCharCode(10)), '恢复码')}
              >
                复制全部
              </button>
              <button className="btn primary" type="button" onClick={() => setCodes(null)}>
                我已保存
              </button>
            </>
          }
        >
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>恢复码只显示一次，旧码已作废；关闭后无法再次查看，请复制或离开前离线保存。</div>
          </div>
          <pre
            className="mono"
            style={{ whiteSpace: 'pre-wrap', margin: 0 }}
            data-testid="recovery-codes"
          >
            {codes.join('\n')}
          </pre>
        </Modal>
      ) : null}
    </>
  )
}
