import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useMemo, useState } from 'react'

import Modal from '../../components/Modal'
import type {
  AddressBook,
  AddressBookGrant,
  AddressBookGrantKind,
  Member,
  UserGroup,
} from '../../lib/api'
import {
  GRANT_ACCESS,
  accessLabel,
  accessTone,
  addressBookGrantError,
  findGrant,
  grantImpactNote,
  grantableGroups,
  subjectLabel,
  toGrantRequest,
  validateGrantForm,
  type GrantForm,
} from '../../lib/addressbook-grant'
import { formatTime } from '../../lib/format'
import {
  useCreateAddressBookGrantMutation,
  useDeleteAddressBookGrantMutation,
  useGetAddressBookGrantsQuery,
} from '../../store/api'
import { ConfirmDelete } from './AddressBookDialogs'

const KIND_LABELS: Record<AddressBookGrantKind, string> = {
  user: '成员',
  user_group: '用户组',
  everyone: '所有人',
}

export default function BookGrantsPanel({
  orgId,
  book,
  emails,
  members,
  groups,
  canManageGroups,
}: {
  orgId: number
  book: AddressBook
  emails: Map<number, string>
  members: Member[]
  groups: UserGroup[]
  canManageGroups: boolean
}) {
  const {
    currentData: grants,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAddressBookGrantsQuery({ orgId, bookId: book.id })
  const [editing, setEditing] = useState<AddressBookGrant | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<AddressBookGrant | null>(null)
  const [busy, setBusy] = useState(false)
  const [remove] = useDeleteAddressBookGrantMutation()

  const groupNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const group of groups) map.set(group.id, group.name)
    return map
  }, [groups])

  async function confirmRevoke() {
    if (!revoking) return
    setBusy(true)
    try {
      await remove({ orgId, bookId: book.id, grantId: revoking.id }).unwrap()
      Toast.success('授权已撤销')
      setRevoking(null)
    } catch (err) {
      const status = (err as { status?: number }).status
      Toast.error(addressBookGrantError(err))
      if (status === 404) {
        setRevoking(null)
        void refetch()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-head">
        <div className="card-title">
          授权<span className="hint">user 授权优先于 everyone；重复添加同一主体会更新级别</span>
        </div>
        <button
          className="btn primary sm"
          type="button"
          disabled={!grants}
          title={grants ? undefined : '先等授权列表加载完成，避免盲目 upsert'}
          onClick={() => setCreating(true)}
        >
          添加授权
        </button>
      </div>
      <div className="card-body tight" style={{ overflowX: 'auto' }}>
        {isLoading ? (
          <div className="help" role="status" style={{ padding: '14px 0' }}>
            正在加载授权…
          </div>
        ) : error ? (
          <div>
            <Banner
              type="danger"
              closeIcon={null}
              description={`加载授权失败：${addressBookGrantError(error)}`}
            />
            <button
              className="btn outline sm"
              type="button"
              style={{ marginTop: 8 }}
              onClick={() => void refetch()}
            >
              重试
            </button>
          </div>
        ) : (grants ?? []).length === 0 ? (
          <Empty
            title="还没有授权"
            description="共享簿默认成员只读；添加授权可提升指定成员或范围"
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>主体</th>
                <th style={{ width: 130 }}>访问级别</th>
                <th style={{ width: 190 }}>创建人</th>
                <th style={{ width: 160 }}>创建时间</th>
                <th style={{ width: 160 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(grants ?? []).map((grant) => (
                <tr key={grant.id}>
                  <td className="cell-wrap">
                    {/* "所有人" would otherwise appear twice: the kind tag and
                        the subject label are the same word. */}
                    {grant.subject_kind === 'everyone' ? null : (
                      <>
                        <span className="tag grey">{KIND_LABELS[grant.subject_kind]}</span>{' '}
                      </>
                    )}
                    {subjectLabel(grant, emails, groupNames)}
                  </td>
                  <td>
                    <span className={`tag ${accessTone(grant.access)}`}>
                      {accessLabel(grant.access)}
                    </span>
                  </td>
                  <td className="cell-wrap">
                    {emails.get(grant.created_by) ?? `用户 #${grant.created_by}`}
                  </td>
                  <td className="mono">{formatTime(grant.created_at)}</td>
                  <td>
                    <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        className="btn borderless sm"
                        type="button"
                        onClick={() => setEditing(grant)}
                      >
                        修改权限
                      </button>
                      <button
                        className="btn borderless sm"
                        type="button"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setRevoking(grant)}
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
        {isFetching && !isLoading ? (
          <div className="help" style={{ marginTop: 8 }}>
            正在刷新授权…
          </div>
        ) : null}
      </div>

      {creating || editing ? (
        <GrantDialog
          key={editing ? `edit-${editing.id}` : 'create'}
          orgId={orgId}
          bookId={book.id}
          grants={grants ?? []}
          members={members}
          groups={grantableGroups(groups)}
          canManageGroups={canManageGroups}
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onDone={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      ) : null}

      {revoking ? (
        <ConfirmDelete
          title="撤销授权"
          confirmLabel="撤销"
          busy={busy}
          onClose={() => setRevoking(null)}
          onConfirm={() => void confirmRevoke()}
          body={
            revoking.subject_kind === 'everyone' ? (
              <>
                撤销「所有人」的 {accessLabel(revoking.access)} 授权后，未被 user
                或用户组授权覆盖的成员将回到共享簿的默认只读。
              </>
            ) : (
              <>
                撤销 <b>{subjectLabel(revoking, emails, groupNames)}</b> 的{' '}
                {accessLabel(revoking.access)} 授权。该主体仍可能通过 everyone
                或其他用户组获得访问。
              </>
            )
          }
        />
      ) : null}
    </div>
  )
}

function GrantDialog({
  orgId,
  bookId,
  grants,
  members,
  groups,
  canManageGroups,
  initial,
  onClose,
  onDone,
}: {
  orgId: number
  bookId: number
  grants: AddressBookGrant[]
  members: Member[]
  groups: UserGroup[]
  canManageGroups: boolean
  initial?: AddressBookGrant
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState<GrantForm>(() => ({
    kind: initial?.subject_kind ?? 'user',
    userId: initial?.subject_user_id ? String(initial.subject_user_id) : '',
    groupId: initial?.subject_group_id ? String(initial.subject_group_id) : '',
    access: initial?.access ?? 'read',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [save, { isLoading }] = useCreateAddressBookGrantMutation()

  const subject =
    form.kind === 'user'
      ? { subject_kind: 'user' as const, subject_user_id: Number(form.userId || 0) }
      : form.kind === 'user_group'
        ? { subject_kind: 'user_group' as const, subject_group_id: Number(form.groupId || 0) }
        : { subject_kind: 'everyone' as const }
  const existing =
    form.userId || form.groupId || form.kind === 'everyone' ? findGrant(grants, subject) : undefined
  const impact = grantImpactNote(form.kind, form.access)
  const activeMembers = members.filter(
    (member) => !member.disabled || member.user_id === initial?.subject_user_id,
  )

  function patch(next: Partial<GrantForm>) {
    setForm((prev) => ({ ...prev, ...next }))
    setErrors((prev) => {
      const copy = { ...prev }
      for (const key of Object.keys(next)) delete copy[key]
      return copy
    })
  }

  async function submit() {
    const nextErrors = validateGrantForm(form)
    setErrors(nextErrors)
    setError(null)
    if (Object.keys(nextErrors).length > 0) return
    try {
      await save({ orgId, bookId, request: toGrantRequest(form) }).unwrap()
      Toast.success(existing ? '授权已更新' : '授权已添加')
      onDone()
    } catch (err) {
      setError(addressBookGrantError(err))
    }
  }

  return (
    <Modal
      title={existing ? '更新授权' : '添加授权'}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '保存中…' : existing ? '更新' : '添加'}
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
        <label className="form-label">主体类型</label>
        <div className="chips" role="group" aria-label="主体类型" style={{ margin: 0 }}>
          {(['user', 'user_group', 'everyone'] as AddressBookGrantKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip-btn ${form.kind === kind ? 'on' : ''}`}
              aria-pressed={form.kind === kind}
              disabled={
                Boolean(initial) ||
                (kind === 'user_group' && (!canManageGroups || groups.length === 0))
              }
              title={
                kind === 'user_group' && !canManageGroups
                  ? '列用户组需要 access.manage 权限'
                  : undefined
              }
              onClick={() => patch({ kind, userId: '', groupId: '' })}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        {initial ? (
          <div className="help">已存在授权的主体不可更改；如需更换主体，请撤销后重新添加。</div>
        ) : null}
        {!canManageGroups ? (
          <div className="help">当前角色没有 access.manage，无法列用户组，因此不能按组授权。</div>
        ) : null}
      </div>

      {form.kind === 'user' ? (
        <div className="field mb-14">
          <label className="form-label">
            <span className="req">*</span>成员
          </label>
          <select
            className="select-native"
            aria-label="成员"
            value={form.userId}
            disabled={Boolean(initial)}
            onChange={(event) => patch({ userId: event.target.value })}
          >
            <option value="">请选择成员</option>
            {activeMembers.map((member) => (
              <option key={member.user_id} value={String(member.user_id)}>
                {member.email}
              </option>
            ))}
            {initial?.subject_user_id &&
            !members.some((member) => member.user_id === initial.subject_user_id) ? (
              <option value={String(initial.subject_user_id)}>
                用户 #{initial.subject_user_id}（不在成员字典中）
              </option>
            ) : null}
          </select>
          {errors.userId ? <div className="help err">{errors.userId}</div> : null}
          {activeMembers.length === 0 ? <div className="help">没有可选的活跃成员。</div> : null}
        </div>
      ) : null}

      {form.kind === 'user_group' ? (
        <div className="field mb-14">
          <label className="form-label">
            <span className="req">*</span>用户组
          </label>
          <select
            className="select-native"
            aria-label="用户组"
            value={form.groupId}
            disabled={Boolean(initial)}
            onChange={(event) => patch({ groupId: event.target.value })}
          >
            <option value="">请选择用户组</option>
            {groups.map((group) => (
              <option key={group.id} value={String(group.id)}>
                {group.name}
              </option>
            ))}
            {initial?.subject_group_id &&
            !groups.some((group) => group.id === initial.subject_group_id) ? (
              <option value={String(initial.subject_group_id)}>
                用户组 #{initial.subject_group_id}（不在用户组列表中）
              </option>
            ) : null}
          </select>
          {errors.groupId ? <div className="help err">{errors.groupId}</div> : null}
          <div className="help">内置 everyone 组不在此列出；它对应下面的「所有人」。</div>
        </div>
      ) : null}

      <div className="field mb-14">
        <label className="form-label">访问级别</label>
        <div className="chips" role="group" aria-label="访问级别" style={{ margin: 0 }}>
          {GRANT_ACCESS.map((access) => (
            <button
              key={access}
              type="button"
              className={`chip-btn ${form.access === access ? 'on' : ''}`}
              aria-pressed={form.access === access}
              onClick={() => patch({ access })}
            >
              {accessLabel(access)}
            </button>
          ))}
        </div>
        <div className="help">
          只读：可见 peers；可编辑 peers：可增删改整本 peers；完全管理：可改名、删除簿、管理授权。
        </div>
      </div>

      {existing ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>
            该主体已有 <b>{accessLabel(existing.access)}</b> 授权；保存会更新为{' '}
            <b>{accessLabel(form.access)}</b>。
          </div>
        </div>
      ) : null}
      {impact ? (
        <div className="banner info" style={{ padding: '9px 11px' }}>
          <div>{impact}</div>
        </div>
      ) : null}
    </Modal>
  )
}
