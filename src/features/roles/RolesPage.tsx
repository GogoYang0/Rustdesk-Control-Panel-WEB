import { Banner, Empty } from '@douyinfe/semi-ui'
import { useParams } from 'react-router'

import type { Role } from '../../lib/api'
import { useGetRolesQuery } from '../../store/api'

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
  const { data, isLoading, error } = useGetRolesQuery(id, { skip: !id })
  const roles = data ?? []
  const custom = roles.filter((role) => role.kind === 'custom').length

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
            className="btn outline sm"
            type="button"
            disabled
            title="自定义角色编辑将在后续接入"
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
          <div className="card-body tight">
            {isLoading ? (
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
                        <span className="tag grey">{role.audit_scope}</span>
                      </td>
                      <td>
                        <div className="hstack" style={{ flexWrap: 'wrap', gap: 4 }}>
                          {role.permissions.slice(0, 4).map((perm) => (
                            <span key={perm} className="tag grey">
                              {perm}
                            </span>
                          ))}
                          {role.permissions.length > 4 ? (
                            <span className="help">+{role.permissions.length - 4}</span>
                          ) : null}
                        </div>
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
    </section>
  )
}
