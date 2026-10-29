import { Banner, Empty } from '@douyinfe/semi-ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { FileLog } from '../../lib/api'
import { auditListError, fileDirectionLabel, toAuditRequestQuery } from '../../lib/audit-query'
import { formatTime } from '../../lib/format'
import { totalPages } from '../../lib/paging'
import { useGetDevicesQuery, useGetFileLogPageQuery } from '../../store/api'
import type { AuditTabProps } from './AuditLogTab'
import { FileLogSheet } from './AuditSheets'

export default function FileLogTab({
  orgId,
  filters,
  now,
  refreshSignal,
  onChangePage,
  canReadDevices,
}: AuditTabProps & { canReadDevices: boolean }) {
  const queryString = useMemo(() => toAuditRequestQuery(filters, now).toString(), [filters, now])
  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetFileLogPageQuery({ orgId, queryString }, { skip: !orgId })
  const { currentData: devicesPage } = useGetDevicesQuery(orgId, {
    skip: !orgId || !canReadDevices,
  })

  const devices = useMemo(() => {
    const map = new Map<number, string>()
    for (const device of devicesPage?.items ?? []) map.set(device.id, device.name)
    return map
  }, [devicesPage])

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const pages = totalPages(total, data?.page_size ?? 50)
  const loadingCurrent = isLoading || (isFetching && data === undefined)

  useEffect(() => {
    if (data && filters.page > pages) onChangePage(pages)
  }, [data, filters.page, pages, onChangePage])

  const lastSignal = useRef(refreshSignal)
  useEffect(() => {
    if (lastSignal.current === refreshSignal) return
    lastSignal.current = refreshSignal
    if (filters.range === 'all') void refetch()
  }, [refreshSignal, filters.range, refetch])

  const [selected, setSelected] = useState<FileLog | null>(null)

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
            description={`加载文件日志失败：${auditListError(error)}${
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
                正在加载文件日志…
              </div>
            ) : rows.length === 0 ? (
              <Empty
                title="没有符合条件的文件日志"
                description="调整 RustDesk ID 或时间范围后再试"
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>时间</th>
                    <th style={{ width: 80 }}>方向</th>
                    <th style={{ width: 130 }}>RustDesk ID</th>
                    <th>设备</th>
                    <th style={{ width: 130 }}>peer</th>
                    <th>路径</th>
                    <th style={{ width: 90 }}>文件数</th>
                    <th style={{ width: 120 }}>IP</th>
                    <th style={{ width: 80 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{formatTime(row.created_at)}</td>
                      <td>{fileDirectionLabel(row.direction)}</td>
                      <td className="mono">{row.rustdesk_id}</td>
                      <td className="cell-wrap">
                        {devices.get(row.device_id) ?? `设备 #${row.device_id}`}
                      </td>
                      <td className="mono">{row.peer_id || '—'}</td>
                      <td className="mono cell-wrap">{row.path || '—'}</td>
                      <td className="mono">{row.file_count ?? '—'}</td>
                      <td className="mono">{row.ip || '—'}</td>
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
        <FileLogSheet
          key={`${orgId}-${selected.id}`}
          row={selected}
          deviceName={devices.get(selected.device_id)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  )
}
