import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import Modal from '../../components/Modal'
import StateBlock from '../../components/StateBlock'
import type { ControlRole } from '../../lib/api'
import {
  controlRoleError,
  isBuiltinRole,
  memberCountForRole,
  permissionCounts,
} from '../../lib/control-role'
import { formatTime } from '../../lib/format'
import {
  useDeleteControlRoleMutation,
  useGetControlRolesQuery,
  useGetMeQuery,
  useGetMembersQuery,
} from '../../store/api'
import MemberAssignments from './MemberAssignments'
import RoleEditor from './RoleEditor'

export default function ControlRolesPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canManage = perms.has('control_role.manage')
  const validId = Number.isSafeInteger(id) && id > 0

  const {
    currentData: roles,
    isLoading: rolesLoading,
    error: rolesError,
    refetch: refetchRoles,
  } = useGetControlRolesQuery(id, { skip: !validId || !canManage })
  const {
    currentData: members,
    isLoading: membersLoading,
    isFetching: membersFetching,
    error: membersError,
    refetch: refetchMembers,
  } = useGetMembersQuery(id, { skip: !validId || !canManage })
  const [deleteRole] = useDeleteControlRoleMutation()
  const [editing, setEditing] = useState<{ role?: ControlRole } | null>(null)
  const [deleting, setDeleting] = useState<ControlRole | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setEditing(null)
    setDeleting(null)
    setActionError(null)
    setDeleteError(null)
    setBusy(false)
  }, [id])

  if (!validId) {
    return <StateBlock code="404" title="组织不存在" description="组织 id 不合法。" />
  }
  if (meLoading) {
    return (
      <section className="page on">
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载权限…
            </div>
          </div>
        </div>
      </section>
    )
  }
  if (!me || !current) {
    return (
      <StateBlock
        code="403"
        title="没有控制角色管理权限"
        description="无法确认当前组织与权限，请重新登录或联系管理员。"
      />
    )
  }
  if (!canManage) {
    return (
      <StateBlock
        code="403"
        title="没有控制角色管理权限"
        description="当前角色没有 control_role.manage；该权限只由 owner/admin 持有，且不可委派。"
      />
    )
  }

  const list = roles ?? []
  const memberList = members ?? []

  async function remove() {
    if (!deleting || busy) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteRole({ orgId: id, roleId: deleting.id }).unwrap()
      setDeleting(null)
      Toast.success('控制角色已删除')
    } catch (err) {
      setDeleteError(controlRoleError(err, 'role-delete', isBuiltinRole(deleting)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">控制角色</h1>
          <div className="page-sub">
            14 项会话内动作 × 三态；只约束 panel 会话，原生会话不受约束
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={rolesLoading && !roles}
            onClick={() => setEditing({})}
          >
            新建角色
          </button>
        </div>
      </div>

      <div className="banner info mb-14">
        <div>
          <b>允许 / 拒绝 / 继承。</b>
          继承表示不覆盖被控端本地设置。控制角色只影响 panel 发起的会话；原生客户端直连的权限位图由
          hbbs 信令注入，面板不在链路，无法在此约束。
        </div>
      </div>

      {actionError ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{actionError}</div>
        </div>
      ) : null}

      {rolesError ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载控制角色失败。</b>
            {controlRoleError(rolesError, 'roles')}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetchRoles()}>
            重试
          </button>
        </div>
      ) : null}

      {rolesError && list.length === 0 ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {rolesLoading && !roles ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载控制角色…
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th style={{ width: 90 }}>类型</th>
                    <th style={{ width: 80 }}>成员</th>
                    <th>权限摘要</th>
                    <th style={{ width: 150 }}>更新时间</th>
                    <th style={{ width: 120 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((role) => {
                    const counts = permissionCounts(role.permissions)
                    const builtin = isBuiltinRole(role)
                    return (
                      <tr key={role.id}>
                        <td className="cell-wrap">{role.name}</td>
                        <td>
                          <span className={`tag ${builtin ? 'primary' : 'grey'}`}>
                            {builtin ? 'Default' : '自定义'}
                          </span>
                        </td>
                        <td className="mono">
                          {membersError || membersLoading || membersFetching
                            ? '—'
                            : memberCountForRole(role, list, memberList)}
                        </td>
                        <td>
                          <span className="tag green">允许 {counts.enable}</span>{' '}
                          <span className="tag red">拒绝 {counts.disable}</span>{' '}
                          <span className="tag grey">继承 {counts.inherit}</span>
                        </td>
                        <td className="mono">{formatTime(role.updated_at)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn borderless sm"
                            type="button"
                            onClick={() => setEditing({ role })}
                          >
                            编辑
                          </button>
                          {!builtin ? (
                            <button
                              className="btn danger sm"
                              type="button"
                              onClick={() => {
                                setDeleteError(null)
                                setDeleting(role)
                              }}
                            >
                              删除
                            </button>
                          ) : null}
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

      <MemberAssignments
        orgId={id}
        roles={list}
        members={memberList}
        membersError={membersError}
        membersLoading={membersLoading}
        membersFetching={membersFetching}
        onRetryMembers={() => void refetchMembers()}
        rolesLoading={rolesLoading}
        rolesError={rolesError}
        onRetryRoles={() => void refetchRoles()}
      />

      {editing ? (
        <RoleEditor orgId={id} role={editing.role} roles={list} onClose={() => setEditing(null)} />
      ) : null}

      {deleting ? (
        <Modal
          title={`删除控制角色「${deleting.name}」`}
          onClose={() => {
            if (!busy) {
              setDeleting(null)
              setDeleteError(null)
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
                  setDeleteError(null)
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
          <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
            <div>持有该角色的成员会回退组织内置 Default；删除与分配清理由服务端同事务完成。</div>
          </div>
          {deleteError ? (
            <div className="banner danger" style={{ padding: '9px 11px' }}>
              <div>{deleteError}</div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </section>
  )
}
