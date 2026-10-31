import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import Modal from '../../components/Modal'
import type { Permission, Role } from '../../lib/api'
import {
  auditScopeLabel,
  permissionGroups,
  permissionLabel,
  rbacRoleNameProblem,
  roleEditorError,
  unknownPermissions,
} from '../../lib/role-editor'
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  useGetMeQuery,
  useGetPermissionsQuery,
  useGetRolesQuery,
  useUpdateRoleMutation,
} from '../../store/api'

type Editor = { mode: 'create'; instance: number } | { mode: 'edit'; role: Role; instance: number }

function kindLabel(kind: string): string {
  switch (kind) {
    case 'owner':
      return 'owner · 内置'
    case 'admin':
      return 'admin · 内置'
    case 'member':
      return 'member · 内置'
    default:
      return 'custom · 自定义'
  }
}

function kindColor(kind: string): string {
  if (kind === 'owner') return 'orange'
  if (kind === 'admin') return 'blue'
  if (kind === 'member') return 'green'
  return 'grey'
}

export default function RolesPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me } = useGetMeQuery()
  const { currentData: data, isLoading, isFetching, error } = useGetRolesQuery(id, { skip: !id })
  const permissionsQuery = useGetPermissionsQuery()
  const loadingCurrent = isLoading || (isFetching && data === undefined)
  const roles = data ?? []
  const current = me?.orgs.find((org) => org.id === id)
  const canManage = current?.permissions.includes('role.manage') ?? false
  const custom = roles.filter((role) => role.kind === 'custom').length
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<{ role: Role; instance: number } | null>(null)
  const editorSeq = useRef(0)
  const deleteSeq = useRef(0)

  // The page survives :orgId changes; a dialog opened against one organization
  // must not submit its role id under the next one.
  useEffect(() => {
    setEditor(null)
    setDeleting(null)
  }, [id])

  function openEditor(next: { mode: 'create' } | { mode: 'edit'; role: Role }) {
    setEditor({ ...next, instance: ++editorSeq.current })
  }
  function openDelete(role: Role) {
    setDeleting({ role, instance: ++deleteSeq.current })
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">角色与权限</h1>
          <div className="page-sub">
            共 {roles.length} 个角色 · 内置 {roles.length - custom} · 自定义 {custom}
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={!canManage}
            title={canManage ? '新建自定义角色' : '需要 role.manage（仅 owner 可管理角色）'}
            onClick={() => openEditor({ mode: 'create' })}
          >
            新建自定义角色
          </button>
        </div>
      </div>

      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`加载角色失败：${(error as { message?: string }).message ?? '未知错误'}`}
        />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="card-title">
              角色<span className="hint">内置角色权限固定，自定义角色只能取可委派权限</span>
            </div>
          </div>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" style={{ padding: '14px 0' }}>
                正在加载角色…
              </div>
            ) : roles.length === 0 ? (
              <Empty
                title="还没有角色"
                description="组织初始化会生成 owner/admin/member 三个内置角色"
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>角色</th>
                    <th style={{ width: 170 }}>类型</th>
                    <th style={{ width: 120 }}>权限数</th>
                    <th style={{ width: 140 }}>审计范围</th>
                    <th>权限预览</th>
                    <th style={{ width: 150 }} />
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role: Role) => (
                    <tr key={role.id}>
                      <td>
                        <div style={{ fontSize: 13 }}>{role.name}</div>
                        <div className="mono help">role #{role.id}</div>
                      </td>
                      <td>
                        <span className={`tag ${kindColor(role.kind)}`}>
                          {kindLabel(role.kind)}
                        </span>
                      </td>
                      <td className="mono">{role.permissions.length}</td>
                      <td>
                        <span className="tag grey">{auditScopeLabel(role.audit_scope)}</span>
                      </td>
                      <td>
                        <div className="hstack" style={{ flexWrap: 'wrap', gap: 4 }}>
                          {role.permissions.slice(0, 4).map((perm) => (
                            <span key={perm} className="tag grey">
                              {permissionLabel(perm)}
                            </span>
                          ))}
                          {role.permissions.length > 4 ? (
                            <span className="help">+{role.permissions.length - 4}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {role.builtin ? (
                          <span className="help">内置固定</span>
                        ) : (
                          <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn outline sm"
                              type="button"
                              disabled={!canManage}
                              title={canManage ? '编辑角色' : '需要 role.manage'}
                              onClick={() => openEditor({ mode: 'edit', role })}
                            >
                              编辑
                            </button>
                            <button
                              className="btn danger sm"
                              type="button"
                              disabled={!canManage}
                              title={canManage ? '删除角色' : '需要 role.manage'}
                              onClick={() => openDelete(role)}
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        owner/admin 不受访问规则限制；自定义角色仅可包含权限目录中可委派的权限码。
      </p>

      {editor ? (
        <RoleEditor
          orgId={id}
          role={editor.mode === 'edit' ? editor.role : undefined}
          roles={roles}
          permissions={permissionsQuery.data ?? []}
          permissionsLoading={permissionsQuery.isLoading || permissionsQuery.isFetching}
          permissionsError={permissionsQuery.error}
          onRetryPermissions={() => void permissionsQuery.refetch()}
          onClose={() => setEditor((prev) => (prev?.instance === editor.instance ? null : prev))}
        />
      ) : null}
      {deleting ? (
        <DeleteRoleDialog
          orgId={id}
          role={deleting.role}
          onClose={() =>
            setDeleting((prev) => (prev?.instance === deleting.instance ? null : prev))
          }
        />
      ) : null}
    </section>
  )
}

function RoleEditor({
  orgId,
  role,
  roles,
  permissions,
  permissionsLoading,
  permissionsError,
  onRetryPermissions,
  onClose,
}: {
  orgId: number
  role?: Role
  roles: Role[]
  permissions: Permission[]
  permissionsLoading: boolean
  permissionsError: unknown
  onRetryPermissions: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [scope, setScope] = useState<Role['audit_scope']>(role?.audit_scope ?? 'individual')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions ?? []))
  const [error, setError] = useState('')
  const [createRole, { isLoading: creating }] = useCreateRoleMutation()
  const [updateRole, { isLoading: updating }] = useUpdateRoleMutation()
  const scopeRef = useRef(orgId)
  useLayoutEffect(() => {
    scopeRef.current = orgId
  }, [orgId])
  const groups = useMemo(() => permissionGroups(permissions), [permissions])
  const catalogReady = !permissionsLoading && !permissionsError
  const unknown = role && catalogReady ? unknownPermissions(role, permissions) : []
  const nonDelegableSelected = catalogReady
    ? permissions.filter((permission) => !permission.delegable && selected.has(permission.code))
    : []
  const saving = creating || updating
  const catalogBlocked = !catalogReady || unknown.length > 0 || nonDelegableSelected.length > 0
  const assignable = permissions.filter((permission) => permission.delegable)

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function submit() {
    setError('')
    const problem = rbacRoleNameProblem(name, roles, role?.id)
    if (problem) {
      setError(problem)
      return
    }
    if (catalogBlocked) return
    const input = {
      name: name.trim(),
      permissions: [...selected],
      audit_scope: scope,
    }
    try {
      if (role) await updateRole({ orgId, roleId: role.id, input }).unwrap()
      else await createRole({ orgId, input }).unwrap()
      if (scopeRef.current !== orgId) return
      Toast.success(role ? '角色已更新' : '角色已创建')
      onClose()
    } catch (err) {
      if (scopeRef.current === orgId) {
        setError(roleEditorError(err, role ? 'update' : 'create', role?.builtin))
      }
    }
  }

  function selectAllDelegable() {
    setSelected((prev) => {
      const next = new Set(prev)
      assignable.forEach((permission) => next.add(permission.code))
      return next
    })
  }

  return (
    <Modal
      title={role ? '编辑角色' : '新建自定义角色'}
      onClose={() => {
        if (!saving) onClose()
      }}
      width={760}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={saving || catalogBlocked}
            onClick={() => void submit()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      {!permissionsLoading && permissionsError ? (
        <div className="banner warning mb-14" role="alert">
          <div>
            {roleEditorError(permissionsError, 'permissions')}
            <div style={{ marginTop: 8 }}>
              <button className="btn outline sm" type="button" onClick={onRetryPermissions}>
                重试
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {unknown.length > 0 ? (
        <div className="banner warning mb-14" role="alert">
          <div>
            该角色包含当前权限目录未识别的权限码（{unknown.join('、')}
            ）。请升级控制台后再编辑，避免全量保存丢失权限。
          </div>
        </div>
      ) : null}
      {nonDelegableSelected.length > 0 ? (
        <div className="banner warning mb-14" role="alert">
          <div>
            该角色包含 owner 专属权限（
            {nonDelegableSelected.map((permission) => permission.code).join('、')}
            ），不能保存；请升级控制台后再处理。
          </div>
        </div>
      ) : null}

      <div className="field mb-14">
        <label className="form-label" htmlFor="role-name">
          <span className="req">*</span>角色名称
        </label>
        <div className="input">
          <input
            id="role-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：审计员"
            maxLength={64}
            autoFocus
          />
        </div>
        <div className="help">1–64 个字符，不能与内置或其他角色重名。</div>
      </div>

      <fieldset className="field mb-14" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="form-label">审计范围</legend>
        <div className="hstack" style={{ gap: 16 }}>
          {(['individual', 'global'] as const).map((value) => (
            <label key={value} className="check">
              <input
                type="radio"
                name="role-audit-scope"
                checked={scope === value}
                onChange={() => setScope(value)}
              />
              {value === 'individual' ? '仅本人相关' : '全组织审计'}
            </label>
          ))}
        </div>
        <div className="help">
          仅对持有 audit.read 的角色有意义；全组织审计可查看所有成员的操作记录。
        </div>
      </fieldset>

      <fieldset className="field mb-14" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="form-label">权限</legend>
        {permissionsLoading ? <div className="help mb-14">正在加载权限目录…</div> : null}
        {!permissionsLoading && permissionsError ? null : (
          <>
            <div className="hstack mb-14">
              <span className="help">
                已选 {selected.size} 项 · 可委派 {assignable.length} 项
              </span>
              <div className="spacer" />
              <button className="btn borderless sm" type="button" onClick={selectAllDelegable}>
                全选可委派
              </button>
              <button
                className="btn borderless sm"
                type="button"
                onClick={() => setSelected(new Set())}
              >
                清空
              </button>
            </div>
            <div className="vstack" style={{ gap: 14 }}>
              {groups.map((group) => (
                <div key={group.title}>
                  <div className="help" style={{ marginBottom: 6 }}>
                    {group.title}
                  </div>
                  <div
                    className="grid"
                    role="group"
                    aria-label={group.title}
                    style={{
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: 6,
                    }}
                  >
                    {group.items.map((permission) => (
                      <label
                        key={permission.code}
                        className="check"
                        style={{ opacity: permission.delegable ? 1 : 0.6 }}
                        title={
                          permission.delegable
                            ? permission.code
                            : `${permission.code}（owner 专属，不可授予自定义角色）`
                        }
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(permission.code)}
                          disabled={!permission.delegable}
                          onChange={() => toggle(permission.code)}
                        />
                        <span>
                          {permissionLabel(permission.code)}
                          <span className="mono help" style={{ marginLeft: 6 }}>
                            {permission.code}
                          </span>
                        </span>
                        {permission.delegable ? null : <span className="tag grey">owner 专属</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </fieldset>
    </Modal>
  )
}

function DeleteRoleDialog({
  orgId,
  role,
  onClose,
}: {
  orgId: number
  role: Role
  onClose: () => void
}) {
  const [error, setError] = useState('')
  const [deleteRole, { isLoading }] = useDeleteRoleMutation()
  const scopeRef = useRef(orgId)
  useLayoutEffect(() => {
    scopeRef.current = orgId
  }, [orgId])

  async function submit() {
    setError('')
    try {
      await deleteRole({ orgId, roleId: role.id }).unwrap()
      if (scopeRef.current !== orgId) return
      Toast.success('角色已删除')
      onClose()
    } catch (err) {
      if (scopeRef.current === orgId) setError(roleEditorError(err, 'delete', role.builtin))
    }
  }

  return (
    <Modal
      title="删除角色"
      onClose={() => {
        if (!isLoading) onClose()
      }}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button
            className="btn danger solid"
            type="button"
            disabled={isLoading}
            onClick={() => void submit()}
          >
            {isLoading ? '删除中…' : '删除角色'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <p>
        确认删除自定义角色 <b>{role.name}</b>？
      </p>
      <p className="help">
        删除不可撤销；仍被成员使用的角色会被服务端拒绝，请先将这些成员改派到其他角色。
      </p>
    </Modal>
  )
}
