import { Banner, Empty } from '@douyinfe/semi-ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AuditLog } from '../../lib/api'
import {
  auditActorLabel,
  auditListError,
  auditTargetLabel,
  toAuditRequestQuery,
  type AuditFilters,
} from '../../lib/audit-query'
import { formatTime } from '../../lib/format'
import { totalPages } from '../../lib/paging'
import { useGetAuditLogPageQuery, useGetMembersQuery } from '../../store/api'
import { AuditLogSheet } from './AuditSheets'

export interface AuditTabProps {
  orgId: number
  filters: AuditFilters
  now: Date
  refreshSignal: number
  onChangePage: (page: number) => void
}

export default function AuditLogTab({
  orgId,
  filters,
  now,
  refreshSignal,
  onChangePage,
}: AuditTabProps) {
  const queryString = useMemo(() => toAuditRequestQuery(filters, now).toString(), [filters, now])
  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAuditLogPageQuery({ orgId, queryString }, { skip: !orgId })
  const { currentData: members } = useGetMembersQuery(orgId, { skip: !orgId })

  const emails = useMemo(() => {
    const map = new Map<number, string>()
    for (const member of members ?? []) map.set(member.user_id, member.email)
    return map
  }, [members])

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const pages = totalPages(total, data?.page_size ?? 50)
  const loadingCurrent = isLoading || (isFetching && data === undefined)

  useEffect(() => {
    if (data && filters.page > pages) onChangePage(pages)
  }, [data, filters.page, pages, onChangePage])

  // `all` has no bounds, so the query string never changes: an explicit refresh
  // must call refetch instead of relying on a new argument.
  const lastSignal = useRef(refreshSignal)
  useEffect(() => {
    if (lastSignal.current === refreshSignal) return
    lastSignal.current = refreshSignal
    if (filters.range === 'all') void refetch()
  }, [refreshSignal, filters.range, refetch])

  const [selected, setSelected] = useState<AuditLog | null>(null)

  useEffect(() => {
    if (!selected || !data) return
    if (!data.items.some((row) => row.id === selected.id)) setSelected(null)
  }, [data, selected])

  return (
    <>
      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载审计记录失败：${auditListError(error)}${
              data ? '（显示上次结果）' : ''
            }`}
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

      {error && !data ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载审计记录…
              </div>
            ) : rows.length === 0 ? (
              <Empty
                title="没有符合条件的审计记录"
                description="调整动作、操作人、目标或时间范围后再试"
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>时间</th>
                    <th style={{ width: 70 }}>序号</th>
                    <th style={{ width: 180 }}>操作人</th>
                    <th>动作</th>
                    <th style={{ width: 180 }}>目标</th>
                    <th style={{ width: 80 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{formatTime(row.created_at)}</td>
                      <td className="mono">{row.seq}</td>
                      <td className="cell-wrap">{auditActorLabel(row.actor_user_id, emails)}</td>
                      <td className="mono cell-wrap">{row.action}</td>
                      <td className="cell-wrap">
                        {auditTargetLabel(row.target_type, row.target_id)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn borderless sm"
                          type="button"
                          onClick={() => setSelected(row)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {total > 0 ? (
              <div className="pager" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <span className="total">
                  共 {total} 条 · 第 {filters.page} / {pages} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={filters.page <= 1}
                  aria-label="上一页"
                  onClick={() => onChangePage(filters.page - 1)}
                >
                  ‹
                </button>
                <span className="pg on" aria-current="page">
                  {filters.page}
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={filters.page >= pages}
                  aria-label="下一页"
                  onClick={() => onChangePage(filters.page + 1)}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {selected ? (
        <AuditLogSheet
          key={`${orgId}-${selected.id}`}
          row={selected}
          actorLabel={auditActorLabel(selected.actor_user_id, emails)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  )
}
