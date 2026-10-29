import SideSheet from '../../components/SideSheet'
import type { LogEvent } from '../../lib/api'
import {
  logDetailRaw,
  logDetailRest,
  logEventDeviceLabel,
  logKindLabel,
  logLevelLabel,
  logLevelTone,
  logSourceLabel,
} from '../../lib/log-query'
import { formatTime } from '../../lib/format'

export default function LogDetailSheet({
  row,
  names,
  onClose,
}: {
  row: LogEvent
  names: Map<number, string>
  onClose: () => void
}) {
  const raw = logDetailRaw(row.detail)
  const rest = logDetailRest(row.detail)

  return (
    <SideSheet title={`日志 #${row.id}`} onClose={onClose}>
      <dl className="desc">
        <dt>事件 ID</dt>
        <dd className="mono">{row.id}</dd>
        <dt>时间</dt>
        <dd className="mono">{formatTime(row.occurred_at)}</dd>
        <dt>来源</dt>
        <dd>
          <span className={`tag ${row.source === 'hbbs' ? 'blue' : 'grey'}`}>
            {logSourceLabel(row.source)}
          </span>
        </dd>
        <dt>级别</dt>
        <dd>
          <span className={`tag ${logLevelTone(row.level)}`}>{logLevelLabel(row.level)}</span>
        </dd>
        <dt>类型</dt>
        <dd>{logKindLabel(String(row.kind))}</dd>
        <dt>设备</dt>
        <dd className="cell-wrap">{logEventDeviceLabel(row.device_id, names)}</dd>
        <dt>原始行</dt>
        <dd>
          {raw ? (
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {raw}
            </pre>
          ) : (
            '—'
          )}
        </dd>
        <dt>捕获字段</dt>
        <dd>
          {rest ? (
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {rest}
            </pre>
          ) : (
            '—'
          )}
        </dd>
      </dl>
    </SideSheet>
  )
}
