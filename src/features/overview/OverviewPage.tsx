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

function StatCard({
  label,
  value,
  loading,
  errorText,
  onRetry,
  locked,
  hint,
  testId,
}: {
  label: string
  value: number | undefined
  loading: boolean
  errorText: string | null
  onRetry?: () => void
  locked?: boolean
  hint?: string
  testId: string
}) {
  return (
    <div className="card stat" data-testid={testId}>
      <div className="lbl">{label}</div>
      <div className="val" role={loading ? 'status' : undefined}>
        {locked || loading || errorText ? '—' : formatCount(value)}
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
      ) : (
        <div className="help">{loading ? '正在加载…' : hint}</div>
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
            <div className="help" role="status">
              正在加载总览…
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
          testId="overview-stat-devices"
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
          testId="overview-stat-sessions"
          label="进行中会话"
          value={sessions.currentData?.total}
          loading={loadingOf(sessions)}
          errorText={sessions.error ? overviewError(sessions.error, 'sessions') : null}
          onRetry={() => void sessions.refetch()}
          hint="按开始时间倒序"
        />
        <StatCard
          testId="overview-stat-approvals"
          label="待处理审批"
          value={approvals.currentData?.total}
          loading={loadingOf(approvals)}
          errorText={approvals.error ? overviewError(approvals.error, 'approvals') : null}
          onRetry={() => void approvals.refetch()}
          hint="含事前审批与事后追认"
        />
        <StatCard
          testId="overview-stat-alerts"
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
              <div className="help" role="status">
                正在加载会话…
              </div>
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
              <div className="help" role="status">
                正在加载审批…
              </div>
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
              <div className="help" role="status">
                正在加载告警…
              </div>
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
