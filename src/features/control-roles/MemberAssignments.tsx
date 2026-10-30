import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import { ApiError } from '../../lib/api'
import type { ControlRole, Member } from '../../lib/api'
import { controlRoleError, isBuiltinRole, roleAssignmentLabel } from '../../lib/control-role'
import { useAssignMemberControlRoleMutation } from '../../store/api'

export default function MemberAssignments({
  orgId,
  roles,
  members,
  membersError,
  membersLoading,
  onRetryMembers,
  rolesLoading,
  rolesError,
  onRetryRoles,
}: {
  orgId: number
  roles: ControlRole[]
  members: Member[]
  membersError?: unknown
  membersLoading: boolean
  onRetryMembers: () => void
  rolesLoading: boolean
  rolesError?: unknown
  onRetryRoles: () => void
}) {
  const [assign] = useAssignMemberControlRoleMutation()
  const [busyUserId, setBusyUserId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const defaultRole = roles.find(isBuiltinRole)
  const customRoles = roles.filter((role) => !isBuiltinRole(role))
  const rolesReady = !rolesLoading && !rolesError

  function currentValue(member: Member): string {
    if (member.control_role_id == null) return ''
    if (defaultRole && member.control_role_id === defaultRole.id) return ''
    return String(member.control_role_id)
  }

  async function change(member: Member, value: string) {
    if (busyUserId !== null) return
    const next = value === '' ? null : Number(value)
    setBusyUserId(member.user_id)
    setError(null)
    try {
      await assign({ orgId, userId: member.user_id, controlRoleId: next }).unwrap()
      Toast.success('控制角色已更新')
    } catch (err) {
      setError(controlRoleError(err, 'assign'))
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
        onRetryRoles()
        onRetryMembers()
      }
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="hstack" style={{ marginBottom: 10 }}>
        <div className="card-title">成员控制角色</div>
        <span className="tag grey">{membersError || membersLoading ? '—' : members.length}</span>
        <div className="spacer" />
      </div>
      <div className="help mb-14">
        未分配或指向 Default 的成员回退组织内置 Default；控制角色只影响 panel
        会话，原生会话不受约束。
      </div>

      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}

      {rolesError ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载控制角色字典失败。</b>
            {controlRoleError(rolesError, 'roles')}
          </div>
          <button className="btn outline sm" type="button" onClick={onRetryRoles}>
            重试
          </button>
        </div>
      ) : null}

      {membersError ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载成员失败。</b>
            {controlRoleError(membersError, 'roles')}
          </div>
          <button className="btn outline sm" type="button" onClick={onRetryMembers}>
            重试
          </button>
        </div>
      ) : null}

      {membersError && members.length === 0 ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {membersLoading && members.length === 0 ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载成员…
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>成员</th>
                    <th style={{ width: 130 }}>认证角色</th>
                    <th style={{ width: 90 }}>状态</th>
                    <th style={{ width: 220 }}>控制角色</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.user_id}>
                      <td className="cell-wrap">{member.email}</td>
                      <td>{member.role_name}</td>
                      <td>
                        {member.disabled ? (
                          <span className="tag grey">停用</span>
                        ) : (
                          <span className="tag green">正常</span>
                        )}
                      </td>
                      <td>
                        <select
                          className="select-native"
                          aria-label={`控制角色 ${member.email}`}
                          value={currentValue(member)}
                          disabled={busyUserId !== null || !rolesReady || !!membersError}
                          onChange={(event) => void change(member, event.target.value)}
                        >
                          <option value="">未分配 → Default</option>
                          {customRoles.map((role) => (
                            <option key={role.id} value={String(role.id)}>
                              {role.name}
                            </option>
                          ))}
                          {member.control_role_id != null &&
                          !roles.some((role) => role.id === member.control_role_id) ? (
                            <option value={String(member.control_role_id)}>
                              {rolesReady
                                ? roleAssignmentLabel(member.control_role_id, roles)
                                : '角色加载中…'}
                            </option>
                          ) : null}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
