import { useState, type ReactNode } from 'react'

import Modal from '../../components/Modal'
import {
  accessError,
  validateDeviceGroupName,
  validateUserGroupName,
} from '../../lib/access-control'

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
      <div>{message}</div>
    </div>
  )
}

export function SaveDialog({
  title,
  busy,
  saveDisabled = false,
  onClose,
  onSave,
  children,
}: {
  title: string
  busy: boolean
  saveDisabled?: boolean
  onClose: () => void
  onSave: () => void
  children: ReactNode
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy || saveDisabled}
            onClick={onSave}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}

export function GroupNameDialog({
  title,
  label,
  kind,
  initial = '',
  groups,
  exceptId,
  onSave,
  onClose,
}: {
  title: string
  label: string
  kind: 'user' | 'device'
  initial?: string
  groups: { id?: number; name: string }[]
  exceptId?: number
  onSave: (name: string) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const problem =
      kind === 'user'
        ? validateUserGroupName(name, groups, exceptId)
        : validateDeviceGroupName(name, groups, exceptId)
    setError(problem)
    if (problem) return

    setBusy(true)
    try {
      await onSave(name.trim())
      onClose()
    } catch (err) {
      setError(accessError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={submit}>
            {busy ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="field">
        <label className="form-label">
          <span className="req">*</span>
          {label}
        </label>
        <div className="input">
          <input
            value={name}
            maxLength={64}
            aria-label={label}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
        </div>
        <div className="help">名称最长 64 个字符；同组织内不能重名。</div>
      </div>
    </Modal>
  )
}
