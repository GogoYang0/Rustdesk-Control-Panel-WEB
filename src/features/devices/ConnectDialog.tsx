import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link } from 'react-router'

import Modal from '../../components/Modal'
import type { Device, IssuedTicket } from '../../lib/api'
import { issueTicket } from '../../lib/api'
import { writeClipboard } from '../../lib/clipboard'
import { formatTime } from '../../lib/format'
import {
  approvalIDFromError,
  DEFAULT_TICKET_TTL,
  formatTicketRemaining,
  isApprovalRequired,
  TICKET_STATUS_LABELS,
  TICKET_TTL_OPTIONS,
  ticketIssueError,
  ticketStatus,
} from '../../lib/ticket'
import { panelApi } from '../../store/api'

interface Props {
  orgId: number
  device: Device
  onClose: () => void
}

type Phase = 'form' | 'approval' | 'issued'

export default function ConnectDialog({ orgId, device, onClose }: Props) {
  const dispatch = useDispatch()
  const [ttl, setTtl] = useState<number>(DEFAULT_TICKET_TTL)
  const [phase, setPhase] = useState<Phase>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [approvalID, setApprovalID] = useState<number | null>(null)
  const [issued, setIssued] = useState<IssuedTicket | null>(null)
  const [now, setNow] = useState(() => new Date())
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // The countdown only matters while the token is on screen; stop it otherwise.
  useEffect(() => {
    if (!issued) return
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [issued])

  const refreshApprovals = (approvalId: number | null) => {
    dispatch(panelApi.util.invalidateTags([{ type: 'Approvals', id: orgId }]))
    if (approvalId) {
      dispatch(panelApi.util.invalidateTags([{ type: 'Approval', id: `${orgId}-${approvalId}` }]))
    }
  }

  async function submit() {
    if (busyRef.current) return
    setError('')
    setSubmitting(true)
    busyRef.current = true
    try {
      const result = await issueTicket(orgId, { device_id: device.id, ttl_seconds: ttl })
      if (!mountedRef.current) return
      setIssued(result)
      setPhase('issued')
      setNow(new Date())
      // Issuance may have consumed a pre-approval even though the response does
      // not echo it: refresh the inbox and the bound request either way.
      refreshApprovals(result.ticket.approval_id ?? null)
      Toast.success('票据已签发，请立即复制明文')
    } catch (err) {
      if (!mountedRef.current) return
      if (isApprovalRequired(err)) {
        const id = approvalIDFromError(err)
        setApprovalID(id)
        setPhase('approval')
        refreshApprovals(id)
      } else {
        setError(ticketIssueError(err))
      }
    } finally {
      busyRef.current = false
      if (mountedRef.current) setSubmitting(false)
    }
  }

  async function copyToken() {
    if (!issued) return
    if (await writeClipboard(issued.token)) {
      Toast.success('令牌已复制')
    } else {
      Toast.error('复制失败，请手动选择')
    }
  }

  const locked = submitting || phase === 'issued'
  const close = locked ? () => undefined : onClose
  const status = issued ? ticketStatus(issued.ticket, now) : 'pending'

  if (phase === 'issued' && issued) {
    return (
      <Modal
        title="票据已签发"
        // The token cannot be recovered once this dialog is gone.
        onClose={() => undefined}
        footer={
          <>
            <button className="btn tertiary" type="button" onClick={() => void copyToken()}>
              复制令牌
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                setIssued(null)
                onClose()
              }}
            >
              我已保存
            </button>
          </>
        }
      >
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>
            <b>明文令牌只显示这一次。</b>
            关闭后无法再次查看；遮罩点击与 Escape 不会关闭，请先复制或点「我已保存」。
          </div>
        </div>
        {status === 'expired' ? (
          <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
            <div>令牌已失效，请重新签发。</div>
          </div>
        ) : null}
        <pre
          className="mono cell-wrap"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}
          data-testid="ticket-plaintext"
        >
          {issued.token}
        </pre>
        <dl className="desc" style={{ marginTop: 12 }}>
          <dt>票据</dt>
          <dd className="mono">#{issued.ticket.id}</dd>
          <dt>设备</dt>
          <dd>
            {device.name} <span className="mono help">{device.rustdesk_id}</span>
          </dd>
          <dt>状态</dt>
          <dd>{TICKET_STATUS_LABELS[status]}</dd>
          <dt>有效期</dt>
          <dd>
            {status === 'expired'
              ? '已过期'
              : `剩余 ${formatTicketRemaining(issued.ticket.expires_at, now)}`}
          </dd>
          <dt>过期时间</dt>
          <dd className="mono">{formatTime(issued.ticket.expires_at)}</dd>
        </dl>
        <div className="help" style={{ marginTop: 8 }}>
          令牌交给客户端兑换后才会创建 panel 会话；本控制台不代为兑换。
        </div>
      </Modal>
    )
  }

  if (phase === 'approval') {
    const center = approvalID
      ? `/orgs/${orgId}/approvals?approvalId=${approvalID}`
      : `/orgs/${orgId}/approvals?status=pending`
    return (
      <Modal
        title="需要事前审批"
        onClose={close}
        footer={
          <>
            <Link
              className="btn outline"
              to={center}
              onClick={(event) => {
                // Navigating while the retry is in flight would unmount the
                // dialog and discard a successful token.
                if (submitting) {
                  event.preventDefault()
                  return
                }
                close()
              }}
            >
              查看审批请求
            </Link>
            <button className="btn tertiary" type="button" disabled={submitting} onClick={close}>
              取消
            </button>
            <button className="btn primary" type="button" disabled={submitting} onClick={submit}>
              {submitting ? '签发中…' : '重试签发'}
            </button>
          </>
        }
      >
        {error ? (
          <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
            <div>{error}</div>
          </div>
        ) : null}
        <div
          className="banner warning mb-14"
          style={{ padding: '9px 11px' }}
          data-testid="ticket-approval"
        >
          <div>
            该设备所在策略要求事前审批。审批请求
            {approvalID ? <b> #{approvalID}</b> : '已创建'} 正在等待处理；批准后重试签发即可，
            批准本身不出票。
          </div>
        </div>
        <p className="help">
          审批在请求时刻起 15 分钟内有效；批准后回到本弹窗点「重试签发」。审批过期需重新申请。
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="发起连接"
      onClose={close}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={submitting} onClick={close}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={submitting} onClick={submit}>
            {submitting ? '签发中…' : '签发票据'}
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
        <dt>设备</dt>
        <dd>
          {device.name} <span className="mono help">{device.rustdesk_id}</span>
        </dd>
        <dt>说明</dt>
        <dd>签发只产生一次性票据；客户端兑换后才创建 panel 会话。</dd>
      </dl>
      {!device.bound ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>设备当前未绑定：令牌仍可签发，但客户端重新认领前无法建立真实连接。</div>
        </div>
      ) : null}
      <div className="field">
        <label className="form-label" htmlFor="ticket-ttl">
          票据有效期
        </label>
        <select
          id="ticket-ttl"
          className="select-native"
          aria-label="票据有效期"
          value={ttl}
          disabled={submitting}
          onChange={(event) => setTtl(Number(event.target.value))}
        >
          {TICKET_TTL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="help">到期未兑换即失效；策略要求审批时会先进入审批。</div>
      </div>
    </Modal>
  )
}
