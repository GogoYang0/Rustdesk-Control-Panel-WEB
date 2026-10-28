import { Banner } from '@douyinfe/semi-ui'

import SideSheet from '../../components/SideSheet'
import {
  approvalActionLabels,
  approvalKindLabel,
  approvalStatusLabel,
  approvalWriteError,
  formatRemaining,
  isActionable,
  ticketState,
} from '../../lib/approval-query'
import { formatTime } from '../../lib/format'
import { useGetApprovalQuery } from '../../store/api'

const TICKET_TEXT: Record<string, string> = {
  linked: '已关联票据（签发时消费了一次许可）',
  not_linked: '尚未关联票据：申请人需在原截止前重试签发',
  permission_expired: '签发许可已过期，不能再用于签发',
  acknowledged: '已追认，不产生票据',
}

export default function ApprovalSheet({
  orgId,
  approvalId,
  canDecide,
  emails,
  devices,
  onClose,
  onDecide,
}: {
  orgId: number
  approvalId: number
  canDecide: boolean
  emails: Map<number, string>
  devices: Map<number, { name: string; rustdeskId: string }>
  onClose: () => void
  onDecide: (approvalId: number, intent: 'approve' | 'deny') => void
}) {
  const {
    currentData: approval,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetApprovalQuery({
    orgId,
    approvalId,
  })
  const now = new Date()
  const actionable = approval ? isActionable(approval, now) : false
  const state = approval ? ticketState(approval, now) : null
  const labels = approval ? approvalActionLabels(approval.kind) : null

  return (
    <SideSheet title={`审批 #${approvalId}`} onClose={onClose}>
      {isLoading ? (
        <div className="help" role="status">
          正在读取审批…
        </div>
      ) : null}
      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`读取审批失败：${approvalWriteError(error)}`}
        />
      ) : null}

      {approval ? (
        <>
          <dl className="desc">
            <dt>类型</dt>
            <dd>{approvalKindLabel(approval.kind)}</dd>
            <dt>状态</dt>
            <dd>{approvalStatusLabel(approval.kind, approval.status)}</dd>
            <dt>申请人</dt>
            <dd className="cell-wrap">
              {approval.actor_user_id != null
                ? (emails.get(approval.actor_user_id) ?? `用户 #${approval.actor_user_id}`)
                : '—'}
            </dd>
            <dt>设备</dt>
            <dd className="cell-wrap">
              {devices.get(approval.device_id)?.name ?? `设备 #${approval.device_id}`}
              <span className="mono help">
                {' '}
                {devices.get(approval.device_id)?.rustdeskId ?? `#${approval.device_id}`}
              </span>
            </dd>
            <dt>关联会话</dt>
            <dd className="mono">
              {approval.session_id != null ? `会话 #${approval.session_id}` : '—'}
            </dd>
            <dt>提交</dt>
            <dd className="mono">{formatTime(approval.requested_at)}</dd>
            <dt>截止</dt>
            <dd className="mono">
              {formatTime(approval.expires_at)}
              <span className="help"> {formatRemaining(approval.expires_at, now)}</span>
            </dd>
            {approval.decided_at ? (
              <>
                <dt>决策</dt>
                <dd>
                  {formatTime(approval.decided_at)}
                  {approval.decided_by != null ? (
                    <span className="help">
                      {' '}
                      · {emails.get(approval.decided_by) ?? `用户 #${approval.decided_by}`}
                    </span>
                  ) : null}
                </dd>
              </>
            ) : null}
            <dt>事由</dt>
            <dd className="cell-wrap">{approval.reason || '—'}</dd>
            {state ? (
              <>
                <dt>票据</dt>
                <dd>{TICKET_TEXT[state]}</dd>
              </>
            ) : null}
          </dl>

          {!actionable ? (
            <div className="banner info mt-14" style={{ padding: '10px 12px' }}>
              <div>
                {approval.status === 'pending'
                  ? '该请求已超过截止时间或服务端尚未刷新，无法再决策。'
                  : '该请求已处理，决策是终态。'}
              </div>
            </div>
          ) : !canDecide ? (
            <div className="banner info mt-14" style={{ padding: '10px 12px' }}>
              <div>当前角色没有 approval.decide 权限，只能查看。</div>
            </div>
          ) : null}

          <div className="row-end" style={{ flexWrap: 'wrap' }}>
            <button
              className="btn outline sm"
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              刷新
            </button>
            {labels && actionable && canDecide && !error ? (
              <>
                <button
                  className="btn primary sm"
                  type="button"
                  onClick={() => onDecide(approval.id, 'approve')}
                >
                  {labels.approve}
                </button>
                <button
                  className="btn danger sm"
                  type="button"
                  onClick={() => onDecide(approval.id, 'deny')}
                >
                  {labels.deny}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </SideSheet>
  )
}
