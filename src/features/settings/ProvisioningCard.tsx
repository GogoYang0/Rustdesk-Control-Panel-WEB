import { Toast } from '@douyinfe/semi-ui'
import { useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import { updateProvisioning } from '../../lib/api'
import { provisioningStateLabel, provisioningStateTone, settingsError } from '../../lib/settings'
import type { AppDispatch } from '../../store'
import { panelApi, useGetProvisioningQuery } from '../../store/api'

type Action = 'enable' | 'disable' | 'cleanup' | null

const ACTION_COPY: Record<
  Exclude<Action, null>,
  { title: string; body: string; confirm: string }
> = {
  enable: {
    title: '启用服务器供应',
    body: '启用只记录意图并加入异步部署队列；容器部署需要时间，状态会先显示「等待部署」或「部署中」，本页不会自动轮询。',
    confirm: '启用',
  },
  disable: {
    title: '关闭服务器供应',
    body: '关闭会同步停止该组织的 hbbs/hbbr 容器并下线。若有在途部署或清理未确认，页面会显示「待清理」，可稍后重试清理。',
    confirm: '关闭',
  },
  cleanup: {
    title: '重试清理',
    body: '该组织已关闭，但仍有遗留部署行。再次关闭会重试清理，不会重新启用供应。',
    confirm: '重试清理',
  },
}

export default function ProvisioningCard({ orgId }: { orgId: number }) {
  const dispatch = useDispatch<AppDispatch>()
  const { data, isLoading, isFetching, error, refetch } = useGetProvisioningQuery(orgId)
  const [action, setAction] = useState<Action>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState<string | null>(null)
  const loading = isLoading || (isFetching && data === undefined)
  const stale = Boolean(error && data)

  async function submit() {
    if (!action || busyRef.current) return
    if (stale) {
      setMessage('设置状态不是最新，请关闭弹窗并刷新后重试')
      return
    }
    if (isFetching) {
      setMessage('正在刷新设置，请稍后重试')
      return
    }
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    try {
      const next = action === 'enable'
      const state = await updateProvisioning(orgId, next)
      dispatch(panelApi.util.updateQueryData('getProvisioning', orgId, () => state))
      Toast.success(
        action === 'cleanup' ? '已请求重试清理' : next ? '已提交供应启用请求' : '供应已关闭',
      )
      setAction(null)
    } catch (err) {
      setMessage(settingsError(err, 'provisioning'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card" data-testid="provisioning-card">
        <div className="card-head">
          <div className="card-title">
            服务器供应
            <span className="hint">启用异步部署，关闭同步下线</span>
          </div>
          <div className="hstack" style={{ gap: 8 }}>
            {data ? (
              <span
                className={`tag ${provisioningStateTone(data.state)}`}
                data-testid="provisioning-state"
              >
                {provisioningStateLabel(data.state)}
              </span>
            ) : null}
            <button
              className="btn borderless sm"
              type="button"
              disabled={isFetching || busy}
              onClick={() => void refetch()}
            >
              刷新
            </button>
          </div>
        </div>
        <div className="card-body">
          {error ? (
            <div className={`banner ${data ? 'warning' : 'danger'} mb-14`}>
              <div>
                {settingsError(error, 'provisioning')}
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
              正在加载供应状态…
            </div>
          ) : !data ? (
            <div className="help">供应状态不可用。</div>
          ) : (
            <>
              <div className="hstack" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="help">允许该组织供应独立服务器</div>
                  <div className="help" aria-live="polite">
                    状态：{provisioningStateLabel(data.state)}
                  </div>
                </div>
                <button
                  className={`btn ${data.enabled ? 'primary' : 'outline'} sm`}
                  type="button"
                  role="switch"
                  aria-checked={data.enabled}
                  aria-label="允许服务器供应"
                  disabled={busy || isFetching || stale}
                  onClick={() => {
                    setMessage(null)
                    setAction(data.enabled ? 'disable' : 'enable')
                  }}
                >
                  {data.enabled ? '已启用' : '未启用'}
                </button>
              </div>

              {data.enabled && data.state === 'failed' ? (
                <div className="banner danger" style={{ marginTop: 12 }}>
                  <div>部署失败，需要管理员在部署侧查看日志并人工恢复；本页不提供自动重试。</div>
                </div>
              ) : null}
              {data.enabled && (data.state === 'pending' || data.state === 'provisioning') ? (
                <div className="help" style={{ marginTop: 10 }}>
                  异步部署中；本页不自动轮询，可点「刷新」查看最新状态。
                </div>
              ) : null}
              {data.cleanup_pending ? (
                <div className="banner warning" style={{ marginTop: 12 }}>
                  <div>
                    存在待清理的部署行；关闭状态尚未完全收尾。
                    {!data.enabled ? ' 可再次关闭以重试清理。' : ''}
                  </div>
                  {!data.enabled ? (
                    <button
                      className="btn tertiary sm"
                      type="button"
                      disabled={busy || isFetching || stale}
                      onClick={() => {
                        setMessage(null)
                        setAction('cleanup')
                      }}
                    >
                      重试清理
                    </button>
                  ) : null}
                </div>
              ) : null}
              {!data.enabled && !data.cleanup_pending ? (
                <div className="help" style={{ marginTop: 10 }}>
                  供应已关闭，未发现遗留部署行。
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {action ? (
        <Modal
          title={ACTION_COPY[action].title}
          onClose={() => {
            if (!busy) {
              setAction(null)
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
                  setAction(null)
                  setMessage(null)
                }}
              >
                取消
              </button>
              <button
                className={action === 'enable' ? 'btn primary' : 'btn danger'}
                type="button"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? '处理中…' : ACTION_COPY[action].confirm}
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
            <div>{ACTION_COPY[action].body}</div>
          </div>
        </Modal>
      ) : null}
    </>
  )
}
