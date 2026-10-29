import SideSheet from '../../components/SideSheet'
import type { AuditLog, ConnectionLog, FileLog } from '../../lib/api'
import {
  auditDetailText,
  auditTargetLabel,
  connectionStatusLabel,
  connectionStatusTone,
  fileDirectionLabel,
} from '../../lib/audit-query'
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

export function ConnectionLogSheet({
  row,
  deviceName,
  onClose,
}: {
  row: ConnectionLog
  deviceName?: string
  onClose: () => void
}) {
  return (
    <SideSheet title={`连接 #${row.id}`} onClose={onClose}>
      <dl className="desc">
        <dt>状态</dt>
        <dd>
          <span className={`tag ${connectionStatusTone(row.status)}`}>
            {connectionStatusLabel(row.status)}
          </span>
        </dd>
        <dt>开始</dt>
        <dd className="mono">{formatTime(row.started_at)}</dd>
        <dt>结束</dt>
        <dd className="mono">{formatTime(row.ended_at)}</dd>
        <dt>设备</dt>
        <dd className="cell-wrap">{deviceName ?? `设备 #${row.device_id}`}</dd>
        <dt>RustDesk ID</dt>
        <dd className="mono">{row.rustdesk_id}</dd>
        <dt>IP</dt>
        <dd className="mono">{row.ip || '—'}</dd>
        <dt>客户端连接</dt>
        <dd className="mono cell-wrap">
          {`conn #${row.conn_id}`}
          {row.session_id > 0 ? ` / session #${row.session_id}` : ''}
          <div className="help">客户端连接标识，非面板会话</div>
        </dd>
        <dt>备注</dt>
        <dd className="cell-wrap">{row.note || '—'}</dd>
        <dt>审计引用</dt>
        <dd className="mono cell-wrap">{row.conn_audit_ref || '—'}</dd>
        <dt>创建时间</dt>
        <dd className="mono">{formatTime(row.created_at)}</dd>
      </dl>
    </SideSheet>
  )
}

export function FileLogSheet({
  row,
  deviceName,
  onClose,
}: {
  row: FileLog
  deviceName?: string
  onClose: () => void
}) {
  const files = Array.isArray(row.files) ? row.files.slice(0, 10) : []
  return (
    <SideSheet title={`文件传输 #${row.id}`} onClose={onClose}>
      <dl className="desc">
        <dt>时间</dt>
        <dd className="mono">{formatTime(row.created_at)}</dd>
        <dt>方向</dt>
        <dd>{fileDirectionLabel(row.direction)}</dd>
        <dt>设备</dt>
        <dd className="cell-wrap">{deviceName ?? `设备 #${row.device_id}`}</dd>
        <dt>RustDesk ID</dt>
        <dd className="mono">{row.rustdesk_id}</dd>
        <dt>peer</dt>
        <dd className="mono">{row.peer_id || '—'}</dd>
        <dt>conn_id</dt>
        <dd className="mono">{row.conn_id ?? '—'}</dd>
        <dt>路径</dt>
        <dd className="mono cell-wrap">{row.path || '—'}</dd>
        <dt>类型</dt>
        <dd>{row.is_file == null ? '—' : row.is_file ? '文件' : '目录'}</dd>
        <dt>文件数</dt>
        <dd className="mono">{row.file_count ?? '—'}</dd>
        <dt>IP</dt>
        <dd className="mono">{row.ip || '—'}</dd>
        <dt>文件</dt>
        <dd>
          {files.length === 0
            ? '—'
            : files.map((entry, index) => (
                <div key={index} className="mono cell-wrap">
                  {Array.isArray(entry)
                    ? `${String(entry[0] ?? '—')} · ${String(entry[1] ?? '—')}`
                    : String(entry)}
                </div>
              ))}
          {row.file_count != null && row.file_count > files.length ? (
            <div className="help">仅展示前 10 项</div>
          ) : null}
        </dd>
        <dt>info</dt>
        <dd>
          {row.info ? (
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {row.info}
            </pre>
          ) : (
            '—'
          )}
        </dd>
      </dl>
    </SideSheet>
  )
}
