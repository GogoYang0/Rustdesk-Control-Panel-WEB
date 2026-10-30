import { Toast } from '@douyinfe/semi-ui'
import { useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import { updateAuditRetention } from '../../lib/api'
import { formatTime } from '../../lib/format'
import { readArchiveSummary, retentionDaysProblem, settingsError } from '../../lib/settings'
import type { AppDispatch } from '../../store'
import { panelApi, useGetAuditRetentionQuery } from '../../store/api'

export default function RetentionCard({ orgId }: { orgId: number }) {
  const dispatch = useDispatch<AppDispatch>()
  const { data, isLoading, isFetching, error, refetch } = useGetAuditRetentionQuery(orgId)
  const [editing, setEditing] = useState(false)
  const [days, setDays] = useState('0')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const loading = isLoading || (isFetching && data === undefined)
  const stale = Boolean(error && data)
  const archive = readArchiveSummary(data?.last_archive)

  function openEdit() {
    setDays(String(data?.audit_retention_days ?? 0))
    setMessage(null)
    setEditing(true)
  }

  async function submit() {
    if (busyRef.current) return
    if (stale) {
      setMessage('设置状态不是最新，请关闭弹窗并刷新后重试')
      return
    }
    if (isFetching) {
      setMessage('正在刷新设置，请稍后重试')
      return
    }
    const problem = retentionDaysProblem(days)
    if (problem) {
      setMessage(problem)
      return
    }
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    try {
      const next = await updateAuditRetention(orgId, Number(days.trim()))
      dispatch(panelApi.util.updateQueryData('getAuditRetention', orgId, () => next))
      Toast.success('审计保留设置已保存')
      setEditing(false)
    } catch (err) {
      setMessage(settingsError(err, 'retention'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card" data-testid="retention-card">
        <div className="card-head">
          <div className="card-title">
            审计保留
            <span className="hint">0 表示永久保留</span>
          </div>
          <div className="hstack" style={{ gap: 8 }}>
            <button
              className="btn borderless sm"
              type="button"
              disabled={isFetching || busy}
              onClick={() => void refetch()}
            >
              刷新
            </button>
            <button
              className="btn outline sm"
              type="button"
              disabled={!data || busy || isFetching || stale}
              onClick={openEdit}
            >
              编辑
            </button>
          </div>
        </div>
        <div className="card-body">
          {error ? (
            <div className={`banner ${data ? 'warning' : 'danger'} mb-14`}>
              <div>
                {settingsError(error, 'retention')}
                {data ? '（当前展示的是上次结果）' : ''}
              </div>
              {!data ? (
                <button className="btn tertiary sm" type="button" onClick={() => void refetch()}>
                  重试
                </button>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="help" role="status">
              正在加载审计保留…
            </div>
          ) : !data ? (
            <div className="help">审计保留不可用。</div>
          ) : (
            <>
              <div className="desc">
                <div className="help">当前策略</div>
                <div data-testid="retention-value" aria-live="polite">
                  {data.audit_retention_days === 0
                    ? '永久保留'
                    : `保留 ${data.audit_retention_days} 天`}
                </div>
              </div>
              <div className="desc" style={{ marginTop: 10 }}>
                <div className="help">最近归档</div>
                {archive.kind === 'none' ? (
                  <div>尚未归档</div>
                ) : archive.kind === 'invalid' ? (
                  <div className="help err">归档摘要不可读</div>
                ) : (
                  <div>
                    <div>
                      {formatTime(archive.at)} · {archive.rows} 行
                    </div>
                    <div className="mono cell-wrap" style={{ wordBreak: 'break-all' }}>
                      {archive.path}
                    </div>
                  </div>
                )}
              </div>
              <div className="help" style={{ marginTop: 10 }}>
                保留策略由定时归档任务执行，保存后不会立即删除；归档摘要只读。
              </div>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <Modal
          title="修改审计保留"
          onClose={() => {
            if (!busy) {
              setEditing(false)
              setMessage(null)
            }
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false)
                  setMessage(null)
                }}
              >
                取消
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </>
          }
        >
          {message ? (
            <div className="banner danger mb-14" role="alert">
              <div>{message}</div>
            </div>
          ) : null}
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>保留天数只影响后续定时归档/清理，不会立即删除已有审计记录。</div>
          </div>
          <div className="field">
            <label className="form-label" htmlFor="retention-days">
              保留天数
            </label>
            <div className="input">
              <input
                id="retention-days"
                inputMode="numeric"
                aria-describedby="retention-days-help"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
            <div className="help" id="retention-days-help">
              0 = 永久保留；范围 0–3650 天。
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
