import { Banner } from '@douyinfe/semi-ui'
import { useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import type { ApprovalDecision } from '../../lib/api'
import {
  approvalActionLabels,
  approvalKindLabel,
  approvalStatusLabel,
  approvalWriteError,
  formatRemaining,
  isActionable,
  toDecisionRequest,
  ticketState,
} from '../../lib/approval-query'
import { formatTime } from '../../lib/format'
import { panelApi, useDecideApprovalMutation, useGetApprovalQuery } from '../../store/api'

const TICKET_TEXT: Record<string, string> = {
  linked: '该批准已关联票据（签发时消费了一次许可）。',
  not_linked: '该批准尚未关联票据：申请人需在原截止时间前重试签发，审批在签发时消费一次。',
  permission_expired: '签发许可已过期：批准仍保留在记录中，但已不能再用于签发。',
  acknowledged: '该追认只是对已发生原生会话的确认，不产生票据。',
}

export default function DecisionDialog({
  orgId,
  approvalId,
  canDecide,
  intent = 'approve',
  onClose,
  onDone,
}: {
  orgId: number
  approvalId: number
  canDecide: boolean
  /** Which button opened the dialog; the confirm still needs a click. */
  intent?: ApprovalDecision
  onClose: () => void
  onDone: () => void
}) {
  // Every open reads the row again: another approver may have decided it since
  // the sheet loaded, and the decision must rest on the current state.
  const {
    currentData: approval,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetApprovalQuery({ orgId, approvalId }, { refetchOnMountOrArgChange: true })
  const [decision, setDecision] = useState<ApprovalDecision>(intent)
  const dispatch = useDispatch()
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // After an unknown or conflicting result the form is frozen: the next step is
  // reading the current state, never silently re-sending the decision.
  const [needsRecheck, setNeedsRecheck] = useState(false)
  const [decide, { isLoading: submitting }] = useDecideApprovalMutation()

  if (isLoading) {
    return (
      <Modal
        title={`审批 #${approvalId}`}
        onClose={onClose}
        footer={
          <button className="btn tertiary" type="button" onClick={onClose}>
            关闭
          </button>
        }
      >
        <div className="help" role="status">
          正在读取最新状态…
        </div>
      </Modal>
    )
  }

  if (error || !approval) {
    return (
      <Modal
        title={`审批 #${approvalId}`}
        onClose={onClose}
        footer={
          <button className="btn tertiary" type="button" onClick={onClose}>
            关闭
          </button>
        }
      >
        <Banner
          type="danger"
          closeIcon={null}
          description={`读取审批失败：${approvalWriteError(error)}`}
        />
      </Modal>
    )
  }

  const actionable = isActionable(approval, new Date())
  const labels = approvalActionLabels(approval.kind)
  const state = ticketState(approval, new Date())
  // A cached row can be shown while the fresh read is still in flight; a
  // decision taken then could race that read and be overwritten by it.
  const allowed = actionable && canDecide && approval.status === 'pending' && !isFetching

  async function submit() {
    if (!allowed) return
    let request
    try {
      request = toDecisionRequest(decision, decision === 'deny' ? reason : undefined)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '原因不合法')
      return
    }
    setMessage(null)
    try {
      await decide({ orgId, approvalId, request }).unwrap()
      onDone()
    } catch (err) {
      setMessage(approvalWriteError(err))
      setNeedsRecheck(true)
      // The cached detail may still say "pending". Dropping it means reopening
      // the dialog fetches again instead of letting a stale row be re-sent.
      dispatch(
        panelApi.util.invalidateTags([
          { type: 'Approval', id: `${orgId}-${approvalId}` },
          { type: 'Approvals', id: orgId },
        ]),
      )
    }
  }

  async function recheck() {
    setMessage(null)
    const result = await refetch()
    if (result.data && isActionable(result.data, new Date()) && result.data.status === 'pending') {
      setNeedsRecheck(false)
      return
    }
    setMessage('最新状态已不是可决策的待处理请求，请关闭窗口。')
  }

  return (
    <Modal
      title={`${labels.approve === '追认' ? '追认' : '审批'} #${approval.id}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={submitting} onClick={onClose}>
            取消
          </button>
          {needsRecheck ? (
            <button className="btn outline" type="button" onClick={recheck}>
              核对最新状态
            </button>
          ) : (
            <button
              className={`btn ${decision === 'deny' ? 'danger' : 'primary'}`}
              type="button"
              disabled={!allowed || submitting}
              title={!canDecide ? '需要 approval.decide 权限' : undefined}
              onClick={() => void submit()}
            >
              {submitting ? '提交中…' : `确认${labels[decision]}`}
            </button>
          )}
        </>
      }
    >
      {isFetching && !isLoading ? (
        <div className="help mb-14" role="status">
          正在核对最新状态…
        </div>
      ) : null}
      {message ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{message}</div>
        </div>
      ) : null}

      <dl className="desc">
        <dt>类型</dt>
        <dd>{approvalKindLabel(approval.kind)}</dd>
        <dt>状态</dt>
        <dd>{approvalStatusLabel(approval.kind, approval.status)}</dd>
        <dt>截止</dt>
        <dd className="mono">
          {formatTime(approval.expires_at)}
          <span className="help"> {formatRemaining(approval.expires_at, new Date())}</span>
        </dd>
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
        <div className="banner warning mt-14" style={{ padding: '10px 12px' }}>
          <div>该请求已不可决策（已处理、已过期或服务端尚未刷新）。请关闭后核对最新状态。</div>
        </div>
      ) : !canDecide ? (
        <div className="banner info mt-14" style={{ padding: '10px 12px' }}>
          <div>当前角色没有 approval.decide 权限，只能查看。</div>
        </div>
      ) : needsRecheck ? (
        <div className="banner warning mt-14" style={{ padding: '10px 12px' }}>
          <div>结果未确认。请先核对最新状态，确认仍是待处理后再决定。</div>
        </div>
      ) : (
        <>
          <div className="field mt-14">
            <label className="form-label">决定</label>
            <div className="chips" role="group" aria-label="决定" style={{ margin: 0 }}>
              <button
                type="button"
                className={`chip-btn ${decision === 'approve' ? 'on' : ''}`}
                aria-pressed={decision === 'approve'}
                onClick={() => setDecision('approve')}
              >
                {labels.approve}
              </button>
              <button
                type="button"
                className={`chip-btn ${decision === 'deny' ? 'on' : ''}`}
                aria-pressed={decision === 'deny'}
                onClick={() => setDecision('deny')}
              >
                {labels.deny}
              </button>
            </div>
            <div className="help">
              {decision === 'approve'
                ? approval.kind === 'ratification'
                  ? '追认只记录事实，不产生票据、不强制断连。'
                  : '批准只放行一次票据签发，不会自动发票据或建立连接；申请人须在原截止前重试签发。'
                : '拒绝是终态，不能用同一请求反向决策；如填写原因将覆盖当前事由。'}
            </div>
          </div>
          {decision === 'deny' ? (
            <div className="field mt-14">
              <label className="form-label">原因（可选）</label>
              <textarea
                className="textarea"
                aria-label="拒绝原因"
                value={reason}
                maxLength={500}
                placeholder="写入审计，留空则保留当前事由"
                onChange={(event) => setReason(event.target.value)}
              />
              <div className="help">{reason.length} / 500 · 留空不会清空当前事由</div>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  )
}
