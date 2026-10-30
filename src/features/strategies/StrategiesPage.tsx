import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import Modal from '../../components/Modal'
import StateBlock from '../../components/StateBlock'
import type { Strategy } from '../../lib/api'
import { formatTime } from '../../lib/format'
import { strategyDeleteWarning, strategyError, strategyKeyCount } from '../../lib/strategy'
import { useDeleteStrategyMutation, useGetMeQuery, useGetStrategiesQuery } from '../../store/api'
import StrategyAssignments from './StrategyAssignments'
import StrategyEditor from './StrategyEditor'

export default function StrategiesPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canManage = perms.has('strategy.manage')
  const validId = Number.isSafeInteger(id) && id > 0

  const {
    currentData: strategies,
    isLoading,
    error,
    refetch,
  } = useGetStrategiesQuery(id, { skip: !validId || !canManage })
  const [remove] = useDeleteStrategyMutation()
  const [editing, setEditing] = useState<{ strategy?: Strategy } | null>(null)
  const [deleting, setDeleting] = useState<Strategy | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setEditing(null)
    setDeleting(null)
    setBusy(false)
    setDeleteError(null)
  }, [id])

  if (!validId) {
    return <StateBlock code="404" title="组织不存在" description="组织 id 不合法。" />
  }
  if (meLoading) {
    return (
      <section className="page on">
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载权限…
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
        title="没有客户端策略管理权限"
        description="无法确认当前组织与权限，请重新登录或联系管理员。"
      />
    )
  }
  if (!canManage) {
    return (
      <StateBlock
        code="403"
        title="没有客户端策略管理权限"
        description="当前角色没有 strategy.manage；该权限只由 owner/admin 持有，且不可委派。"
      />
    )
  }

  const list = strategies ?? []

  async function removeStrategy() {
    if (!deleting || busy) return
    setBusy(true)
    setDeleteError(null)
    try {
      await remove({ orgId: id, strategyId: deleting.id }).unwrap()
      setDeleting(null)
      Toast.success('客户端策略已删除')
    } catch (err) {
      setDeleteError(strategyError(err, 'delete'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">客户端策略</h1>
          <div className="page-sub">
            20 键白名单 · 三层分配（设备 &gt; 设备组 &gt; 成员） · 心跳拉取式生效（≤30 秒）
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={isLoading && !strategies}
            onClick={() => setEditing({})}
          >
            新建策略
          </button>
        </div>
      </div>

      <div className="banner info mb-14">
        <div>
          <b>策略是配置下发，不是授权。</b>
          它改变被控端客户端选项（音频、剪贴板、文件传输等），与访问控制/控制角色是三件事。网络类键
          （api-server、relay-server、key 等）不在白名单，防止设备被改指向或重新配钥。
        </div>
      </div>

      {error ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载客户端策略失败。</b>
            {strategyError(error, 'strategies')}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {error && list.length === 0 ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {isLoading && !strategies ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载客户端策略…
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th style={{ width: 80 }}>启用</th>
                    <th style={{ width: 70 }}>键数</th>
                    <th style={{ width: 90 }}>版本</th>
                    <th style={{ width: 150 }}>更新时间</th>
                    <th style={{ width: 120 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((strategy) => (
                    <tr key={strategy.id}>
                      <td className="cell-wrap">{strategy.name}</td>
                      <td>
                        {strategy.enabled ? (
                          <span className="tag green">启用</span>
                        ) : (
                          <span className="tag grey">停用</span>
                        )}
                      </td>
                      <td className="mono">{strategyKeyCount(strategy.config_options)}</td>
                      <td className="mono">{strategy.version}</td>
                      <td className="mono">{formatTime(strategy.updated_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn borderless sm"
                          type="button"
                          onClick={() => setEditing({ strategy })}
                        >
                          编辑
                        </button>
                        <button
                          className="btn danger sm"
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setDeleting(strategy)
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <StrategyAssignments orgId={id} strategies={list} />

      {editing ? (
        <StrategyEditor
          orgId={id}
          strategy={editing.strategy}
          strategies={list}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        <Modal
          title={`删除客户端策略「${deleting.name}」`}
          onClose={() => {
            if (!busy) {
              setDeleting(null)
              setDeleteError(null)
            }
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setDeleting(null)
                  setDeleteError(null)
                }}
              >
                取消
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => void removeStrategy()}
              >
                {busy ? '删除中…' : '删除'}
              </button>
            </>
          }
        >
          <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
            <div>{strategyDeleteWarning()}</div>
          </div>
          {deleteError ? (
            <div className="banner danger" style={{ padding: '9px 11px' }}>
              <div>{deleteError}</div>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </section>
  )
}
