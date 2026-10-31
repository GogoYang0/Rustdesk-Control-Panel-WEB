import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import Modal from '../../components/Modal'
import type { Approval, ApprovalKind } from '../../lib/api'
import { approvalKindLabel, approvalStatusLabel } from '../../lib/approval-query'
import {
  approvalReasonProblem,
  approvalRequestError,
  MAX_APPROVAL_REASON,
  toApprovalCreateRequest,
} from '../../lib/approval-request'
import { formatTime } from '../../lib/format'
import { useCreateApprovalMutation } from '../../store/api'

interface DeviceTarget {
  id: number
  name: string
  rustdesk_id: string
}

interface SessionTarget {
  id: number
  deviceName: string
  startedAt: string
}

interface Props {
  orgId: number
  kind: ApprovalKind
  device?: DeviceTarget
  session?: SessionTarget
  onClose: () => void
}

function resultTitle(kind: ApprovalKind, approval: Approval): string {
  if (approval.status === 'pending') return '审批请求已登记'
  if (kind === 'ratification' && approval.status === 'approved') return '该会话已追认'
  if (approval.status === 'denied') return '审批请求已处理'
  return '审批请求已过期'
}

export default function RequestApprovalDialog({ orgId, kind, device, session, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Approval | null>(null)
  const [create, { isLoading }] = useCreateApprovalMutation()
  // The disabled state only lands on the next render; two clicks in one tick
  // would both see isLoading=false and submit twice.
  const busyRef = useRef(false)
  // A response that lands after the caller closed the dialog (for example an
  // organization switch) must not resurrect a result or announce it.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const target = kind === 'pre_approval' ? device : session
  const title = kind === 'pre_approval' ? '申请事前审批' : '申请事后追认'
  const count = [...reason].length

  async function submit() {
    if (busyRef.current || !target) return
    const problem = approvalReasonProblem(reason)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    busyRef.current = true
    try {
      const approval = await create({
        orgId,
        request: toApprovalCreateRequest(
          kind,
          kind === 'pre_approval' ? { deviceId: device?.id } : { sessionId: session?.id },
          reason,
        ),
      }).unwrap()
      if (!mountedRef.current) return
      setResult(approval)
      Toast.success('审批请求已登记')
    } catch (err) {
      if (mountedRef.current) setError(approvalRequestError(err, kind))
    } finally {
      busyRef.current = false
    }
  }

  if (result) {
    return (
      <Modal
        title={resultTitle(kind, result)}
        onClose={onClose}
        footer={
          <>
            <Link
              className="btn outline"
              to={`/orgs/${orgId}/approvals?approvalId=${result.id}`}
              onClick={onClose}
              data-testid="approval-request-link"
            >
              前往审批中心
            </Link>
            <button className="btn primary" type="button" onClick={onClose}>
              关闭
            </button>
          </>
        }
      >
        <div className="banner info mb-14" style={{ padding: '9px 11px' }}>
          <div data-testid="approval-request-result">
            请求 <b>#{result.id}</b> · {approvalKindLabel(kind)} ·{' '}
            {approvalStatusLabel(kind, result.status)}
            {result.status === 'pending' ? ` · 截止 ${formatTime(result.expires_at)}` : ''}
          </div>
        </div>
        <dl className="desc">
          <dt>对象</dt>
          <dd>
            {device ? `${device.name} · ` : null}
            {session ? `会话 #${session.id} · ${session.deviceName} · ` : null}
            <span className="mono">
              {device ? device.rustdesk_id : formatTime(session?.startedAt ?? '')}
            </span>
          </dd>
          <dt>后续</dt>
          <dd>
            {kind === 'pre_approval'
              ? '你对该设备的待处理事前审批会直接复用；批准后须在截止前重新签发一次票据。'
              : '同一会话的待处理/已批准追认会直接复用；追认只记录事实，不产生票据。'}
          </dd>
        </dl>
      </Modal>
    )
  }

  return (
    <Modal
      title={title}
      // Closing while the request is in flight would discard the result (and
      // its Toast); the caller may close again once it settles.
      onClose={isLoading ? () => undefined : onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '提交中…' : '提交审批'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <dl className="desc mb-14">
        <dt>对象</dt>
        <dd>
          {device ? `${device.name} · ` : null}
          {session ? `会话 #${session.id} · ${session.deviceName} · ` : null}
          <span className="mono">
            {device ? device.rustdesk_id : formatTime(session?.startedAt ?? '')}
          </span>
        </dd>
        <dt>说明</dt>
        <dd>
          {kind === 'pre_approval'
            ? '批准只放行一次票据签发，批准本身不出票；请在审批截止前完成签发。'
            : '仅对已发生的 native 直连会话补记录，不产生票据、不消费额度。'}
        </dd>
      </dl>
      <div className="field">
        <label className="form-label" htmlFor="approval-reason">
          申请理由<span className="help">（可选，最多 {MAX_APPROVAL_REASON} 字）</span>
        </label>
        <textarea
          id="approval-reason"
          className="textarea"
          aria-label="申请理由"
          rows={4}
          value={reason}
          placeholder="说明用途，便于审批人判断"
          onChange={(event) => {
            setReason(event.target.value)
            if (error) setError('')
          }}
        />
        <div className="help" style={{ textAlign: 'right' }}>
          {count}/{MAX_APPROVAL_REASON}
        </div>
      </div>
    </Modal>
  )
}
