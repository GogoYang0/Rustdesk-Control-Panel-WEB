import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import {
  AUDIT_RANGES,
  AUDIT_TABS,
  DEFAULT_AUDIT_FILTERS,
  auditRangeLabel,
  auditTabLabel,
  parseAuditFilters,
  toAuditSearchParams,
  type AuditFilters,
  type AuditTab,
} from '../../lib/audit-query'
import { useGetMeQuery, useGetMembersQuery } from '../../store/api'
import AuditLogTab from './AuditLogTab'
import ConnectionLogTab from './ConnectionLogTab'
import FileLogTab from './FileLogTab'

export default function AuditPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canRead = perms.has('audit.read')
  const canReadDevices = perms.has('device.read')

  const scopeRef = useRef(id)
  const orgChanged = scopeRef.current !== id
  const filters = parseAuditFilters(searchParams)
  const effective: AuditFilters = orgChanged ? { ...DEFAULT_AUDIT_FILTERS } : filters

  const [refreshNonce, setRefreshNonce] = useState(0)
  const rangeKey = `${id}|${effective.range}|${refreshNonce}`
  const now = useMemo(() => new Date(), [rangeKey])

  const { currentData: members } = useGetMembersQuery(id, {
    skip: !id || !canRead || effective.tab !== 'audit',
  })

  useLayoutEffect(() => {
    if (scopeRef.current === id) return
    scopeRef.current = id
  }, [id])

  useEffect(() => {
    if (orgChanged && searchParams.toString()) {
      setSearchParams(new URLSearchParams(), { replace: true })
    }
  }, [orgChanged, searchParams, setSearchParams])

  function change(patch: Partial<AuditFilters>) {
    const touchesFilters = Object.keys(patch).some((key) => key !== 'page')
    setSearchParams(
      toAuditSearchParams({
        ...effective,
        ...patch,
        page: patch.page ?? (touchesFilters ? 1 : effective.page),
      }),
      { replace: true },
    )
  }

  function refresh() {
    setRefreshNonce((nonce) => nonce + 1)
  }

  function resetFilters() {
    if (effective.tab === 'audit') {
      change({ action: '', actorUserId: null, targetType: '', targetId: '', page: 1 })
    } else {
      change({ rustdeskId: '', page: 1 })
    }
  }

  if (!Number.isSafeInteger(id) || id <= 0) {
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
        title="没有审计权限"
        description="无法确认当前组织与权限，请重新登录或联系管理员。"
      />
    )
  }

  if (!canRead) {
    return (
      <StateBlock
        code="403"
        title="没有审计读取权限"
        description="当前角色没有 audit.read；请联系管理员调整角色。"
      />
    )
  }

  const tab: AuditTab = effective.tab
  const tabProps = {
    orgId: id,
    filters: effective,
    now,
    refreshSignal: refreshNonce,
    onChangePage: (page: number) => change({ page }),
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">审计与日志</h1>
          <div className="page-sub">请求审计 / 连接日志 / 文件日志；可见范围由角色审计范围决定</div>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="日志类型">
        {AUDIT_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`audit-tab-${value}`}
            aria-controls={tab === value ? 'audit-tabpanel' : undefined}
            aria-selected={tab === value}
            className={`tab ${tab === value ? 'on' : ''}`}
            onClick={() => change({ tab: value, page: 1 })}
          >
            {auditTabLabel(value)}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="时间范围" style={{ margin: 0 }}>
          {AUDIT_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip-btn ${effective.range === value ? 'on' : ''}`}
              aria-pressed={effective.range === value}
              onClick={() => change({ range: value })}
            >
              {auditRangeLabel(value)}
            </button>
          ))}
        </div>

        {tab === 'audit' ? (
          <>
            <div className="input" style={{ width: 220 }}>
              <input
                aria-label="动作"
                maxLength={128}
                placeholder="动作（精确匹配）"
                value={effective.action}
                onChange={(event) => change({ action: event.target.value })}
              />
            </div>
            <select
              className="select-native"
              aria-label="操作人"
              value={effective.actorUserId === null ? '' : String(effective.actorUserId)}
              onChange={(event) =>
                change({
                  actorUserId: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            >
              <option value="">全部操作人</option>
              <option value="0">系统（自动）</option>
              {(members ?? []).map((member) => (
                <option key={member.user_id} value={String(member.user_id)}>
                  {member.email}
                  {member.disabled ? '（停用）' : ''}
                </option>
              ))}
              {effective.actorUserId !== null &&
              effective.actorUserId !== 0 &&
              !(members ?? []).some((member) => member.user_id === effective.actorUserId) ? (
                <option value={String(effective.actorUserId)}>
                  用户 #{effective.actorUserId}（不在成员列表）
                </option>
              ) : null}
            </select>
            <div className="input" style={{ width: 170 }}>
              <input
                aria-label="目标类型"
                maxLength={64}
                placeholder="目标类型（精确）"
                value={effective.targetType}
                onChange={(event) => change({ targetType: event.target.value })}
              />
            </div>
            <div className="input" style={{ width: 170 }}>
              <input
                aria-label="目标 ID"
                maxLength={64}
                placeholder="目标 ID（精确）"
                value={effective.targetId}
                onChange={(event) => change({ targetId: event.target.value })}
              />
            </div>
          </>
        ) : (
          <div className="input" style={{ width: 220 }}>
            <input
              aria-label="RustDesk ID"
              maxLength={64}
              placeholder="RustDesk ID（精确）"
              value={effective.rustdeskId}
              onChange={(event) => change({ rustdeskId: event.target.value })}
            />
          </div>
        )}

        <div className="spacer" />
        <button className="btn borderless sm" type="button" onClick={resetFilters}>
          重置筛选
        </button>
        <button className="btn outline sm" type="button" onClick={refresh}>
          刷新
        </button>
      </div>

      <div role="tabpanel" id="audit-tabpanel" aria-labelledby={`audit-tab-${tab}`}>
        {tab === 'audit' ? (
          <AuditLogTab key={`${id}-audit`} {...tabProps} />
        ) : tab === 'connections' ? (
          <ConnectionLogTab
            key={`${id}-connections`}
            {...tabProps}
            canReadDevices={canReadDevices}
          />
        ) : (
          <FileLogTab key={`${id}-files`} {...tabProps} canReadDevices={canReadDevices} />
        )}
      </div>

      <p className="help" style={{ marginTop: 12 }}>
        动作、目标与 RustDesk ID 为精确匹配。审计可见范围由角色决定（全局，或仅本人及本人设备）；
        查看列表不产生审计记录。
      </p>
    </section>
  )
}
