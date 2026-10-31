import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useParams } from 'react-router'

import Modal from '../../components/Modal'
import { ApiError, type Invitation, type Member, type Role } from '../../lib/api'
import { formatTime } from '../../lib/format'
import {
  MEMBER_SECURITY_ACTIONS,
  memberSecurityError,
  type MemberSecurityAction,
} from '../../lib/member-security'
import {
  invitationRoleLabel,
  revokeInvitationError,
  revokeInvitationNeedsRefresh,
} from '../../lib/invitations'
import type { AppDispatch } from '../../store'
import {
  panelApi,
  useGetInvitationsQuery,
  useGetMeQuery,
  useGetMembersQuery,
  useGetRolesQuery,
  useInviteMemberMutation,
  useRemoveMemberMutation,
  useResetMemberIdentityMutation,
  useResetMemberPasskeysMutation,
  useResetMemberTotpMutation,
  useRevokeInvitationMutation,
  useUpdateMemberMutation,
} from '../../store/api'

type Dialog =
  | { kind: 'invite' }
  | { kind: 'role'; member: Member }
  | { kind: 'disable'; member: Member }
  | { kind: 'remove'; member: Member }
  | { kind: 'security'; member: Member; instance: number }
  | { kind: 'revoke'; invitation: Invitation; instance: number }
  | null

// Member carries the role *name* (builtin names are owner/admin/member), not a
// kind: the contract has no role_kind field, so derive it instead of trusting a
// field that would always be undefined.
function memberKind(member: Member): string {
  const name = member.role_name || member.role
  return name === 'owner' || name === 'admin' || name === 'member' ? name : 'custom'
}

function roleColor(kind?: string): string {
  switch (kind) {
    case 'owner':
      return 'orange'
    case 'admin':
      return 'blue'
    case 'member':
      return 'green'
    default:
      return 'grey'
  }
}

/** Arrow keys wrap around the radio group; Enter/Space select the focused one. */
const ARROW_STEP: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

export default function MembersPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me } = useGetMeQuery()
  // currentData is undefined until *this* organization's query resolves, so a
  // switch never shows the previous organization's members.
  const { currentData: data, isLoading, isFetching, error } = useGetMembersQuery(id, { skip: !id })
  // A switched organization keeps isFetching true while its first response is on
  // the way; that window must show loading, not an empty list.
  const loadingCurrent = isLoading || (isFetching && data === undefined)
  const current = me?.orgs.find((org) => org.id === id)
  const perms = new Set(current?.permissions ?? [])
  const canManage = perms.has('member.manage')
  const {
    currentData: invitations,
    isLoading: invitationsLoading,
    isFetching: invitationsFetching,
    error: invitationsError,
    refetch: refetchInvitations,
  } = useGetInvitationsQuery(id, { skip: !id || !canManage })
  const loadingInvitations =
    invitationsLoading || (invitationsFetching && invitations === undefined)
  const isOwner = current?.role_kind === 'owner'
  const [dialog, setDialog] = useState<Dialog>(null)
  const securitySeq = useRef(0)
  const [updateMember] = useUpdateMemberMutation()
  const [busy, setBusy] = useState(false)
  // A result that lands after the scope moved must not close the new dialog.
  // Committed in a layout effect: a render-time assignment can expose an org id
  // whose render was interrupted.
  const scopeRef = useRef(id)
  useLayoutEffect(() => {
    scopeRef.current = id
  }, [id])

  // The page is not remounted when :orgId changes, so a dialog opened for a
  // member of the previous organization would PATCH the same user id under the
  // new one. Drop it whenever the scope moves.
  useEffect(() => {
    setDialog(null)
    setBusy(false)
  }, [id])

  const members = data ?? []
  const active = members.filter((m) => !m.disabled).length
  const disabled = members.length - active

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">组织与成员</h1>
          <div className="page-sub">
            共 {members.length} 名成员 · 正常 {active} · 停用 {disabled}
            {summarizeRoles(members) ? ` · ${summarizeRoles(members)}` : ''}
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={!canManage}
            title={canManage ? '邀请成员' : '需要 member.manage 权限'}
            onClick={() => setDialog({ kind: 'invite' })}
          >
            邀请成员
          </button>
        </div>
      </div>

      <div className="grid-3 mb-14">
        <div className="card">
          <div className="card-body">
            <div className="help">成员</div>
            <div
              style={{
                fontSize: 24,
                lineHeight: '32px',
                fontWeight: 600,
                marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {members.length}{' '}
              <span className="help" style={{ fontWeight: 400 }}>
                人
              </span>
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              正常 {active} · 停用 {disabled}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="help">我的角色</div>
            <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, marginTop: 2 }}>
              {currentRoleLabel(members, me?.user.id)}
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              owner/admin 不受访问规则限制；改角色仅 owner 可操作
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="help">外部身份</div>
            <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, marginTop: 2 }}>—</div>
            <div className="help" style={{ marginTop: 6 }}>
              OIDC / LDAP 绑定在「账户与安全」中管理
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`加载成员失败：${(error as { message?: string }).message ?? '未知错误'}`}
        />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="card-title">
              成员<span className="hint">按加入时间排序</span>
            </div>
          </div>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" style={{ padding: '14px 0' }}>
                正在加载成员…
              </div>
            ) : members.length === 0 ? (
              <Empty title="还没有成员" description="邀请成员后他们会出现在这里" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>成员</th>
                    <th style={{ width: 150 }}>角色</th>
                    <th style={{ width: 110 }}>状态</th>
                    <th style={{ width: 160 }}>加入时间</th>
                    <th style={{ width: 300 }} />
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const self = member.user_id === me?.user.id
                    return (
                      <tr key={member.id}>
                        <td>
                          <div style={{ fontSize: 13 }}>
                            {member.email}
                            {self ? (
                              <span className="tag grey" style={{ marginLeft: 6 }}>
                                我
                              </span>
                            ) : null}
                          </div>
                          <div className="mono help">user #{member.user_id}</div>
                        </td>
                        <td>
                          <span className={`tag ${roleColor(memberKind(member))}`}>
                            {member.role_name}
                          </span>
                        </td>
                        <td>
                          {member.disabled ? (
                            <span className="tag red">已停用</span>
                          ) : (
                            <span className="tag green">正常</span>
                          )}
                        </td>
                        <td className="mono">{formatTime(member.created_at)}</td>
                        <td>
                          <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <ActionButton
                              label="改角色"
                              disabled={!isOwner || self || memberKind(member) === 'owner'}
                              title={
                                !isOwner
                                  ? '仅 owner 可改角色'
                                  : self
                                    ? '不能修改自己的角色'
                                    : memberKind(member) === 'owner'
                                      ? 'owner 角色不可通过此端点变更'
                                      : '变更角色'
                              }
                              onClick={() => setDialog({ kind: 'role', member })}
                            />
                            <ActionButton
                              label={member.disabled ? '恢复' : '停用'}
                              disabled={
                                !canManage || self || (memberKind(member) === 'owner' && !isOwner)
                              }
                              title={
                                !canManage
                                  ? '需要 member.manage'
                                  : self
                                    ? '不能停用自己'
                                    : '停用会撤销其 compat 会话'
                              }
                              onClick={() =>
                                member.disabled
                                  ? void toggleDisabled(member, false)
                                  : setDialog({ kind: 'disable', member })
                              }
                            />
                            <ActionButton
                              label="安全"
                              disabled={
                                !canManage || self || (memberKind(member) === 'owner' && !isOwner)
                              }
                              title={
                                !canManage
                                  ? '需要 member.manage'
                                  : self
                                    ? '不能重置自己的凭据'
                                    : memberKind(member) === 'owner' && !isOwner
                                      ? '仅 owner 可重置 owner 的凭据'
                                      : 'TOTP / Passkey / 外部身份重置'
                              }
                              onClick={() =>
                                setDialog({
                                  kind: 'security',
                                  member,
                                  instance: ++securitySeq.current,
                                })
                              }
                            />
                            <ActionButton
                              label="移除"
                              danger
                              disabled={
                                !canManage || self || (memberKind(member) === 'owner' && !isOwner)
                              }
                              title={
                                !canManage
                                  ? '需要 member.manage'
                                  : self
                                    ? '不能移除自己'
                                    : '移除成员'
                              }
                              onClick={() => setDialog({ kind: 'remove', member })}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {canManage ? (
        <div className="card mb-14" data-testid="invitation-card">
          <div className="card-head">
            <div className="card-title">
              待接受邀请<span className="hint">有效期 7 天 · 只显示未接受</span>
            </div>
            <button
              className="btn borderless sm"
              type="button"
              disabled={loadingInvitations || invitationsFetching}
              onClick={() => void refetchInvitations()}
            >
              刷新
            </button>
          </div>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {invitationsError && !invitations ? (
              <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
                <div>加载待接受邀请失败，请稍后重试。</div>
                <button
                  className="btn tertiary sm"
                  type="button"
                  onClick={() => void refetchInvitations()}
                >
                  重试
                </button>
              </div>
            ) : null}
            {loadingInvitations ? (
              <div className="help" style={{ padding: '14px 0' }}>
                正在加载待接受邀请…
              </div>
            ) : !invitations || invitations.length === 0 ? (
              <Empty title="没有待接受的邀请" description="邀请成员后，未接受的邀请会显示在这里" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>邮箱</th>
                    <th style={{ width: 140 }}>角色</th>
                    <th style={{ width: 180 }}>有效期至</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>
                        <span className={`tag ${invitation.role === 'admin' ? 'blue' : 'green'}`}>
                          {invitationRoleLabel(invitation.role)}
                        </span>
                      </td>
                      <td className="mono">{formatTime(invitation.expires_at)}</td>
                      <td>
                        <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="btn danger sm"
                            type="button"
                            onClick={() =>
                              setDialog({
                                kind: 'revoke',
                                invitation,
                                instance: ++securitySeq.current,
                              })
                            }
                          >
                            撤销
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      <p className="help" style={{ marginTop: 12 }}>
        停用/移除会撤销该成员的 compat 会话；面板会话按每请求会籍复核。最后一个 owner 不可被移除。
      </p>

      {dialog?.kind === 'invite' ? (
        <InviteDialog orgId={id} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'role' ? (
        <RoleDialog orgId={id} member={dialog.member} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'disable' ? (
        <ConfirmDialog
          title="停用成员"
          body={
            <>
              停用 <b>{dialog.member.email}</b> 会立即撤销其在本组织的 compat
              会话，并使其无法再访问该组织。
            </>
          }
          confirmLabel="停用"
          busy={busy}
          onConfirm={() => toggleDisabled(dialog.member, true)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'remove' ? (
        <RemoveDialog orgId={id} member={dialog.member} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'security' ? (
        <MemberSecurityDialog
          orgId={id}
          member={dialog.member}
          onClose={() =>
            setDialog((prev) =>
              prev?.kind === 'security' && prev.instance === dialog.instance ? null : prev,
            )
          }
        />
      ) : null}
      {dialog?.kind === 'revoke' ? (
        <RevokeInvitationDialog
          orgId={id}
          invitation={dialog.invitation}
          onClose={() =>
            setDialog((prev) =>
              prev?.kind === 'revoke' && prev.instance === dialog.instance ? null : prev,
            )
          }
        />
      ) : null}
    </section>
  )

  async function toggleDisabled(member: Member, disabled: boolean) {
    const scope = id
    setBusy(true)
    try {
      const result = await updateMember({
        orgId: scope,
        userId: member.user_id,
        patch: { disabled },
      }).unwrap()
      if (scopeRef.current !== scope) return
      setDialog(null)
      Toast.success(
        disabled
          ? `已停用 ${member.email}${result?.revoked_sessions ? `，撤销 ${result.revoked_sessions} 个会话` : ''}`
          : `已恢复 ${member.email}`,
      )
    } catch (err) {
      if (scopeRef.current === scope) Toast.error((err as ApiError).message || '操作失败')
    } finally {
      if (scopeRef.current === scope) setBusy(false)
    }
  }
}

export function MemberSecurityDialog({
  orgId,
  member,
  onClose,
}: {
  orgId: number
  member: Member
  onClose: () => void
}) {
  const [pending, setPending] = useState<MemberSecurityAction | null>(null)
  const [error, setError] = useState('')
  const [resetTotp, { isLoading: totpBusy }] = useResetMemberTotpMutation()
  const [resetPasskeys, { isLoading: passkeyBusy }] = useResetMemberPasskeysMutation()
  const [resetIdentity, { isLoading: identityBusy }] = useResetMemberIdentityMutation()
  const scopeRef = useRef(orgId)
  useLayoutEffect(() => {
    scopeRef.current = orgId
  }, [orgId])
  const busy = totpBusy || passkeyBusy || identityBusy
  const action = MEMBER_SECURITY_ACTIONS.find((item) => item.action === pending)

  async function run() {
    if (!pending) return
    setError('')
    try {
      const args = { orgId, userId: member.user_id }
      if (pending === 'totp') await resetTotp(args).unwrap()
      else if (pending === 'passkey') await resetPasskeys(args).unwrap()
      else await resetIdentity(args).unwrap()
      if (scopeRef.current !== orgId) return
      Toast.success(
        pending === 'identity'
          ? `已解绑 ${member.email} 的外部身份`
          : `已重置 ${member.email} 的${pending === 'totp' ? '两步验证' : ' Passkey'}`,
      )
      onClose()
    } catch (err) {
      if (scopeRef.current === orgId) setError(memberSecurityError(err, pending))
    }
  }

  return (
    <Modal
      title="安全重置"
      onClose={() => {
        if (!busy) onClose()
      }}
      width={560}
      footer={
        pending ? (
          <>
            <button
              className="btn tertiary"
              type="button"
              disabled={busy}
              onClick={() => {
                setPending(null)
                setError('')
              }}
            >
              返回
            </button>
            <button
              className="btn danger solid"
              type="button"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy ? '处理中…' : action?.button}
            </button>
          </>
        ) : (
          <button className="btn tertiary" type="button" onClick={onClose}>
            关闭
          </button>
        )
      }
    >
      <div className="help mb-14">
        成员：<b>{member.email}</b> · user #{member.user_id}
        <div style={{ marginTop: 4 }}>安全重置是账户级操作，会影响该成员在所有组织的登录凭据。</div>
      </div>
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      {pending && action ? (
        <>
          <div className="banner warning mb-14">
            <div>{action.confirm}</div>
          </div>
          <p className="help">请确认该成员仍能通过其他方式登录；此操作不可撤销。</p>
        </>
      ) : (
        <div className="vstack" style={{ gap: 10 }}>
          {MEMBER_SECURITY_ACTIONS.map((item) => (
            <div
              key={item.action}
              className="card"
              style={{ boxShadow: 'none', border: '1px solid var(--border)' }}
            >
              <div className="card-body" style={{ padding: 12 }}>
                <div className="hstack" style={{ gap: 8 }}>
                  <b style={{ fontSize: 13 }}>{item.label}</b>
                  <div className="spacer" />
                  <button
                    className={`btn sm ${item.action === 'totp' ? 'outline' : 'danger'}`}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPending(item.action)
                      setError('')
                    }}
                  >
                    {item.action === 'identity' ? '解绑' : '重置'}
                  </button>
                </div>
                <div className="help" style={{ marginTop: 4 }}>
                  {item.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function InviteDialog({ orgId, onClose }: { orgId: number; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState<string | null>(null)
  const [invite, { isLoading }] = useInviteMemberMutation()

  async function submit() {
    setError(null)
    if (!email.trim()) {
      setError('请输入邮箱')
      return
    }
    try {
      await invite({ orgId, email: email.trim(), role }).unwrap()
      Toast.success('邀请已发送，有效期 7 天')
      onClose()
    } catch (err) {
      setError((err as ApiError).message || '邀请失败')
    }
  }

  return (
    <Modal
      title="邀请成员"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '发送中…' : '发送邀请'}
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
        <label className="form-label">
          <span className="req">*</span>邮箱
        </label>
        <div className="input">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div className="help">
          邀请令牌有效期 7 天，服务端只存哈希；受邀人接受后成为该组织成员。
        </div>
      </div>
      <div className="field">
        <label className="form-label">角色</label>
        <div className="hstack" style={{ gap: 16, height: 32 }}>
          <label
            className={`radio ${role === 'member' ? 'on' : ''}`}
            onClick={() => setRole('member')}
          >
            <i />
            Member
          </label>
          <label
            className={`radio ${role === 'admin' ? 'on' : ''}`}
            onClick={() => setRole('admin')}
          >
            <i />
            Admin
          </label>
        </div>
        <div className="help">Owner 不通过邀请授予。</div>
      </div>
    </Modal>
  )
}

function RevokeInvitationDialog({
  orgId,
  invitation,
  onClose,
}: {
  orgId: number
  invitation: Invitation
  onClose: () => void
}) {
  const dispatch = useDispatch<AppDispatch>()
  const [revoke, { isLoading }] = useRevokeInvitationMutation()
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function submit() {
    setError(null)
    try {
      await revoke({ orgId, invitationId: invitation.id }).unwrap()
      if (!mountedRef.current) return
      Toast.success('已撤销邀请')
      onClose()
    } catch (err) {
      if (!mountedRef.current) return
      setError(revokeInvitationError(err))
      if (revokeInvitationNeedsRefresh(err)) {
        dispatch(panelApi.util.invalidateTags([{ type: 'Invitations', id: orgId }]))
      }
    }
  }

  return (
    <Modal
      title="撤销邀请"
      onClose={isLoading ? () => undefined : onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button className="btn danger" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '撤销中…' : '撤销邀请'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="banner warning" style={{ padding: '9px 11px' }}>
        <div>
          撤销 <b>{invitation.email}</b>（{invitationRoleLabel(invitation.role)}）的邀请后，
          邮件中的链接将立即失效；如需重新邀请，请回到成员页再次发送。
        </div>
      </div>
    </Modal>
  )
}

function RoleDialog({
  orgId,
  member,
  onClose,
}: {
  orgId: number
  member: Member
  onClose: () => void
}) {
  const { data: roles, isLoading, error: loadError } = useGetRolesQuery(orgId)
  const [roleId, setRoleId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [update, { isLoading: saving }] = useUpdateMemberMutation()
  const assignable = (roles ?? []).filter((role: Role) => role.kind !== 'owner')
  const canSave = assignable.length > 0 && !loadError

  async function submit() {
    if (!roleId) {
      setError('请选择角色')
      return
    }
    try {
      await update({ orgId, userId: member.user_id, patch: { role_id: roleId } }).unwrap()
      Toast.success('角色已更新')
      onClose()
    } catch (err) {
      setError((err as ApiError).message || '更新失败')
    }
  }

  return (
    <Modal
      title="变更角色"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={saving || isLoading || !canSave}
            onClick={submit}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="help mb-14">
        成员：<b>{member.email}</b> · 当前{' '}
        <span className={`tag ${roleColor(memberKind(member))}`}>{member.role_name}</span>
      </div>
      <div className="field">
        <label className="form-label">新角色</label>
        {/* Persistent live region: the save button disables itself when the query
            fails or returns nothing, so the reason must be announced too. */}
        <div role="status" aria-live="polite">
          {isLoading ? <div className="help">正在加载角色…</div> : null}
          {loadError ? (
            <div className="help" style={{ color: 'var(--danger)' }}>
              角色列表加载失败，请重试
            </div>
          ) : null}
          {!isLoading && !loadError && assignable.length === 0 ? (
            <div className="help">没有可分配的角色</div>
          ) : null}
        </div>
        <div className="vstack" style={{ gap: 6 }} role="radiogroup" aria-label="新角色">
          {assignable.map((role, index) => (
            <label
              key={role.id}
              className={`radio ${roleId === role.id ? 'on' : ''}`}
              role="radio"
              aria-checked={roleId === role.id}
              // Roving tabindex, as the radio pattern requires: one stop for the
              // whole group, arrows move both focus and selection.
              tabIndex={roleId === role.id || (roleId === null && index === 0) ? 0 : -1}
              onClick={() => setRoleId(role.id)}
              onKeyDown={(event) => {
                const step = ARROW_STEP[event.key] ?? 0
                if (step !== 0) {
                  event.preventDefault()
                  const next = (index + step + assignable.length) % assignable.length
                  setRoleId(assignable[next].id)
                  const items =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                      '[role="radio"]',
                    )
                  items?.[next]?.focus()
                  return
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setRoleId(role.id)
                }
              }}
            >
              <i />
              {role.name}
              <span className="help" style={{ marginLeft: 8 }}>
                {role.kind === 'custom' ? '自定义' : '内置'} · {role.permissions.length} 项权限
              </span>
            </label>
          ))}
        </div>
        <div className="help">降级会在同一事务内撤销该成员的 compat 会话。</div>
      </div>
    </Modal>
  )
}

function RemoveDialog({
  orgId,
  member,
  onClose,
}: {
  orgId: number
  member: Member
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [remove, { isLoading }] = useRemoveMemberMutation()

  async function submit() {
    try {
      const result = await remove({ orgId, userId: member.user_id }).unwrap()
      Toast.success(
        `已移除 ${member.email}${result?.revoked_sessions ? `，撤销 ${result.revoked_sessions} 个会话` : ''}`,
      )
      onClose()
    } catch (err) {
      setError((err as ApiError).message || '移除失败')
    }
  }

  return (
    <Modal
      title="移除成员"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn danger" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '移除中…' : '移除'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="banner danger" style={{ padding: '10px 12px' }}>
        <div>
          即将移除 <b>{member.email}</b>。同一事务内会撤销其在本组织的全部活跃 compat
          会话，操作不可撤销。
        </div>
      </div>
      <div className="help" style={{ marginTop: 10 }}>
        admin 不能移除 owner；最后一个 owner 不能被移除。
      </div>
    </Modal>
  )
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
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
          <button className="btn primary" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="banner warning" style={{ padding: '10px 12px' }}>
        <div>{body}</div>
      </div>
    </Modal>
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
  title,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className="btn borderless sm"
      style={danger ? { color: 'var(--danger)' } : undefined}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function summarizeRoles(members: Member[]): string {
  if (!members.length) return ''
  const counts = new Map<string, number>()
  for (const member of members) {
    const label = member.role_name || member.role
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, n]) => `${label} ${n}`).join(' · ')
}

function currentRoleLabel(members: Member[], userId?: number): string {
  const mine = members.find((member) => member.user_id === userId)
  return mine?.role_name ?? '—'
}
