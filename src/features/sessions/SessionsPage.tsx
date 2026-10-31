import { Banner, Empty } from '@douyinfe/semi-ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import SideSheet from '../../components/SideSheet'
import { formatDuration, formatTime } from '../../lib/format'
import type { Alert, Device, Session, SessionDetail, SessionEvent } from '../../lib/api'
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  parseFilters,
  toRequestQuery,
  toSearchParams,
  totalPages,
  type SessionFilters,
  type SessionRange,
} from '../../lib/session-query'
import {
  TICKET_STATUS_LABELS,
  ticketDetailError,
  ticketStatus,
  type TicketState,
} from '../../lib/ticket'
import {
  useGetDevicesQuery,
  useGetMembersQuery,
  useGetSessionAlertsQuery,
  useGetSessionQuery,
  useGetSessionsQuery,
  useGetTicketQuery,
} from '../../store/api'
import RequestApprovalDialog from '../approvals/RequestApprovalDialog'

const ORIGINS: { value: SessionFilters['origin']; label: string }[] = [
  { value: '', label: '全部来源' },
  { value: 'panel', label: 'panel' },
  { value: 'native', label: 'native' },
]

const RANGES: { value: SessionRange; label: string }[] = [
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: 'all', label: '全部时间' },
]

const STATUS_LABELS: Record<string, string> = {
  open: '进行中',
  closed: '已结束',
  denied: '已拒绝',
}

function statusColor(status: string): string {
  if (status === 'open') return 'green'
  if (status === 'denied') return 'red'
  return 'grey'
}

function originColor(origin: string): string {
  return origin === 'panel' ? 'primary' : 'blue'
}

const EVENT_LABELS: Record<string, string> = {
  started: '会话开始',
  ticket_issued: '票据签发',
  approved: '审批通过',
  denied: '签发被拒绝',
  connected: '连接建立',
  disconnected: '连接断开',
  closed: '会话结束',
}

function eventLabel(kind: string): string {
  return EVENT_LABELS[kind] ?? kind
}

function eventClass(kind: string): string {
  if (kind === 'denied') return 'bad'
  if (kind === 'approved' || kind === 'closed') return 'ok'
  return ''
}

const ALERT_LABELS: Record<string, string> = {
  duration_exceeded: '会话时长超限',
  concurrency_exceeded: '并发会话超限',
  outside_window: '时段外发起',
}

function alertLabel(kind: string): string {
  return ALERT_LABELS[kind] ?? kind
}

function severityColor(severity: string): string {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'orange'
  return 'grey'
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  warning: '警告',
  info: '提示',
}

const END_REASON_LABELS: Record<string, string> = {
  disconnected: '连接断开',
  idle_timeout: '空闲超时',
  policy_denied: '签发阶段被策略拒绝',
  policy_exceeded: '超过时长上限',
}

function endReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—'
  return END_REASON_LABELS[reason] ?? reason
}

export default function SessionsPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const [searchParams, setSearchParams] = useSearchParams()
  // Decided during render, before any effect runs: the render that changes
  // organization still carries the previous organization's filters in the URL.
  const previousOrg = useRef(id)
  const orgChanged = previousOrg.current !== id
  const filters = parseFilters(searchParams)
  // The switching render still carries the previous organization's filters in
  // the URL. Both the cutoff and the request use the defaults there, so the
  // cleared URL lands on the same query key instead of fetching twice.
  const effectiveFilters = orgChanged ? DEFAULT_FILTERS : filters
  const { origin, status, deviceId, range, page } = effectiveFilters

  // `since` is cut once per filter set: recomputing "now" on a page change
  // would slide the window and make rows at the cutoff appear twice or vanish.
  // Changing a filter, the organization or an explicit retry does move it.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const cutoffKey = `${id}|${origin}|${status}|${deviceId}|${range}|${refreshNonce}`
  const rangeNow = useMemo(() => new Date(), [cutoffKey])
  const queryString = useMemo(
    () =>
      toRequestQuery(
        { origin, status, deviceId, range, page, sessionId: filters.sessionId },
        rangeNow,
      ).toString(),
    [origin, status, deviceId, range, page, rangeNow],
  )

  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetSessionsQuery({ orgId: id, queryString }, { skip: !id })
  const loadingCurrent = isLoading || (isFetching && data === undefined)
  // currentData: a dictionary from the previous organization must never label
  // the current one's rows while its own query is still in flight.
  const { currentData: devicesPage } = useGetDevicesQuery(id, { skip: !id })
  const { currentData: members } = useGetMembersQuery(id, { skip: !id })

  // The open session lives in the URL (`?sessionId=`), so alerts can deep-link
  // into a session and one source of truth drives the sheet.
  const selected = orgChanged ? null : filters.sessionId
  // The ratification dialog replaces the sheet rather than stacking a Modal on
  // top of it; the target row is captured before the URL is cleared.
  const [ratifyTarget, setRatifyTarget] = useState<{
    id: number
    deviceName: string
    startedAt: string
  } | null>(null)
  // The switching render still holds the previous organization's target; the
  // effect below clears it, but that render must not paint the dialog under the
  // new orgId either.
  const activeRatifyTarget = orgChanged ? null : ratifyTarget
  // The page instance survives an in-place organization change (a hand-edited
  // URL, or a future in-page switcher): drop the filters, which describe the
  // previous organization. The page correction below must not write the
  // previous organization's filters back in the same commit that clears them.
  useEffect(() => {
    if (!orgChanged) return
    previousOrg.current = id
    setRatifyTarget(null)
    if (searchParams.toString()) setSearchParams(new URLSearchParams(), { replace: true })
  }, [id, orgChanged, searchParams, setSearchParams])

  // An unparsable deep link is removed instead of staying in a copyable URL.
  useEffect(() => {
    if (!searchParams.has('sessionId') || filters.sessionId !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('sessionId')
    setSearchParams(next, { replace: true })
  }, [searchParams, filters.sessionId, setSearchParams])

  const devices = useMemo(() => {
    const map = new Map<number, Device>()
    for (const device of devicesPage?.items ?? []) map.set(device.id, device)
    return map
  }, [devicesPage])

  const emails = useMemo(() => {
    const map = new Map<number, string>()
    for (const member of members ?? []) map.set(member.user_id, member.email)
    return map
  }, [members])

  const sessions = data?.items ?? []
  const total = data?.total ?? 0
  const pages = totalPages(total, data?.page_size ?? PAGE_SIZE)

  const change = useCallback(
    (patch: Partial<SessionFilters>) => {
      // Filter changes start at page 1 and close the sheet; page changes keep
      // both unless the caller closes the sheet explicitly (pagination does).
      const touchesFilters = ['origin', 'status', 'deviceId', 'range'].some((key) => key in patch)
      setSearchParams(
        toSearchParams({
          ...filters,
          ...patch,
          page: patch.page ?? (touchesFilters ? 1 : filters.page),
          sessionId:
            patch.sessionId !== undefined
              ? patch.sessionId
              : touchesFilters
                ? null
                : filters.sessionId,
        }),
        { replace: true },
      )
    },
    [filters, setSearchParams],
  )

  function openRatify(session: Session) {
    setRatifyTarget({
      id: session.id,
      deviceName: deviceName(devices, session),
      startedAt: session.started_at,
    })
    change({ sessionId: null })
  }

  // A stale URL (page past the last one) is corrected once the server answers,
  // instead of showing an empty page under a valid pager.
  useEffect(() => {
    if (orgChanged) return
    if (data && page > pages) change({ page: pages })
  }, [orgChanged, data, page, pages, change])

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">会话记录</h1>
          <div className="page-sub">
            共 {total} 条 · panel 由面板签发并受策略约束，native 由日志推断、只记录不阻断
          </div>
        </div>
        <div className="spacer" />
      </div>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="来源" style={{ margin: 0 }}>
          {ORIGINS.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              className={`chip-btn ${origin === option.value ? 'on' : ''}`}
              aria-pressed={origin === option.value}
              onClick={() => change({ origin: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          className="select-native"
          aria-label="会话状态"
          value={status}
          onChange={(event) => change({ status: event.target.value as SessionFilters['status'] })}
        >
          <option value="">全部状态</option>
          <option value="open">进行中</option>
          <option value="closed">已结束</option>
          <option value="denied">已拒绝</option>
        </select>

        <select
          className="select-native"
          aria-label="设备"
          value={deviceId}
          onChange={(event) => change({ deviceId: event.target.value })}
        >
          <option value="">全部设备</option>
          {deviceId && !devices.has(Number(deviceId)) ? (
            <option value={deviceId}>{`设备 #${deviceId}`}</option>
          ) : null}
          {[...devices.values()]
            .sort((a, b) => (a.name || a.rustdesk_id).localeCompare(b.name || b.rustdesk_id))
            .map((device) => (
              <option key={device.id} value={String(device.id)}>
                {device.name || device.rustdesk_id}
              </option>
            ))}
        </select>

        <div className="spacer" />

        <div className="chips" role="group" aria-label="时间范围" style={{ margin: 0 }}>
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip-btn ${range === option.value ? 'on' : ''}`}
              aria-pressed={range === option.value}
              onClick={() => change({ range: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载会话失败：${(error as { message?: string }).message ?? '未知错误'}${
              data ? '（显示上次结果）' : ''
            }`}
          />
          <button
            className="btn outline sm"
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => {
              setRefreshNonce((nonce) => nonce + 1)
              // `all` sends no since, so the query string is unchanged and the
              // new cutoff alone would not trigger a request.
              if (range === 'all') void refetch()
            }}
          >
            重试
          </button>
        </div>
      ) : null}

      {error && !data ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="card-title">
              会话<span className="hint">按开始时间倒序，同一秒按 id 倒序</span>
            </div>
          </div>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" style={{ padding: '14px 0' }}>
                正在加载会话…
              </div>
            ) : sessions.length === 0 ? (
              <Empty
                title="没有符合条件的会话"
                description="调整来源、状态、设备或时间范围后再试"
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>开始时间</th>
                    <th>设备</th>
                    <th style={{ width: 200 }}>发起人</th>
                    <th style={{ width: 90 }}>来源</th>
                    <th style={{ width: 100 }}>状态</th>
                    <th style={{ width: 150 }}>时长</th>
                    <th style={{ width: 90 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="mono">{formatTime(session.started_at)}</td>
                      <td>
                        <div style={{ fontSize: 13 }}>
                          {deviceName(devices, session)}
                          {session.status === 'denied' ? (
                            <span className="tag grey" style={{ marginLeft: 6 }}>
                              未建立
                            </span>
                          ) : null}
                        </div>
                        <div className="mono help">{session.rustdesk_id ?? '—'}</div>
                      </td>
                      <td className="cell-wrap">{actorLabel(emails, session)}</td>
                      <td>
                        <span className={`tag ${originColor(session.origin)}`}>
                          {session.origin}
                        </span>
                      </td>
                      <td>
                        <span className={`tag ${statusColor(session.status)}`}>
                          {STATUS_LABELS[session.status] ?? session.status}
                        </span>
                      </td>
                      <td className="mono">
                        {session.status === 'open'
                          ? `进行中 · ${formatDuration(session.started_at, null)}`
                          : session.status === 'denied'
                            ? '—'
                            : formatDuration(session.started_at, session.ended_at)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn borderless sm"
                          type="button"
                          onClick={() => change({ sessionId: session.id })}
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
                  共 {total} 条 · 第 {page} / {pages} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page <= 1}
                  aria-label="上一页"
                  onClick={() => change({ page: page - 1, sessionId: null })}
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
                  onClick={() => change({ page: page + 1, sessionId: null })}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        面板不在 RustDesk 信令链路上：panel 会话的策略在签发/兑换阶段强制，native
        会话只做记录与告警，不会主动断连。
      </p>

      {selected !== null ? (
        <SessionDetailSheet
          key={`${id}-${selected}`}
          orgId={id}
          sessionId={selected}
          devices={devices}
          emails={emails}
          onClose={() => change({ sessionId: null })}
          onRatify={openRatify}
        />
      ) : null}

      {activeRatifyTarget ? (
        <RequestApprovalDialog
          orgId={id}
          kind="ratification"
          session={activeRatifyTarget}
          onClose={() => setRatifyTarget(null)}
        />
      ) : null}
    </section>
  )
}

function deviceName(devices: Map<number, Device>, session: Session): string {
  const device = devices.get(session.device_id)
  return device?.name || `设备 #${session.device_id}`
}

function actorLabel(emails: Map<number, string>, session: Session): string {
  // The API omits optional fields instead of sending null, so a native session
  // arrives without actor_user_id at all.
  if (session.actor_user_id === null || session.actor_user_id === undefined) return '原生直连'
  return emails.get(session.actor_user_id) ?? `用户 #${session.actor_user_id}`
}

function SessionDetailSheet({
  orgId,
  sessionId,
  devices,
  emails,
  onClose,
  onRatify,
}: {
  orgId: number
  sessionId: number
  devices: Map<number, Device>
  emails: Map<number, string>
  onClose: () => void
  onRatify: (session: Session) => void
}) {
  const { data, isLoading, error } = useGetSessionQuery({ orgId, sessionId })
  const alerts = useGetSessionAlertsQuery({ orgId, sessionId })
  // A panel older than contract 0.12.1 ignores `sessionId` and returns the
  // organization's inbox; filtering here keeps the sheet from mislabelling
  // those rows. The server filter is still what makes the page complete.
  const relatedAlerts = useMemo(
    () => (alerts.data?.items ?? []).filter((alert) => alert.session_id === sessionId),
    [alerts.data, sessionId],
  )

  return (
    <SideSheet title={`会话 #${sessionId}`} onClose={onClose}>
      {isLoading ? (
        <div className="help" role="status">
          正在加载会话详情…
        </div>
      ) : null}
      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`加载会话失败：${(error as { message?: string }).message ?? '未知错误'}`}
        />
      ) : null}
      {data ? (
        <>
          <SessionFacts detail={data} devices={devices} emails={emails} />
          {data.session.origin === 'native' ? (
            <div className="row-end" style={{ marginTop: 12 }}>
              <button
                className="btn outline sm"
                type="button"
                onClick={() => onRatify(data.session)}
              >
                申请追认
              </button>
            </div>
          ) : null}
          {data.session.ticket_id != null ? (
            <>
              <div className="card-title" style={{ margin: '18px 0 10px' }}>
                票据
                <span className="hint">记账信息；读取一次票据详情会记入请求审计</span>
              </div>
              <TicketFacts orgId={orgId} ticketId={data.session.ticket_id} emails={emails} />
            </>
          ) : null}
          <div className="card-title" style={{ margin: '18px 0 10px' }}>
            事件时间线
          </div>
          {data.truncated ? (
            <div className="help" style={{ marginBottom: 8 }}>
              事件超过 200 条，仅显示最早的 200 条（开始的审计记录不会被截掉）
            </div>
          ) : null}
          {data.events.length === 0 ? (
            <div className="help">没有事件</div>
          ) : (
            <ul className="timeline">
              {data.events.map((event: SessionEvent) => (
                <li key={event.id} className={eventClass(event.kind)}>
                  <b>{eventLabel(event.kind)}</b>
                  <span className="time">{formatTime(event.at)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="card-title" style={{ margin: '18px 0 10px' }}>
            关联告警
          </div>
          {alerts.isLoading ? (
            <div className="help" role="status">
              正在加载告警…
            </div>
          ) : null}
          {alerts.error ? (
            <div className="help" style={{ color: 'var(--danger)' }}>
              关联告警加载失败
            </div>
          ) : null}
          {!alerts.isLoading && !alerts.error && relatedAlerts.length === 0 ? (
            <div className="help">
              {alerts.data && alerts.data.total > alerts.data.items.length
                ? '已加载的告警中没有该会话的记录；其余告警未加载，可能仍有关联记录'
                : '没有关联告警'}
            </div>
          ) : null}
          {relatedAlerts.length > 0 ? (
            <div className="alert-list">
              {relatedAlerts.map((alert: Alert) => (
                <div className="alert-row" key={alert.id}>
                  <span className={`tag ${severityColor(alert.severity)}`}>
                    {SEVERITY_LABELS[alert.severity] ?? alert.severity}
                  </span>
                  <div className="m">
                    <b>{alertLabel(alert.kind)}</b>
                    <span>{alertLabel(alert.kind) === alert.kind ? '原始类型' : alert.kind}</span>
                  </div>
                  <span className="tm">{formatTime(alert.created_at)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {alerts.data && alerts.data.total > alerts.data.items.length ? (
            <div className="help" style={{ marginTop: 8 }}>
              服务端还有未返回的告警（共 {alerts.data.total} 条，本次返回 {alerts.data.items.length}{' '}
              条），未加载部分未参与匹配
            </div>
          ) : null}
        </>
      ) : null}
    </SideSheet>
  )
}

function SessionFacts({
  detail,
  devices,
  emails,
}: {
  detail: SessionDetail
  devices: Map<number, Device>
  emails: Map<number, string>
}) {
  const session = detail.session
  return (
    <dl className="desc">
      <dt>来源</dt>
      <dd>
        <span className={`tag ${originColor(session.origin)}`}>{session.origin}</span>{' '}
        {session.origin === 'native' ? '日志推断，只记录不阻断' : '面板签发，策略强制'}
      </dd>
      <dt>状态</dt>
      <dd>
        <span className={`tag ${statusColor(session.status)}`}>
          {STATUS_LABELS[session.status] ?? session.status}
        </span>
      </dd>
      <dt>设备</dt>
      <dd>
        {deviceName(devices, session)}{' '}
        <span className="mono help">{session.rustdesk_id ?? '—'}</span>
      </dd>
      <dt>发起人</dt>
      <dd>{actorLabel(emails, session)}</dd>
      <dt>开始</dt>
      <dd className="mono">{formatTime(session.started_at)}</dd>
      <dt>结束</dt>
      <dd className="mono">{formatTime(session.ended_at)}</dd>
      <dt>最近活动</dt>
      <dd className="mono">{formatTime(session.last_activity_at)}</dd>
      <dt>时长</dt>
      <dd>
        {session.status === 'open'
          ? `进行中 · ${formatDuration(session.started_at, null)}`
          : session.status === 'denied'
            ? '—'
            : formatDuration(session.started_at, session.ended_at)}
      </dd>
      <dt>结束原因</dt>
      <dd>{endReasonLabel(session.end_reason)}</dd>
      <dt>票据 / 策略</dt>
      <dd className="mono">
        {session.ticket_id ? `#${session.ticket_id}` : '—'} /{' '}
        {session.policy_id ? `#${session.policy_id}` : '—'}
      </dd>
      <dt>控制权限</dt>
      <dd className="mono">
        {session.control_permissions}
        <span className="help"> （位图；native 恒为 0）</span>
      </dd>
    </dl>
  )
}

function ticketStatusColor(status: TicketState): string {
  if (status === 'used') return 'green'
  if (status === 'revoked') return 'red'
  if (status === 'expired') return 'grey'
  return 'orange'
}

function TicketFacts({
  orgId,
  ticketId,
  emails,
}: {
  orgId: number
  ticketId: number
  emails: Map<number, string>
}) {
  // Opening the sheet must not fetch this: GET ticket is audited as an
  // investigation visit, so the read waits for an explicit click.
  const [open, setOpen] = useState(false)
  const {
    currentData: ticket,
    isLoading,
    error,
    refetch,
  } = useGetTicketQuery({ orgId, ticketId }, { skip: !open })

  if (!open) {
    return (
      <div className="row-end">
        <button className="btn outline sm" type="button" onClick={() => setOpen(true)}>
          查看票据详情
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <>
        <div className="banner danger" role="alert" style={{ padding: '9px 11px' }}>
          <div>{ticketDetailError(error)}</div>
        </div>
        <div className="row-end" style={{ marginTop: 8 }}>
          <button className="btn outline sm" type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      </>
    )
  }

  if (isLoading || !ticket) {
    return (
      <div className="help" role="status">
        正在加载票据…
      </div>
    )
  }

  const status = ticketStatus(ticket, new Date())
  const actor = ticket.actor_user_id
    ? (emails.get(ticket.actor_user_id) ?? `用户 #${ticket.actor_user_id}`)
    : '—'
  return (
    <>
      <dl className="desc" data-testid="ticket-facts">
        <dt>状态</dt>
        <dd>
          <span className={`tag ${ticketStatusColor(status)}`}>{TICKET_STATUS_LABELS[status]}</span>
        </dd>
        <dt>签发人</dt>
        <dd>{actor}</dd>
        <dt>创建</dt>
        <dd className="mono">{formatTime(ticket.created_at)}</dd>
        <dt>过期</dt>
        <dd className="mono">{formatTime(ticket.expires_at)}</dd>
        <dt>兑换</dt>
        <dd className="mono">{formatTime(ticket.used_at)}</dd>
        <dt>撤销</dt>
        <dd className="mono">{formatTime(ticket.revoked_at)}</dd>
        <dt>审批</dt>
        <dd className="mono">
          {ticket.approval_id ? (
            <Link to={`/orgs/${orgId}/approvals?approvalId=${ticket.approval_id}`}>
              #{ticket.approval_id}
            </Link>
          ) : (
            '—'
          )}
        </dd>
        <dt>控制角色</dt>
        <dd className="mono">{ticket.control_role_id ? `#${ticket.control_role_id}` : '—'}</dd>
        <dt>控制权限</dt>
        <dd className="mono">
          {ticket.control_permissions}
          <span className="help"> （签发时位图）</span>
        </dd>
      </dl>
      {ticket.policy_snapshot ? (
        <details style={{ marginTop: 8 }}>
          <summary className="help">策略快照</summary>
          <pre
            className="mono cell-wrap"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: '6px 0 0',
              fontSize: 12,
            }}
          >
            {JSON.stringify(ticket.policy_snapshot, null, 2)}
          </pre>
        </details>
      ) : null}
    </>
  )
}
