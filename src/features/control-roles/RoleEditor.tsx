import { useState } from 'react'

import Modal from '../../components/Modal'
import type { ControlRole } from '../../lib/api'
import {
  CONTROL_PERMISSION_KEYS,
  CONTROL_STATES,
  controlKeyLabel,
  controlRoleError,
  controlStateLabel,
  controlStateTone,
  isBuiltinRole,
  normalizePermissions,
  roleNameProblem,
  type ControlPermissionState,
  type ControlPermissions,
} from '../../lib/control-role'
import { useCreateControlRoleMutation, useUpdateControlRoleMutation } from '../../store/api'

export default function RoleEditor({
  orgId,
  role,
  roles,
  onClose,
}: {
  orgId: number
  role?: ControlRole
  roles: ControlRole[]
  onClose: () => void
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [permissions, setPermissions] = useState<ControlPermissions>(() =>
    normalizePermissions(role?.permissions),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [createRole] = useCreateControlRoleMutation()
  const [updateRole] = useUpdateControlRoleMutation()
  const builtin = role ? isBuiltinRole(role) : false

  function setState(key: (typeof CONTROL_PERMISSION_KEYS)[number], state: ControlPermissionState) {
    setPermissions((current) => ({ ...current, [key]: state }))
  }

  async function submit() {
    if (busy) return
    const problem = builtin ? null : roleNameProblem(name, roles, role?.id)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      if (role) {
        await updateRole({
          orgId,
          roleId: role.id,
          request: { name: builtin ? undefined : name.trim(), permissions },
        }).unwrap()
      } else {
        await createRole({ orgId, name: name.trim(), permissions }).unwrap()
      }
      onClose()
    } catch (err) {
      setError(controlRoleError(err, role ? 'role-update' : 'role-create', builtin))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={role ? `编辑控制角色 #${role.id}` : '新建控制角色'}
      width={680}
      onClose={() => {
        if (!busy) onClose()
      }}
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
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="field mb-14">
        <label className="form-label" htmlFor="control-role-name">
          <span className="req">*</span>名称
        </label>
        <div className="input">
          <input
            id="control-role-name"
            aria-label="名称"
            value={name}
            disabled={builtin}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="help">
          {builtin ? '内置 Default 角色不可改名；权限仍可调整。' : '1–64 个字符，组织内唯一。'}
        </div>
      </div>

      <div className="field">
        <span className="form-label">会话内动作（14 项）</span>
        <div className="help mb-14">
          继承 = 不覆盖被控端本地设置；允许/拒绝会随票据下发给 panel 会话。原生会话不受此约束。
        </div>
        <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CONTROL_PERMISSION_KEYS.map((key) => (
            <div
              key={key}
              className="hstack"
              style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <span style={{ width: 120 }}>{controlKeyLabel(key)}</span>
              <span className="mono help" style={{ width: 110 }}>
                {key}
              </span>
              <div
                className="chips"
                role="group"
                aria-label={controlKeyLabel(key)}
                style={{ margin: 0 }}
              >
                {CONTROL_STATES.map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={`chip-btn ${permissions[key] === state ? 'on' : ''}`}
                    aria-pressed={permissions[key] === state}
                    disabled={busy}
                    onClick={() => setState(key, state)}
                  >
                    <span className={`tag ${controlStateTone(state)}`}>
                      {controlStateLabel(state)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {role ? (
        <div className="help" style={{ marginTop: 12 }}>
          已发票据保留签发时的权限快照；修改只影响之后签发的票据。
        </div>
      ) : null}
    </Modal>
  )
}
