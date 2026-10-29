import { Banner, Empty, Toast } from '@douyinfe/semi-ui'

import { useMemo, useRef, useState } from 'react'

import type { Member, UserGroup } from '../../lib/api'
import { accessError, diffIds, groupMemberSummary, sameIdSet } from '../../lib/access-control'
import { formatTime } from '../../lib/format'
import {
  useCreateUserGroupMutation,
  useDeleteUserGroupMutation,
  useGetMembersQuery,
  useGetUserGroupsQuery,
  useRenameUserGroupMutation,
  useReplaceUserGroupMembersMutation,
} from '../../store/api'
import { ConfirmDelete } from '../addressbooks/AddressBookDialogs'
import { ErrorBanner, GroupNameDialog, SaveDialog } from './AccessDialogs'

export default function UserGroupsTab({ orgId }: { orgId: number }) {
  const {
    currentData: groups,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetUserGroupsQuery(orgId)
  const { currentData: members, isFetching: membersFetching } = useGetMembersQuery(orgId)
  const [createGroup] = useCreateUserGroupMutation()
  const [renameGroup] = useRenameUserGroupMutation()
  const [removeGroup, removeState] = useDeleteUserGroupMutation()

  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<UserGroup | null>(null)
  const [editingMembers, setEditingMembers] = useState<UserGroup | null>(null)
  const [deleting, setDeleting] = useState<UserGroup | null>(null)

  const loadingCurrent = isLoading || (isFetching && groups === undefined)

  async function confirmDelete() {
    if (!deleting) return
    try {
      const result = await removeGroup({ orgId, groupId: deleting.id }).unwrap()
      Toast.success(
        `已删除「${deleting.name}」：移除 ${result.removed_rules} 条规则、${result.removed_grants} 个地址簿授权`,
      )
      setDeleting(null)
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        Toast.error('该用户组已不存在，列表已刷新')
        setDeleting(null)
        void refetch()
      } else {
        Toast.error(accessError(err))
      }
    }
  }

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div className="card-title">
            用户组<span className="hint">everyone 为保留组，成员隐式包含所有有效成员</span>
          </div>
          <button
            className="btn primary sm"
            type="button"
            disabled={!groups}
            onClick={() => setCreating(true)}
          >
            新建用户组
          </button>
        </div>

        {error ? (
          <div className="card-body">
            <Banner
              type="danger"
              closeIcon={null}
              description={`加载用户组失败：${accessError(error)}`}
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
        ) : null}

        {!error || groups ? (
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载用户组…
              </div>
            ) : (groups ?? []).length === 0 ? (
              <Empty title="还没有用户组" description="新建用户组后即可按组配置访问规则" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th style={{ width: 110 }}>类型</th>
                    <th style={{ width: 150 }}>成员</th>
                    <th style={{ width: 160 }}>更新时间</th>
                    <th style={{ width: 210 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(groups ?? []).map((group) => {
                    const everyone = group.kind === 'everyone'
                    return (
                      <tr key={group.id}>
                        <td className="cell-wrap">{group.name}</td>
                        <td>
                          <span className={`tag ${everyone ? 'grey' : 'blue'}`}>
                            {everyone ? '保留组' : '自定义'}
                          </span>
                        </td>
                        <td className="cell-wrap">{groupMemberSummary(group)}</td>
                        <td className="mono">{formatTime(group.updated_at)}</td>
                        <td>
                          <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            {everyone ? (
                              <span className="help">成员不可编辑</span>
                            ) : (
                              <>
                                <button
                                  className="btn borderless sm"
                                  type="button"
                                  onClick={() => setEditingMembers(group)}
                                >
                                  成员
                                </button>
                                <button
                                  className="btn borderless sm"
                                  type="button"
                                  onClick={() => setRenaming(group)}
                                >
                                  重命名
                                </button>
                                <button
                                  className="btn borderless sm"
                                  type="button"
                                  style={{ color: 'var(--danger)' }}
                                  onClick={() => setDeleting(group)}
                                >
                                  删除
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>

      <p className="help" style={{ marginTop: 12 }}>
        成员变更即时影响规则评估；停用会籍可保留在组内，但不会贡献访问。
      </p>

      {creating ? (
        <GroupNameDialog
          title="新建用户组"
          label="用户组名称"
          kind="user"
          groups={groups ?? []}
          onSave={async (name) => {
            await createGroup({ orgId, name }).unwrap()
            Toast.success('用户组已创建')
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {renaming ? (
        <GroupNameDialog
          title="重命名用户组"
          label="用户组名称"
          kind="user"
          initial={renaming.name}
          groups={groups ?? []}
          exceptId={renaming.id}
          onSave={async (name) => {
            await renameGroup({ orgId, groupId: renaming.id, name }).unwrap()
            Toast.success('用户组已重命名')
          }}
          onClose={() => setRenaming(null)}
        />
      ) : null}

      {editingMembers ? (
        <MembersDialog
          key={`${orgId}-${editingMembers.id}`}
          orgId={orgId}
          group={editingMembers}
          members={members ?? []}
          membersLoading={membersFetching && members === undefined}
          onClose={() => setEditingMembers(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDelete
          title="删除用户组"
          confirmLabel="删除"
          busy={removeState.isLoading}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          body={
            <>
              删除「{deleting.name}
              」会同时删除以它为来源或目标的访问规则，并撤销以它为主体的共享地址簿授权。
              该操作不可恢复。
            </>
          }
        />
      ) : null}
    </>
  )
}

function MembersDialog({
  orgId,
  group,
  members,
  membersLoading,
  onClose,
}: {
  orgId: number
  group: UserGroup
  members: Member[]
  membersLoading: boolean
  onClose: () => void
}) {
  const baseline = useRef<number[]>([...group.member_ids])
  const [selected, setSelected] = useState(() => new Set(group.member_ids))
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { refetch } = useGetUserGroupsQuery(orgId)
  const [replace, replaceState] = useReplaceUserGroupMembersMutation()

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return members
    return members.filter((member) => member.email.toLowerCase().includes(term))
  }, [members, search])

  const change = diffIds(baseline.current, [...selected])

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const latest = await refetch().unwrap()
      const current = latest.find((item) => item.id === group.id)
      if (!current) {
        Toast.error('该用户组已不存在，列表已刷新')
        onClose()
        return
      }
      if (!sameIdSet(current.member_ids, baseline.current)) {
        setError('该组成员已被其他人修改，请关闭后重新打开')
        return
      }
      const result = await replace({
        orgId,
        groupId: group.id,
        userIds: [...selected],
      }).unwrap()
      Toast.success(`成员已更新：新增 ${result.added}，移除 ${result.removed}`)
      onClose()
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        Toast.error('该用户组已不存在，列表已刷新')
        onClose()
        void refetch()
        return
      }
      setError(accessError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SaveDialog
      title={`编辑成员 · ${group.name}`}
      busy={replaceState.isLoading || membersLoading || saving}
      onClose={onClose}
      onSave={() => void save()}
      saveDisabled={membersLoading || saving}
    >
      <ErrorBanner message={error} />
      <div className="field mb-14">
        <div className="input">
          <input
            value={search}
            placeholder="按邮箱搜索成员"
            aria-label="搜索成员"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="help mb-14">
        已选 {selected.size} 人 · 本次新增 {change.added}、移除 {change.removed}
        。保存会以当前勾选集合全量替换。
      </div>
      {error?.includes('已被其他人修改') ? null : membersLoading ? (
        <div className="help" role="status">
          正在加载成员…
        </div>
      ) : filtered.length === 0 ? (
        <div className="help">没有匹配的成员</div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map((member) => (
            <label
              key={member.user_id}
              className="check"
              style={{ display: 'flex', margin: '6px 0' }}
            >
              <input
                type="checkbox"
                checked={selected.has(member.user_id)}
                onChange={(event) => {
                  setError(null)
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (event.target.checked) next.add(member.user_id)
                    else next.delete(member.user_id)
                    return next
                  })
                }}
              />
              <span className="cell-wrap">{member.email}</span>
              {member.disabled ? <span className="tag grey">停用</span> : null}
            </label>
          ))}
        </div>
      )}
    </SaveDialog>
  )
}
