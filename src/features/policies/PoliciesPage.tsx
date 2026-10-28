import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import Modal from '../../components/Modal'
import type { Policy } from '../../lib/api'
import { policyWriteError } from '../../lib/policy-errors'
import { currentOffsetEast, formatOffset, windowLabel, withEnabled } from '../../lib/policy-form'
import {
  useDeletePolicyMutation,
  useGetMeQuery,
  useGetPoliciesQuery,
  useUpdatePolicyMutation,
} from '../../store/api'
import PolicyDialog from './PolicyDialog'

type OverlayBody =
  { kind: 'create' } | { kind: 'edit'; policy: Policy } | { kind: 'delete'; policy: Policy }

type Overlay = (OverlayBody & { token: number; generation: number }) | null

export default function PoliciesPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetPoliciesQuery(id, { skip: !id })
  const loadingCurrent = isLoading || (isFetching && data === undefined)
  const policies = data ?? []

  const offset = currentOffsetEast()
  const { data: me } = useGetMeQuery()
  const perms = useMemo(() => {
    const current = me?.orgs.find((org) => org.id === id)
    return new Set(current?.permissions ?? [])
  }, [me, id])
  const canWrite = perms.has('policy.write')

  // The render that changes organization still shows the previous org's state;
  // overlays and late callbacks are tied to the scope they were opened in.
  const scopeRef = useRef(id)
  const orgChanged = scopeRef.current !== id
  const generationRef = useRef(0)
  const overlaySeqRef = useRef(0)
  const overlayTokenRef = useRef(0)

  const [overlay, setOverlay] = useState<Overlay>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [update] = useUpdatePolicyMutation()

  useLayoutEffect(() => {
    if (scopeRef.current === id) return
    scopeRef.current = id
    // A→B→A returns to the same id; the generation still moves so a late
    // callback from the first visit cannot touch the second one.
    generationRef.current += 1
  }, [id])

  useEffect(() => {
    overlayTokenRef.current = 0
    setOverlay(null)
    setBusyId(null)
  }, [id])

  function openOverlay(next: OverlayBody) {
    overlaySeqRef.current += 1
    overlayTokenRef.current = overlaySeqRef.current
    setOverlay({
      ...next,
      token: overlaySeqRef.current,
      generation: generationRef.current,
    })
  }

  function closeOverlay(token: number) {
    if (overlayTokenRef.current !== token) return
    overlayTokenRef.current = 0
    setOverlay(null)
  }

  function finishOverlay(token: number, generation: number): boolean {
    if (overlayTokenRef.current !== token) return false
    if (generation !== generationRef.current || scopeRef.current !== id) return false
    overlayTokenRef.current = 0
    setOverlay(null)
    return true
  }

  async function toggle(policy: Policy) {
    if (busyId !== null || isFetching) return
    const scope = id
    const generation = generationRef.current
    setBusyId(policy.id)
    try {
      await update({
        orgId: scope,
        policyId: policy.id,
        input: withEnabled(policy, !policy.enabled),
      }).unwrap()
      if (generation !== generationRef.current || scopeRef.current !== scope) return
      Toast.success(policy.enabled ? `已停用 ${policy.name}` : `已启用 ${policy.name}`)
    } catch (err) {
      if (generation === generationRef.current && scopeRef.current === scope) {
        Toast.error(policyWriteError(err))
      }
    } finally {
      if (generation === generationRef.current && scopeRef.current === scope) setBusyId(null)
    }
  }

  // A full PUT built from a cached row would revert a just-saved edit if the
  // list has not refetched yet, so writes wait for the fresh list.
  const actionsDisabled = !canWrite || isFetching || busyId !== null
  const actionTitle = !canWrite
    ? '需要 policy.write 权限'
    : isFetching
      ? '列表刷新中，请稍候'
      : undefined
  const shown = orgChanged ? null : overlay

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">连接策略</h1>
          <div className="page-sub">
            共 {policies.length} 条 · 启用 {policies.filter((policy) => policy.enabled).length} 条
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={!canWrite}
            title={canWrite ? '新建策略' : '需要 policy.write 权限'}
            onClick={() => openOverlay({ kind: 'create' })}
          >
            新建策略
          </button>
        </div>
      </div>

      {!canWrite ? (
        <div className="banner info mb-14">
          <div>
            <b>当前为只读视图。</b>组织成员可以查看策略；新建、编辑、启停与删除需要{' '}
            <code>policy.write</code> 权限。
          </div>
        </div>
      ) : null}

      <div className="banner info mb-14">
        <div>
          多条启用策略同时生效，各维度取最严：并发与时长取最小、时段取交集、任一要求审批即需审批；
          <b>交集为空表示该时段完全禁止</b>。时间按浏览器本地时区（{formatOffset(offset)}）
          展示与编辑，服务端以 UTC 分钟存储。
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载策略失败：${(error as { message?: string }).message ?? '未知错误'}${
              data ? '（显示上次结果）' : ''
            }`}
          />
          <button
            className="btn outline sm"
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => void refetch()}
          >
            重试
          </button>
        </div>
      ) : null}

      {loadingCurrent ? (
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载策略…
            </div>
          </div>
        </div>
      ) : error && !data ? null : policies.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <Empty
              title="还没有连接策略"
              description="没有启用中的策略时，连接不受时段、并发与时长限制"
            >
              {canWrite ? (
                <button
                  className="btn primary sm"
                  type="button"
                  onClick={() => openOverlay({ kind: 'create' })}
                >
                  新建策略
                </button>
              ) : null}
            </Empty>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {policies.map((policy) => (
            <div className="card" key={policy.id}>
              <div className="card-head">
                <div className="card-title" style={{ minWidth: 0 }}>
                  <span className="cell-wrap">{policy.name}</span>
                  <span className="hint">#{policy.id}</span>
                </div>
                <span className={`tag ${policy.enabled ? 'green' : 'red'}`}>
                  {policy.enabled ? '启用中' : '已停用'}
                </span>
              </div>
              <div className="card-body">
                <dl className="desc" style={{ gridTemplateColumns: '84px 1fr' }}>
                  <dt>时段</dt>
                  <dd className="mono">
                    {windowLabel(policy.allowed_start_minute, policy.allowed_end_minute, offset)}
                  </dd>
                  <dt>并发上限</dt>
                  <dd>{policy.max_concurrent_sessions ?? '不限'}</dd>
                  <dt>时长上限</dt>
                  <dd>
                    {policy.max_session_minutes ? `${policy.max_session_minutes} 分钟` : '不限'}
                  </dd>
                  <dt>审批</dt>
                  <dd>
                    <span className={`tag ${policy.require_approval ? 'orange' : 'grey'}`}>
                      {policy.require_approval ? '需审批' : '直接放行'}
                    </span>
                  </dd>
                </dl>
                <div className="row-end">
                  <button
                    className="btn outline sm"
                    type="button"
                    disabled={actionsDisabled}
                    title={actionTitle}
                    onClick={() => openOverlay({ kind: 'edit', policy })}
                  >
                    编辑
                  </button>
                  <button
                    className="btn outline sm"
                    type="button"
                    disabled={actionsDisabled}
                    title={actionTitle}
                    onClick={() => void toggle(policy)}
                  >
                    {busyId === policy.id ? '处理中…' : policy.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    className="btn danger sm"
                    type="button"
                    disabled={actionsDisabled}
                    title={actionTitle}
                    onClick={() => openOverlay({ kind: 'delete', policy })}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        策略是面板侧的事前约束：票据签发与兑换时强制，原生直连无法事前阻断，只会产生告警。
        已签发的票据保留签发时的策略快照。
      </p>

      {shown && (shown.kind === 'create' || shown.kind === 'edit') ? (
        <PolicyDialog
          key={shown.kind === 'edit' ? `edit-${shown.policy.id}` : 'create'}
          orgId={id}
          policy={shown.kind === 'edit' ? shown.policy : undefined}
          onClose={() => closeOverlay(shown.token)}
          onDone={() => finishOverlay(shown.token, shown.generation)}
        />
      ) : null}

      {shown?.kind === 'delete' ? (
        <DeletePolicyDialog
          orgId={id}
          policy={shown.policy}
          onClose={() => closeOverlay(shown.token)}
          onDone={() => {
            if (finishOverlay(shown.token, shown.generation)) {
              Toast.success(`已删除 ${shown.policy.name}`)
            }
          }}
        />
      ) : null}
    </section>
  )
}

function DeletePolicyDialog({
  orgId,
  policy,
  onClose,
  onDone,
}: {
  orgId: number
  policy: Policy
  onClose: () => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [remove, { isLoading }] = useDeletePolicyMutation()

  async function submit() {
    setError(null)
    try {
      await remove({ orgId, policyId: policy.id }).unwrap()
      onDone()
    } catch (err) {
      setError(policyWriteError(err))
    }
  }

  return (
    <Modal
      title="删除策略"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button className="btn danger" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '删除中…' : '删除'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="banner warning" style={{ padding: '10px 12px' }}>
        <div>
          即将删除 <b>{policy.name}</b>。删除后该策略不再参与评估；
          <b>已签发的票据保留签发时的策略快照</b>，历史会话与告警不受影响。此操作不可撤销。
        </div>
      </div>
    </Modal>
  )
}
