import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import Modal from '../../components/Modal'
import {
  ApiError,
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyRegistration,
  renamePasskey,
} from '../../lib/api'
import type { Passkey } from '../../lib/api'
import { accountSecurityError } from '../../lib/account-security'
import { formatTime } from '../../lib/format'
import {
  createPasskeyCredential,
  webAuthnErrorMessage,
  webAuthnSupported,
  type CreationOptions,
} from '../../lib/webauthn'

function passkeyFailure(
  err: unknown,
  context: 'passkey' | 'passkey-register' | 'passkey-delete',
): string {
  return err instanceof ApiError ? accountSecurityError(err, context) : webAuthnErrorMessage(err)
}

export default function PasskeyCard({
  passkeys,
  loading,
  fetching,
  error,
  onChanged,
}: {
  passkeys: Passkey[]
  loading: boolean
  fetching: boolean
  error: unknown
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [renaming, setRenaming] = useState<Passkey | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<Passkey | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const unavailable = error instanceof ApiError && error.status === 503
  const supported = webAuthnSupported()
  const locked = busy || fetching || unavailable
  // Rename validates UTF-8 bytes server-side (roughly 21 CJK characters), not
  // characters, so the client must use the same measure to avoid a 400.
  const renameBytes = new TextEncoder().encode(renameValue.trim()).length

  function openRegister() {
    setMessage(null)
    setName('')
    setRegistering(true)
  }

  function openRename(passkey: Passkey) {
    setMessage(null)
    setRenameValue(passkey.name)
    setRenaming(passkey)
  }

  function openDelete(passkey: Passkey) {
    setMessage(null)
    setDeleting(passkey)
  }

  async function register() {
    if (busy || !supported) return
    setBusy(true)
    setMessage(null)
    try {
      const ceremony = await beginPasskeyRegistration()
      const credential = await createPasskeyCredential(
        ceremony.options as unknown as CreationOptions,
      )
      await finishPasskeyRegistration({
        ceremony_token: ceremony.ceremony_token,
        credential,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      Toast.success('Passkey 已添加')
      setRegistering(false)
      setName('')
      onChanged()
    } catch (err) {
      setMessage(passkeyFailure(err, 'passkey-register'))
    } finally {
      setBusy(false)
    }
  }

  async function rename() {
    if (!renaming || busy || !renameValue.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await renamePasskey(renaming.id, renameValue.trim())
      Toast.success('Passkey 已重命名')
      setRenaming(null)
      onChanged()
    } catch (err) {
      setMessage(passkeyFailure(err, 'passkey'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!deleting || busy) return
    setBusy(true)
    setMessage(null)
    try {
      await deletePasskey(deleting.id)
      Toast.success('Passkey 已删除')
      setDeleting(null)
      onChanged()
    } catch (err) {
      setMessage(passkeyFailure(err, 'passkey-delete'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card" data-testid="passkey-card">
        <div className="card-head">
          <div className="card-title">Passkey</div>
          <span className="tag grey">{passkeys.length} 个</span>
        </div>
        <div className="card-body">
          {unavailable ? (
            <div className="help">当前部署未启用 Passkey。</div>
          ) : error ? (
            <div className="banner danger">
              <div>{accountSecurityError(error, 'passkey')}</div>
            </div>
          ) : loading ? (
            <div className="help" role="status">
              正在加载 Passkey…
            </div>
          ) : passkeys.length === 0 ? (
            <div className="help">还没有 Passkey；添加后可用于快速登录与敏感操作验证。</div>
          ) : (
            <table className="table" style={{ border: 'none' }}>
              <tbody>
                {passkeys.map((passkey) => (
                  <tr key={passkey.id}>
                    <td>
                      <b>{passkey.name}</b>
                      <div className="help">
                        {passkey.transports.join(' / ') || '未知传输'} · 注册于{' '}
                        {formatTime(passkey.created_at)} · 最近使用{' '}
                        {passkey.last_used_at ? formatTime(passkey.last_used_at) : '尚未使用'}
                      </div>
                      {passkey.clone_warning ? (
                        <div className="help err">签名计数回退，疑似克隆；建议删除后重新注册。</div>
                      ) : null}
                    </td>
                    <td>{passkey.backup_state ? '已备份' : '未备份'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn borderless sm"
                        type="button"
                        disabled={locked}
                        onClick={() => openRename(passkey)}
                      >
                        重命名
                      </button>
                      <button
                        className="btn danger sm"
                        type="button"
                        disabled={locked}
                        onClick={() => openDelete(passkey)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {message && !registering && !renaming && !deleting ? (
            <div className="banner danger" style={{ marginTop: 10 }}>
              <div>{message}</div>
            </div>
          ) : null}
          <button
            className="btn outline sm"
            type="button"
            style={{ marginTop: 12 }}
            disabled={locked || !supported}
            onClick={openRegister}
          >
            添加 Passkey
          </button>
          {!supported ? (
            <div className="help">当前浏览器不支持 Passkey，或页面不在安全上下文。</div>
          ) : null}
        </div>
      </div>

      {registering ? (
        <Modal
          title="添加 Passkey"
          onClose={() => {
            if (!busy) {
              setRegistering(false)
              setMessage(null)
            }
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setRegistering(false)
                  setMessage(null)
                }}
              >
                取消
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => void register()}
              >
                {busy ? '等待认证器…' : '开始注册'}
              </button>
            </>
          }
        >
          {message ? (
            <div className="banner danger mb-14">
              <div>{message}</div>
            </div>
          ) : null}
          <div className="field">
            <label className="form-label" htmlFor="passkey-name">
              名称（可选）
            </label>
            <div className="input">
              <input
                id="passkey-name"
                maxLength={64}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="MacBook Pro"
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {renaming ? (
        <Modal
          title="重命名 Passkey"
          onClose={() => {
            if (!busy) {
              setRenaming(null)
              setMessage(null)
            }
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setRenaming(null)
                  setMessage(null)
                }}
              >
                取消
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={busy || !renameValue.trim() || renameBytes > 64}
                onClick={() => void rename()}
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </>
          }
        >
          {message ? (
            <div className="banner danger mb-14">
              <div>{message}</div>
            </div>
          ) : null}
          <div className="field">
            <label className="form-label" htmlFor="passkey-rename">
              名称
            </label>
            <div className="input">
              <input
                id="passkey-rename"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </div>
            <div className={renameBytes > 64 ? 'help err' : 'help'}>
              最多 64 字节（约 21 个汉字）。
            </div>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title={`删除 Passkey「${deleting.name}」`}
          onClose={() => {
            if (!busy) {
              setDeleting(null)
              setMessage(null)
            }
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setDeleting(null)
                  setMessage(null)
                }}
              >
                取消
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? '删除中…' : '删除'}
              </button>
            </>
          }
        >
          {message ? (
            <div className="banner danger mb-14">
              <div>{message}</div>
            </div>
          ) : null}
          <p>无本地密码且这是最后一个 Passkey 时服务端会拒绝删除；请先设置密码或添加另一个凭据。</p>
        </Modal>
      ) : null}
    </>
  )
}
