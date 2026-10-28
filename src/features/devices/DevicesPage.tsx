import { Banner, Empty } from '@douyinfe/semi-ui'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import SideSheet from '../../components/SideSheet'
import { formatTime } from '../../lib/format'
import {
  DEFAULT_DEVICE_FILTERS,
  DEVICE_PAGE_SIZE,
  DEVICE_Q_MAX,
  parseDeviceFilters,
  toDeviceRequestQuery,
  toDeviceSearchParams,
  type DeviceFilters,
} from '../../lib/device-query'
import type { Device } from '../../lib/api'
import { totalPages } from '../../lib/paging'
import { useGetDevicePageQuery, useGetMeQuery, useGetMembersQuery } from '../../store/api'
import {
  NoteDialog,
  OwnerDialog,
  ReasonDialog,
  RegisterDialog,
  ToggleDeviceDialog,
} from './DeviceDialogs'

type Dialog =
  | { kind: 'register' }
  | { kind: 'toggle'; device: Device }
  | { kind: 'owner'; device: Device }
  | { kind: 'note'; device: Device }
  | { kind: 'rebind'; device: Device }
  | { kind: 'disconnect'; device: Device }
  | null

export default function DevicesPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const [searchParams, setSearchParams] = useSearchParams()

  // Decided during render, before any effect runs: the render that changes
  // organization still carries the previous organization's filters in the URL.
  const previousOrg = useRef(id)
  const orgChanged = previousOrg.current !== id
  const filters = parseDeviceFilters(searchParams)
  const effectiveFilters = orgChanged ? DEFAULT_DEVICE_FILTERS : filters
  const { q, bound, page } = effectiveFilters

  const queryString = useMemo(
    () => toDeviceRequestQuery({ q, bound, page }).toString(),
    [q, bound, page],
  )

  const {
    currentData: data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetDevicePageQuery({ orgId: id, queryString }, { skip: !id })
  const loadingCurrent = isLoading || (isFetching && data === undefined)

  const { data: me } = useGetMeQuery()
  const { data: members, isSuccess: membersReady } = useGetMembersQuery(id, { skip: !id })
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canWrite = perms.has('device.write')
  const canDisconnect = perms.has('device.disconnect')

  const [keyword, setKeyword] = useState(filters.q)
  useEffect(() => {
    setKeyword(filters.q)
  }, [filters.q])

  const [selected, setSelected] = useState<Device | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  // The effects below clear these after the switching render; until then the
  // previous organization's overlay must not paint with the new orgId.
  const activeSelected = orgChanged ? null : selected
  const activeDialog = orgChanged ? null : dialog
  // A result that lands after the scope moved must not close the new dialog or
  // keep a stale sheet open.
  const scopeRef = useRef(id)
  useLayoutEffect(() => {
    scopeRef.current = id
  }, [id])

  useEffect(() => {
    if (!orgChanged) return
    previousOrg.current = id
    setSelected(null)
    setDialog(null)
    if (searchParams.toString()) setSearchParams(new URLSearchParams(), { replace: true })
  }, [id, orgChanged, searchParams, setSearchParams])

  const change = useCallback(
    (patch: Partial<DeviceFilters>) => {
      setSearchParams(toDeviceSearchParams({ ...filters, ...patch, page: patch.page ?? 1 }), {
        replace: true,
      })
    },
    [filters, setSearchParams],
  )

  const devices = data?.items ?? []
  const total = data?.total ?? 0
  const pages = totalPages(total, data?.page_size ?? DEVICE_PAGE_SIZE)

  useEffect(() => {
    if (orgChanged) return
    if (data && page > pages) change({ page: pages })
  }, [orgChanged, data, page, pages, change])

  function afterWrite() {
    if (scopeRef.current !== id) return
    setDialog(null)
    setSelected(null)
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">设备</h1>
          <div className="page-sub">
            共 {total} 台 · 在线状态来自最近心跳；绑定由客户端认领决定，重置后需重新认领
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn primary sm"
            type="button"
            disabled={!canWrite}
            title={canWrite ? '登记设备' : '需要 device.write 权限'}
            onClick={() => setDialog({ kind: 'register' })}
          >
            登记设备
          </button>
        </div>
      </div>

      {!canWrite ? (
        <div className="banner info mb-14">
          <div>
            <b>当前为只读视图。</b>查看设备需要 <code>device.read</code>；登记、停用、归属、备注与
            绑定重置需要 <code>device.write</code>，断连请求需要 <code>device.disconnect</code>。
          </div>
        </div>
      ) : null}

      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          change({ q: keyword.trim() })
        }}
      >
        <div className="input" style={{ width: 260 }}>
          <input
            value={keyword}
            maxLength={DEVICE_Q_MAX}
            placeholder="搜索名称或 RustDesk ID"
            aria-label="搜索设备"
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <button className="btn outline sm" type="submit">
          查询
        </button>
        <select
          className="select-native"
          aria-label="绑定状态"
          value={bound}
          onChange={(event) => change({ bound: event.target.value as DeviceFilters['bound'] })}
        >
          <option value="">全部绑定状态</option>
          <option value="true">已绑定</option>
          <option value="false">未绑定</option>
        </select>
        <div className="spacer" />
        <span className="help">按 id 升序，{DEVICE_PAGE_SIZE} 台/页</span>
      </form>

      {error ? (
        <div style={{ marginBottom: 14 }}>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载设备失败：${(error as { message?: string }).message ?? '未知错误'}${
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

      {error && !data ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载设备…
              </div>
            ) : devices.length === 0 ? (
              <Empty title="没有符合条件的设备" description="调整关键词或绑定状态后再试">
                {q || bound || page > 1 ? (
                  <button
                    className="btn outline sm"
                    type="button"
                    onClick={() => {
                      setKeyword('')
                      setSearchParams(new URLSearchParams(), { replace: true })
                    }}
                  >
                    清除筛选
                  </button>
                ) : null}
              </Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>设备</th>
                    <th style={{ width: 90 }}>在线</th>
                    <th style={{ width: 90 }}>绑定</th>
                    <th style={{ width: 90 }}>停用</th>
                    <th style={{ width: 190 }}>归属</th>
                    <th style={{ width: 150 }}>最近心跳</th>
                    <th style={{ width: 160 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>
                        <div style={{ fontSize: 13 }}>{device.name}</div>
                        <div className="mono help">{device.rustdesk_id}</div>
                      </td>
                      <td>
                        <span className="hstack" style={{ gap: 6 }}>
                          <span
                            className={device.status === 'online' ? 'online-dot' : 'offline-dot'}
                          />
                          {device.status === 'online' ? '在线' : '离线'}
                        </span>
                      </td>
                      <td>
                        <span className={`tag ${device.bound ? 'green' : 'orange'}`}>
                          {device.bound ? '已绑定' : '未绑定'}
                        </span>
                      </td>
                      <td>
                        <span className={`tag ${device.disabled ? 'red' : 'grey'}`}>
                          {device.disabled ? '已停用' : '正常'}
                        </span>
                      </td>
                      <td className="cell-wrap">{device.owner_email ?? '—'}</td>
                      <td className="mono">{formatTime(device.last_seen_at)}</td>
                      <td>
                        <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="btn borderless sm"
                            type="button"
                            onClick={() => setSelected(device)}
                          >
                            详情
                          </button>
                          <button
                            className="btn borderless sm"
                            type="button"
                            style={device.disabled ? undefined : { color: 'var(--danger)' }}
                            disabled={!canWrite}
                            title={canWrite ? undefined : '需要 device.write 权限'}
                            onClick={() => setDialog({ kind: 'toggle', device })}
                          >
                            {device.disabled ? '恢复' : '停用'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {total > 0 ? (
              <div className="pager" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <span className="total">
                  共 {total} 台 · 第 {page} / {pages} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page <= 1}
                  aria-label="上一页"
                  onClick={() => change({ page: page - 1 })}
                >
                  ‹
                </button>
                <span className="pg on" aria-current="page">
                  {page}
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={page >= pages}
                  aria-label="下一页"
                  onClick={() => change({ page: page + 1 })}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        停用会拒绝新的认领、compat 登录与心跳，并在同一事务撤销该设备的活跃 compat
        会话；绑定重置让旧客户端立即失去驱动能力；断连请求由客户端下次心跳消费，不是即时断线。
      </p>

      {activeSelected ? (
        <DeviceSheet
          key={`${id}-${activeSelected.id}`}
          device={activeSelected}
          canWrite={canWrite}
          canDisconnect={canDisconnect}
          membersReady={membersReady}
          onClose={() => setSelected(null)}
          onAction={(kind) => {
            // Stacking a dialog over the sheet would put two focus traps and two
            // Escape handlers on the document; close the sheet first.
            setDialog({ kind, device: activeSelected })
            setSelected(null)
          }}
        />
      ) : null}

      {activeDialog?.kind === 'register' ? (
        <RegisterDialog orgId={id} onClose={() => setDialog(null)} onDone={afterWrite} />
      ) : null}
      {activeDialog?.kind === 'toggle' ? (
        <ToggleDeviceDialog
          orgId={id}
          device={activeDialog.device}
          onClose={() => setDialog(null)}
          onDone={afterWrite}
        />
      ) : null}
      {activeDialog?.kind === 'owner' && membersReady ? (
        <OwnerDialog
          orgId={id}
          device={activeDialog.device}
          members={(members ?? []).filter((member) => !member.disabled)}
          onClose={() => setDialog(null)}
          onDone={afterWrite}
        />
      ) : null}
      {activeDialog?.kind === 'note' ? (
        <NoteDialog
          orgId={id}
          device={activeDialog.device}
          onClose={() => setDialog(null)}
          onDone={afterWrite}
        />
      ) : null}
      {activeDialog?.kind === 'rebind' ? (
        <ReasonDialog
          orgId={id}
          device={activeDialog.device}
          action="rebind"
          onClose={() => setDialog(null)}
          onDone={afterWrite}
        />
      ) : null}
      {activeDialog?.kind === 'disconnect' ? (
        <ReasonDialog
          orgId={id}
          device={activeDialog.device}
          action="disconnect"
          onClose={() => setDialog(null)}
          onDone={afterWrite}
        />
      ) : null}
    </section>
  )
}

function DeviceSheet({
  device,
  canWrite,
  canDisconnect,
  membersReady,
  onClose,
  onAction,
}: {
  device: Device
  canWrite: boolean
  canDisconnect: boolean
  membersReady: boolean
  onClose: () => void
  onAction: (kind: 'toggle' | 'owner' | 'note' | 'rebind' | 'disconnect') => void
}) {
  return (
    <SideSheet title={`设备 #${device.id}`} onClose={onClose}>
      <dl className="desc">
        <dt>名称</dt>
        <dd>{device.name}</dd>
        <dt>RustDesk ID</dt>
        <dd className="mono">{device.rustdesk_id}</dd>
        <dt>在线</dt>
        <dd>
          <span className="hstack" style={{ gap: 6 }}>
            <span className={device.status === 'online' ? 'online-dot' : 'offline-dot'} />
            {device.status === 'online' ? '在线' : '离线'}
          </span>
        </dd>
        <dt>绑定</dt>
        <dd>
          <span className={`tag ${device.bound ? 'green' : 'orange'}`}>
            {device.bound ? '已绑定' : '未绑定'}
          </span>
        </dd>
        <dt>停用</dt>
        <dd>
          <span className={`tag ${device.disabled ? 'red' : 'grey'}`}>
            {device.disabled ? '已停用' : '正常'}
          </span>
        </dd>
        <dt>归属</dt>
        <dd>{device.owner_email ?? '—'}</dd>
        <dt>最近心跳</dt>
        <dd className="mono">{formatTime(device.last_seen_at)}</dd>
        <dt>设备组</dt>
        <dd className="mono">
          {device.device_group_id ? `#${device.device_group_id}` : '—'}
          <span className="help"> （访问控制波次接入）</span>
        </dd>
        <dt>策略</dt>
        <dd className="mono">
          {device.strategy_id ? `#${device.strategy_id}` : '—'}
          <span className="help"> （策略波次接入）</span>
        </dd>
        <dt>备注</dt>
        <dd className="cell-wrap">{device.note || '—'}</dd>
      </dl>

      <div className="row-end" style={{ flexWrap: 'wrap' }}>
        <button
          className="btn outline sm"
          type="button"
          disabled={!canWrite}
          title={canWrite ? undefined : '需要 device.write 权限'}
          onClick={() => onAction('toggle')}
        >
          {device.disabled ? '恢复设备' : '停用设备'}
        </button>
        <button
          className="btn outline sm"
          type="button"
          disabled={!canWrite || !membersReady}
          title={
            !canWrite
              ? '需要 device.write 权限'
              : !membersReady
                ? '成员列表未就绪（加载中或加载失败）：暂不能改归属'
                : undefined
          }
          onClick={() => onAction('owner')}
        >
          归属
        </button>
        <button
          className="btn outline sm"
          type="button"
          disabled={!canWrite}
          title={canWrite ? undefined : '需要 device.write 权限'}
          onClick={() => onAction('note')}
        >
          备注
        </button>
        <button
          className="btn outline sm"
          type="button"
          disabled={!canWrite}
          title={canWrite ? undefined : '需要 device.write 权限'}
          onClick={() => onAction('rebind')}
        >
          重置绑定
        </button>
        <button
          className="btn danger sm"
          type="button"
          disabled={!canDisconnect || device.status === 'offline'}
          title={
            !canDisconnect
              ? '需要 device.disconnect 权限'
              : device.status === 'offline'
                ? '设备当前离线：请求会保持 pending，直到 15 分钟过期'
                : undefined
          }
          onClick={() => onAction('disconnect')}
        >
          断连请求
        </button>
      </div>
    </SideSheet>
  )
}
