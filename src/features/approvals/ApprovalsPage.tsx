import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import type { Approval, ApprovalDecision } from '../../lib/api'
import {
  APPROVAL_PAGE_SIZE,
  approvalActionLabels,
  approvalKindLabel,
  approvalStatusLabel,
  approvalWriteError,
  formatRemaining,
  isActionable,
  parseApprovalFilters,
  toApprovalRequestQuery,
  toApprovalSearchParams,
  type ApprovalFilters,
} from '../../lib/approval-query'
import { formatTime } from '../../lib/format'
import { totalPages } from '../../lib/paging'
import {
  useGetApprovalPageQuery,
  useGetDevicesQuery,
  useGetMeQuery,
  useGetMembersQuery,
} from '../../store/api'
import ApprovalSheet from './ApprovalSheet'
import DecisionDialog from './DecisionDialog'

const STATUS_TABS: { status: ApprovalFilters['status']; label: string }[] = [
  { status: 'pending', label: '待处理' },
  { status: 'approved', label: '已批准' },
  { status: 'denied', label: '已驳回' },
  { status: 'expired', label: '已过期' },
]

function statusColor(status: Approval['status']): string {
  if (status === 'approved') return 'green'
  if (status === 'denied') return 'red'
  if (status === 'expired') return 'grey'
  return 'orange'
}

/** Seconds clock for the deadline hints; paused while the tab is hidden. */
function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: number | undefined
    const tick = () => setNow(new Date())
    const start = () => {
      if (timer === undefined) timer = window.setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        tick()
        start()
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
  return now
}

interface DecisionTarget {
  approvalId: number
  intent: ApprovalDecision
  token: number
  generation: number
}

export default function ApprovalsPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useNow()

  const scopeRef = useRef(id)
  const orgChanged = scopeRef.current !== id
  const generationRef = useRef(0)
  const seqRef = useRef(0)
  const decisionTokenRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    // StrictMode mounts, cleans up and mounts again; setting this only in the
    // cleanup would leave it false for the rest of the session.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const filters = parseApprovalFilters(searchParams)
  const effective: ApprovalFilters = orgChanged
    ? { status: 'pending', deviceId: '', page: 1, approvalId: null }
    : filters
  const { status, deviceId, page, approvalId } = effective

  const [deviceInput, setDeviceInput] = useState(filters.deviceId)
  useEffect(() => {
    setDeviceInput(filters.deviceId)
  }, [filters.deviceId])

  const [decision, setDecision] = useState<DecisionTarget | null>(null)
  const overlayOpen = decision !== null || approvalId !== null

  const queryString = useMemo(
    () => toApprovalRequestQuery({ status, deviceId, page, approvalId: null }).toString(),
    [status, deviceId, page],
  )
  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetApprovalPageQuery(
    { orgId: id, queryString },
    { skip: !id, pollingInterval: overlayOpen ? 0 : 30_000, skipPollingIfUnfocused: true },
  )
  const loadingCurrent = isLoading || (isFetching && data === undefined)
  const approvals = data?.items ?? []
  const total = data?.total ?? 0
  const pages = totalPages(total, data?.page_size ?? APPROVAL_PAGE_SIZE)

  const { data: me } = useGetMeQuery()
  const perms = useMemo(() => {
    const current = me?.orgs.find((org) => org.id === id)
    return new Set(current?.permissions ?? [])
  }, [me, id])
  const canDecide = perms.has('approval.decide')
  const canReadDevices = perms.has('device.read')

  const { currentData: members } = useGetMembersQuery(id, { skip: !id })
  const { currentData: devicesPage } = useGetDevicesQuery(id, { skip: !id || !canReadDevices })

  const emails = useMemo(() => {
    const map = new Map<number, string>()
    for (const member of members ?? []) map.set(member.user_id, member.email)
    return map
  }, [members])
  const devices = useMemo(() => {
    const map = new Map<number, { name: string; rustdeskId: string }>()
    for (const device of devicesPage?.items ?? []) {
      map.set(device.id, { name: device.name, rustdeskId: device.rustdesk_id })
    }
    return map
  }, [devicesPage])

  useLayoutEffect(() => {
    if (scopeRef.current === id) return
    scopeRef.current = id
    generationRef.current += 1
  }, [id])

  // Only an organization change invalidates an open decision: the URL effect
  // below also fires when the sheet is closed to open the dialog, and clearing
  // the decision there would shut the dialog the same tick it opened.
  useEffect(() => {
    decisionTokenRef.current = 0
    setDecision(null)
  }, [id])

  useEffect(() => {
    // The URL still describes the previous organization on the switching
    // render; clear it so the next pass cannot reopen its detail or filters.
    if (orgChanged && searchParams.toString()) {
      setSearchParams(new URLSearchParams(), { replace: true })
    }
  }, [orgChanged, searchParams, setSearchParams])

  function change(patch: Partial<ApprovalFilters>) {
    // Keep the current page unless the caller resets it (filters and tabs do);
    // opening or closing the detail must not jump back to page 1.
    setSearchParams(
      toApprovalSearchParams({ ...filters, ...patch, page: patch.page ?? filters.page }),
      { replace: true },
    )
  }

  function openDecision(target: number, intent: ApprovalDecision) {
    // The sheet would otherwise stay mounted under the modal (two focus traps).
    if (approvalId !== null) change({ approvalId: null })
    seqRef.current += 1
    decisionTokenRef.current = seqRef.current
    setDecision({
      approvalId: target,
      intent,
      token: seqRef.current,
      generation: generationRef.current,
    })
  }

  function finishDecision(token: number, generation: number): boolean {
    if (!mountedRef.current) return false
    if (decisionTokenRef.current !== token) return false
    if (generation !== generationRef.current || scopeRef.current !== id) return false
    decisionTokenRef.current = 0
    setDecision(null)
    change({ approvalId: null })
    return true
  }

  useEffect(() => {
    if (orgChanged) return
    if (data && page > pages) change({ page: pages, approvalId: null })
  }, [orgChanged, data, page, pages])

  const shownSheet = orgChanged ? null : approvalId
  const shownDecision = orgChanged ? null : decision

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">审批中心</h1>
          <div className="page-sub">事前审批批准后放行一次签发；追认仅记录，不产生票据</div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <span className="help">
            {overlayOpen ? '浮层打开时暂停自动刷新' : '每 30 秒自动刷新'}
          </span>
        </div>
      </div>

      {!canDecide ? (
        <div className="banner info mb-14">
          <div>
            <b>当前为只读视图。</b>有效组织成员可以查看审批；批准、追认与驳回需要{' '}
            <code>approval.decide</code> 权限。
          </div>
        </div>
      ) : null}

      <div className="toolbar">
        <div className="tabs" style={{ margin: 0, flex: 1 }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.status}
              type="button"
              className={`tab ${status === tab.status ? 'on' : ''}`}
              aria-pressed={status === tab.status}
              onClick={() => change({ status: tab.status, page: 1, approvalId: null })}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="input" style={{ width: 180 }}>
          <input
            value={deviceInput}
            inputMode="numeric"
            placeholder="设备 id"
            aria-label="按设备 id 筛选"
            onChange={(event) => setDeviceInput(event.target.value.replace(/[^\d]/g, ''))}
          />
        </div>
        <button
          className="btn outline sm"
          type="button"
          onClick={() => change({ deviceId: deviceInput, page: 1, approvalId: null })}
        >
          筛选
        </button>
        {deviceId ? (
          <button
            className="btn borderless sm"
            type="button"
            onClick={() => {
              setDeviceInput('')
              change({ deviceId: '', page: 1, approvalId: null })
            }}
          >
            清除设备
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载审批失败：${approvalWriteError(error)}${
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
                正在加载审批…
              </div>
            ) : approvals.length === 0 ? (
              <Empty
                title="当前状态下没有审批"
                description={
                  status === 'pending'
                    ? '有新的审批请求时会出现在这里，页面每 30 秒刷新'
                    : '切换页签查看其他状态'
                }
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>类型</th>
                    <th style={{ width: 190 }}>申请人</th>
                    <th>目标设备</th>
                    <th>当前事由</th>
                    <th style={{ width: 150 }}>提交时间</th>
                    <th style={{ width: 190 }}>截止</th>
                    <th style={{ width: 90 }}>状态</th>
                    <th style={{ width: 190 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((approval) => {
                    const actionable = isActionable(approval, now)
                    const labels = approvalActionLabels(approval.kind)
                    const device = devices.get(approval.device_id)
                    return (
                      <tr key={approval.id}>
                        <td>
                          <span
                            className={`tag ${approval.kind === 'pre_approval' ? 'primary' : 'blue'}`}
                          >
                            {approvalKindLabel(approval.kind)}
                          </span>
                        </td>
                        <td className="cell-wrap">
                          {approval.actor_user_id != null
                            ? (emails.get(approval.actor_user_id) ??
                              `用户 #${approval.actor_user_id}`)
                            : '—'}
                        </td>
                        <td>
                          <div style={{ fontSize: 13 }}>
                            {device?.name ?? `设备 #${approval.device_id}`}
                          </div>
                          <div className="mono help">
                            {device?.rustdeskId ?? `#${approval.device_id}`}
                          </div>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div className="cell-wrap help" style={{ color: 'var(--text-1)' }}>
                            {approval.reason || '—'}
                          </div>
                        </td>
                        <td className="mono">{formatTime(approval.requested_at)}</td>
                        <td className="mono">
                          {formatTime(approval.expires_at)}
                          <div className="help">
                            {approval.status === 'pending'
                              ? formatRemaining(approval.expires_at, now)
                              : '—'}
                          </div>
                        </td>
                        <td>
                          <span className={`tag ${statusColor(approval.status)}`}>
                            {approvalStatusLabel(approval.kind, approval.status)}
                          </span>
                        </td>
                        <td>
                          <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn borderless sm"
                              type="button"
                              onClick={() => change({ approvalId: approval.id })}
                            >
                              详情
                            </button>
                            {actionable && canDecide ? (
                              <>
                                <button
                                  className="btn borderless sm"
                                  type="button"
                                  onClick={() => openDecision(approval.id, 'approve')}
                                >
                                  {labels.approve}
                                </button>
                                <button
                                  className="btn borderless sm"
                                  type="button"
                                  style={{ color: 'var(--danger)' }}
                                  onClick={() => openDecision(approval.id, 'deny')}
                                >
                                  {labels.deny}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {total > 0 ? (
              <div className="pager" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <span className="total">
                  共 {total} 条 · 第 {page} / {pages} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page <= 1}
                  aria-label="上一页"
                  onClick={() => change({ page: page - 1, approvalId: null })}
                >
                  ‹
                </button>
                <span className="pg on" aria-current="page">
                  {page}
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page >= pages}
                  aria-label="下一页"
                  onClick={() => change({ page: page + 1, approvalId: null })}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        每 30
        秒刷新列表；详情读取会写审计，因此不自动轮询。超期未处理的请求由后台任务每分钟标记为已过期。
        审批不签发任何东西：事前批准只是允许申请人重试一次签发，追认只确认已发生的原生会话。
      </p>

      {shownSheet !== null ? (
        <ApprovalSheet
          key={`${id}-${shownSheet}`}
          orgId={id}
          approvalId={shownSheet}
          canDecide={canDecide}
          emails={emails}
          devices={devices}
          onClose={() => change({ approvalId: null })}
          onDecide={(target, intent) => openDecision(target, intent)}
        />
      ) : null}

      {shownDecision ? (
        <DecisionDialog
          key={`${id}-${shownDecision.approvalId}-${shownDecision.token}`}
          orgId={id}
          approvalId={shownDecision.approvalId}
          canDecide={canDecide}
          intent={shownDecision.intent}
          onClose={() => {
            decisionTokenRef.current = 0
            setDecision(null)
          }}
          onDone={() => {
            if (finishDecision(shownDecision.token, shownDecision.generation)) {
              Toast.success('决策已记录')
            }
          }}
        />
      ) : null}
    </section>
  )
}
