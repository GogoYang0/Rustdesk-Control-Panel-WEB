import SideSheet from '../../components/SideSheet'
import type { AuditLog } from '../../lib/api'
import { auditDetailText, auditTargetLabel } from '../../lib/audit-query'
import { formatTime } from '../../lib/format'

export function AuditLogSheet({
  row,
  actorLabel,
  onClose,
}: {
  row: AuditLog
  actorLabel: string
  onClose: () => void
}) {
  const detail = auditDetailText(row.detail)
  return (
    <SideSheet title={`审计 #${row.seq}`} onClose={onClose}>
      <dl className="desc">
        <dt>序号</dt>
        <dd className="mono">{row.seq}</dd>
        <dt>时间</dt>
        <dd className="mono">{formatTime(row.created_at)}</dd>
        <dt>操作人</dt>
        <dd className="cell-wrap">{actorLabel}</dd>
        <dt>动作</dt>
        <dd className="mono cell-wrap">{row.action}</dd>
        <dt>目标</dt>
        <dd className="cell-wrap">{auditTargetLabel(row.target_type, row.target_id)}</dd>
        <dt>详情</dt>
        <dd>
          {detail ? (
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {detail}
            </pre>
          ) : (
            '—'
          )}
        </dd>
      </dl>
    </SideSheet>
  )
}
