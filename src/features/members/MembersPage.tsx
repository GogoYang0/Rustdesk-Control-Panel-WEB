import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useParams } from 'react-router'

import type { Member } from '../../lib/api'
import { useGetMeQuery, useGetMembersQuery } from '../../store/api'

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

export default function MembersPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me } = useGetMeQuery()
  const { data, isLoading, error } = useGetMembersQuery(id, { skip: !id })

  const members = data ?? []
  const canManage = me?.orgs.find((org) => org.id === id)?.permissions.includes('member.manage') ?? false
  const active = members.filter((m) => !m.disabled).length
  const disabled = members.length - active
  const roleMix = summarizeRoles(members)

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">组织与成员</h1>
          <div className="page-sub">
            共 {members.length} 名成员 · 正常 {active} · 停用 {disabled}
            {roleMix ? ` · ${roleMix}` : ''}
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={!canManage}
            title={canManage ? '邀请成员' : '需要 member.manage 权限'}
            onClick={() => Toast.info('邀请成员将在下一步接入')}
          >
            邀请成员
          </button>
        </div>
      </div>

      <div className="grid-3 mb-14">
        <div className="card">
          <div className="card-body">
            <div className="help">成员</div>
            <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {members.length} <span className="help" style={{ fontWeight: 400 }}>人</span>
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              正常 {active} · 停用 {disabled}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="help">当前角色</div>
            <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, marginTop: 2 }}>
              {currentRoleLabel(members, me?.user.id)}
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              权限由角色决定，owner/admin 不受访问规则限制
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="help">外部身份</div>
            <div style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, marginTop: 2 }}>
              {members.length ? '—' : '0'}
            </div>
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
          <div className="card-body tight">
            {isLoading ? (
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
                    <th style={{ width: 160 }}>角色</th>
                    <th style={{ width: 120 }}>状态</th>
                    <th style={{ width: 180 }}>加入时间</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <div style={{ fontSize: 13 }}>{member.email}</div>
                        <div className="mono help">user #{member.user_id}</div>
                      </td>
                      <td>
                        <span className={`tag ${roleColor(member.role_kind)}`}>{member.role_name}</span>
                      </td>
                      <td>
                        {member.disabled ? (
                          <span className="tag red">已停用</span>
                        ) : (
                          <span className="tag green">正常</span>
                        )}
                      </td>
                      <td className="mono">{formatTime(member.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        停用/移除会撤销该成员的 compat 会话；面板会话按每请求会籍复核。
      </p>
    </section>
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

function formatTime(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 16).replace('T', ' ')
}
