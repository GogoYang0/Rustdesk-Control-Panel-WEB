import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'
import { Link, useParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import { alertKindLabel, alertSeverityLabel, alertSeverityTone } from '../../lib/alert-query'
import { approvalKindLabel, approvalStatusLabel } from '../../lib/approval-query'
import { formatTime } from '../../lib/format'
import {
  approvalDeviceLabel,
  formatCount,
  overviewError,
  sessionDeviceLabel,
  sessionOriginLabel,
} from '../../lib/overview'
import {
  useGetAlertPageQuery,
  useGetApprovalPageQuery,
  useGetDevicePageQuery,
  useGetMeQuery,
  useGetSessionsQuery,
} from '../../store/api'
import { CardSkeleton, ListSkeleton, SkeletonLine } from '../../components/Skeleton'

const STAT_FLOW_SPEED = 120

function StatCard({
  label,
  value,
  loading,
  errorText,
  onRetry,
  locked,
  hint,
  accent,
  icon,
  testId,
}: {
  label: string
  value: number | undefined
  loading: boolean
  errorText: string | null
  onRetry?: () => void
  locked?: boolean
  hint?: string
  accent: string
  icon: ReactElement
  testId: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [flow, setFlow] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const speed = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? STAT_FLOW_SPEED * 0.4
      : STAT_FLOW_SPEED

    let angle = 0
    let frame: number | null = null
    let last = 0

    const draw = () => el.style.setProperty('--stat-angle', `${angle.toFixed(2)}deg`)

    const tick = (now: number) => {
      frame = null
      const dt = Math.min((now - last) / 1000, 0.064)
      last = now
      angle += speed * dt
      if (angle >= 360) angle -= 360
      draw()
      frame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (frame !== null) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const enter = () => {
      setFlow(true)
      start()
    }
    const leave = () => {
      setFlow(false)
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
    }

    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', leave)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  function trackSpot(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--stat-x', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--stat-y', `${event.clientY - rect.top}px`)
  }

  return (
    <div
      ref={cardRef}
      className="card stat"
      data-testid={testId}
      data-flow={flow ? 'on' : undefined}
      style={{ '--stat-accent': accent } as CSSProperties}
      onPointerMove={trackSpot}
    >
      <span className="stat-ring" aria-hidden="true" />
      <span className="stat-spot" aria-hidden="true" />
      <span className="stat-dots" aria-hidden="true" />
      <div className="stat-top">
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="lbl">{label}</div>
      </div>
      <div className="val" role={loading ? 'status' : undefined}>
        {locked || errorText ? (
          '—'
        ) : loading ? (
          <SkeletonLine width={72} height={34} />
        ) : (
          formatCount(value)
        )}
      </div>
      {locked ? (
        <div className="help">{hint ?? '当前角色无权查看该指标'}</div>
      ) : errorText ? (
        <div className="help err" role="alert">
          {errorText}
          {onRetry ? (
            <button className="btn tertiary sm" type="button" onClick={onRetry}>
              重试
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <div className="help">
          <SkeletonLine width="68%" height={10} />
        </div>
      ) : (
        <div className="help">{hint}</div>
      )}
    </div>
  )
}

export default function OverviewPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const validId = Number.isSafeInteger(id) && id > 0
  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const canReadDevices = current?.permissions.includes('device.read') ?? false
  const enabled = validId && Boolean(current)

  const devices = useGetDevicePageQuery(
    { orgId: id, queryString: 'page=1&pageSize=1' },
    { skip: !enabled || !canReadDevices },
  )
  const sessions = useGetSessionsQuery(
    { orgId: id, queryString: 'status=open&page=1&pageSize=5' },
    { skip: !enabled },
  )
  const approvals = useGetApprovalPageQuery(
    { orgId: id, queryString: 'status=pending&page=1&pageSize=5' },
    { skip: !enabled },
  )
  const alerts = useGetAlertPageQuery(
    { orgId: id, queryString: 'page=1&pageSize=5' },
    { skip: !enabled },
  )

  function loadingOf(query: { isLoading: boolean; isFetching: boolean; currentData?: unknown }) {
    return query.isLoading || (query.isFetching && query.currentData === undefined)
  }

  const anyFetching =
    devices.isFetching || sessions.isFetching || approvals.isFetching || alerts.isFetching

  function refreshAll() {
    if (canReadDevices) void devices.refetch()
    void sessions.refetch()
    void approvals.refetch()
    void alerts.refetch()
  }

  if (!validId) {
    return <StateBlock code="404" title="组织不存在" description="组织 id 不合法。" />
  }
  if (meLoading) {
    return (
      <section className="page on">
        <div className="card">
          <div className="card-body">
            <CardSkeleton lines={2} />
          </div>
        </div>
      </section>
    )
  }
  if (!me || !current) {
    return (
      <StateBlock
        code="403"
        title="组织不可用"
        description="无法确认当前组织与账户，请重新登录。"
      />
    )
  }

  const sessionItems = sessions.currentData?.items ?? []
  const approvalItems = approvals.currentData?.items ?? []
  const alertItems = alerts.currentData?.items ?? []

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">总览</h1>
          <div className="page-sub">
            {current.name} · {me.user.email} · 安全与连接治理一览
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn outline sm"
            type="button"
            disabled={anyFetching}
            onClick={refreshAll}
          >
            {anyFetching ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <div className="banner info mb-14">
        <div>
          <b>只读总览。</b>
          指标口径为全部历史；告警没有处置状态，设备在线数、趋势与报表暂无聚合 API。
        </div>
      </div>

      <div
        className="grid mb-14"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}
      >
        <StatCard
          accent="var(--primary)"
          testId="overview-stat-devices"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="2.5" y="3.5" width="13" height="8.5" rx="1.5" />
              <path d="M6 15h6M9 12v3" />
            </svg>
          }
          label="设备总数"
          value={devices.currentData?.total}
          loading={canReadDevices && loadingOf(devices)}
          errorText={
            canReadDevices && devices.error ? overviewError(devices.error, 'devices') : null
          }
          onRetry={() => void devices.refetch()}
          locked={!canReadDevices}
          hint={canReadDevices ? '来自设备列表 total' : '需要 device.read 权限'}
        />
        <StatCard
          accent="var(--secondary)"
          testId="overview-stat-sessions"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="9" r="6.5" />
              <path d="M7.5 6.5l4 2.5-4 2.5z" />
            </svg>
          }
          label="进行中会话"
          value={sessions.currentData?.total}
          loading={loadingOf(sessions)}
          errorText={sessions.error ? overviewError(sessions.error, 'sessions') : null}
          onRetry={() => void sessions.refetch()}
          hint="按开始时间倒序"
        />
        <StatCard
          accent="var(--warning)"
          testId="overview-stat-approvals"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="12" height="12" rx="2" />
              <path d="M6.3 9.2l1.8 1.8 3.6-4" />
            </svg>
          }
          label="待处理审批"
          value={approvals.currentData?.total}
          loading={loadingOf(approvals)}
          errorText={approvals.error ? overviewError(approvals.error, 'approvals') : null}
          onRetry={() => void approvals.refetch()}
          hint="含事前审批与事后追认"
        />
        <StatCard
          accent="var(--danger)"
          testId="overview-stat-alerts"
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 2.8a4.4 4.4 0 00-4.4 4.4v2.8L3.2 12.5h11.6L13.4 10V7.2A4.4 4.4 0 009 2.8z" />
              <path d="M7.3 14.2a1.8 1.8 0 003.4 0" />
            </svg>
          }
          label="告警总数"
          value={alerts.currentData?.total}
          loading={loadingOf(alerts)}
          errorText={alerts.error ? overviewError(alerts.error, 'alerts') : null}
          onRetry={() => void alerts.refetch()}
          hint="全部历史，无处置状态"
        />
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}
      >
        <div className="card" data-testid="overview-sessions">
          <div className="card-head">
            <div className="card-title">进行中会话</div>
            <Link className="btn borderless sm" to={`/orgs/${id}/sessions?status=open&range=all`}>
              查看全部
            </Link>
          </div>
          <div className="card-body">
            {loadingOf(sessions) ? (
              <ListSkeleton rows={3} />
            ) : sessions.error ? (
              <div className="banner danger" role="alert">
                <div>{overviewError(sessions.error, 'sessions')}</div>
                <button
                  className="btn tertiary sm"
                  type="button"
                  onClick={() => void sessions.refetch()}
                >
                  重试
                </button>
              </div>
            ) : sessionItems.length === 0 ? (
              <div className="help">暂无进行中的会话。</div>
            ) : (
              <table className="table" style={{ border: 'none' }}>
                <tbody>
                  {sessionItems.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <Link
                          to={`/orgs/${id}/sessions?status=open&range=all&sessionId=${session.id}`}
                        >
                          {sessionDeviceLabel(session)}
                        </Link>
                        <div className="help">
                          {sessionOriginLabel(session.origin)} · {formatTime(session.started_at)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card" data-testid="overview-approvals">
          <div className="card-head">
            <div className="card-title">待处理审批</div>
            <Link className="btn borderless sm" to={`/orgs/${id}/approvals?status=pending`}>
              查看全部
            </Link>
          </div>
          <div className="card-body">
            {loadingOf(approvals) ? (
              <ListSkeleton rows={3} />
            ) : approvals.error ? (
              <div className="banner danger" role="alert">
                <div>{overviewError(approvals.error, 'approvals')}</div>
                <button
                  className="btn tertiary sm"
                  type="button"
                  onClick={() => void approvals.refetch()}
                >
                  重试
                </button>
              </div>
            ) : approvalItems.length === 0 ? (
              <div className="help">暂无待处理审批。</div>
            ) : (
              <table className="table" style={{ border: 'none' }}>
                <tbody>
                  {approvalItems.map((approval) => (
                    <tr key={approval.id}>
                      <td>
                        <Link to={`/orgs/${id}/approvals?status=pending&approvalId=${approval.id}`}>
                          {approvalKindLabel(approval.kind)} ·{' '}
                          {approvalDeviceLabel(approval.device_id)}
                        </Link>
                        <div className="help">
                          {approvalStatusLabel(approval.kind, approval.status)} · 截止{' '}
                          {formatTime(approval.expires_at)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="help" style={{ marginTop: 8 }}>
              含事前审批与事后追认；超期但未被后台扫描的行可能短暂显示。
            </div>
          </div>
        </div>

        <div className="card" data-testid="overview-alerts">
          <div className="card-head">
            <div className="card-title">最新告警</div>
            <Link className="btn borderless sm" to={`/orgs/${id}/alerts?range=all`}>
              查看全部
            </Link>
          </div>
          <div className="card-body">
            {loadingOf(alerts) ? (
              <ListSkeleton rows={3} />
            ) : alerts.error ? (
              <div className="banner danger" role="alert">
                <div>{overviewError(alerts.error, 'alerts')}</div>
                <button
                  className="btn tertiary sm"
                  type="button"
                  onClick={() => void alerts.refetch()}
                >
                  重试
                </button>
              </div>
            ) : alertItems.length === 0 ? (
              <div className="help">暂无告警。</div>
            ) : (
              <table className="table" style={{ border: 'none' }}>
                <tbody>
                  {alertItems.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <span className={`tag ${alertSeverityTone(alert.severity)}`}>
                          {alertSeverityLabel(alert.severity)}
                        </span>
                        <b style={{ marginLeft: 8 }}>{alertKindLabel(alert.kind)}</b>
                        <div className="help">{formatTime(alert.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
