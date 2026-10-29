import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useMemo, useRef, useState } from 'react'

import type { Device, DeviceGroup } from '../../lib/api'
import { accessError, deviceGroupOwnership, diffIds, sameIdSet } from '../../lib/access-control'
import { formatTime } from '../../lib/format'
import {
  useCreateDeviceGroupMutation,
  useDeleteDeviceGroupMutation,
  useGetAllDevicesQuery,
  useGetDeviceGroupsQuery,
  useRenameDeviceGroupMutation,
  useReplaceDeviceGroupDevicesMutation,
} from '../../store/api'
import { ConfirmDelete } from '../addressbooks/AddressBookDialogs'
import { ErrorBanner, GroupNameDialog, SaveDialog } from './AccessDialogs'

export default function DeviceGroupsTab({ orgId }: { orgId: number }) {
  const {
    currentData: groups,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetDeviceGroupsQuery(orgId)
  const [createGroup] = useCreateDeviceGroupMutation()
  const [renameGroup] = useRenameDeviceGroupMutation()
  const [removeGroup, removeState] = useDeleteDeviceGroupMutation()

  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<DeviceGroup | null>(null)
  const [editingDevices, setEditingDevices] = useState<DeviceGroup | null>(null)
  const [deleting, setDeleting] = useState<DeviceGroup | null>(null)

  const loadingCurrent = isLoading || (isFetching && groups === undefined)

  async function confirmDelete() {
    if (!deleting) return
    try {
      const result = await removeGroup({ orgId, groupId: deleting.id }).unwrap()
      Toast.success(
        `已删除「${deleting.name}」：${result.ungrouped_devices} 台设备变为未分组，移除 ${result.removed_rules} 条规则`,
      )
      setDeleting(null)
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        Toast.error('该设备组已不存在，列表已刷新')
        setDeleting(null)
        void refetch()
      } else {
        Toast.error(accessError(err))
      }
    }
  }

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div className="card-title">
            设备组<span className="hint">一台设备最多属于一个组；删除组会释放设备</span>
          </div>
          <button
            className="btn primary sm"
            type="button"
            disabled={!groups}
            onClick={() => setCreating(true)}
          >
            新建设备组
          </button>
        </div>

        {error ? (
          <div className="card-body">
            <Banner
              type="danger"
              closeIcon={null}
              description={`加载设备组失败：${accessError(error)}`}
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

        {!error || groups ? (
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载设备组…
              </div>
            ) : (groups ?? []).length === 0 ? (
              <Empty title="还没有设备组" description="新建设备组后即可按组配置访问规则" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th style={{ width: 100 }}>设备</th>
                    <th style={{ width: 180 }}>组策略</th>
                    <th style={{ width: 160 }}>更新时间</th>
                    <th style={{ width: 210 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(groups ?? []).map((group) => (
                    <tr key={group.id}>
                      <td className="cell-wrap">{group.name}</td>
                      <td className="mono">{group.device_ids.length}</td>
                      <td>
                        {group.strategy_id == null ? (
                          <span className="help">未分配</span>
                        ) : (
                          <span className="tag grey" title="客户端策略分配在后续策略波次管理">
                            策略 #{group.strategy_id}
                          </span>
                        )}
                      </td>
                      <td className="mono">{formatTime(group.updated_at)}</td>
                      <td>
                        <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="btn borderless sm"
                            type="button"
                            onClick={() => setEditingDevices(group)}
                          >
                            设备
                          </button>
                          <button
                            className="btn borderless sm"
                            type="button"
                            onClick={() => setRenaming(group)}
                          >
                            重命名
                          </button>
                          <button
                            className="btn borderless sm"
                            type="button"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setDeleting(group)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>

      <p className="help" style={{ marginTop: 12 }}>
        规则只对未停用设备生效；设备移入本组时会从原组移出，删除设备组不会删除设备。
      </p>

      {creating ? (
        <GroupNameDialog
          title="新建设备组"
          label="设备组名称"
          kind="device"
          groups={groups ?? []}
          onSave={async (name) => {
            await createGroup({ orgId, name }).unwrap()
            Toast.success('设备组已创建')
          }}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {renaming ? (
        <GroupNameDialog
          title="重命名设备组"
          label="设备组名称"
          kind="device"
          initial={renaming.name}
          groups={groups ?? []}
          exceptId={renaming.id}
          onSave={async (name) => {
            await renameGroup({ orgId, groupId: renaming.id, name }).unwrap()
            Toast.success('设备组已重命名')
          }}
          onClose={() => setRenaming(null)}
        />
      ) : null}

      {editingDevices ? (
        <DevicesDialog
          key={`${orgId}-${editingDevices.id}`}
          orgId={orgId}
          group={editingDevices}
          onClose={() => setEditingDevices(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDelete
          title="删除设备组"
          confirmLabel="删除"
          busy={removeState.isLoading}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          body={
            <>
              删除「{deleting.name}」会把组内设备变为未分组，并删除以该组为目标的访问规则
              {deleting.strategy_id == null ? '；' : '，同时解除组层客户端策略；'}
              该操作不可恢复。
            </>
          }
        />
      ) : null}
    </>
  )
}

function DevicesDialog({
  orgId,
  group,
  onClose,
}: {
  orgId: number
  group: DeviceGroup
  onClose: () => void
}) {
  const baseline = useRef<number[]>([...group.device_ids])
  const [selected, setSelected] = useState(() => new Set(group.device_ids))
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const {
    currentData: all,
    isLoading,
    error: devicesError,
    refetch: refetchDevices,
  } = useGetAllDevicesQuery(orgId)
  const { currentData: groups, refetch: refetchGroups } = useGetDeviceGroupsQuery(orgId)
  const [replace, replaceState] = useReplaceDeviceGroupDevicesMutation()

  const ownership = useMemo(() => deviceGroupOwnership(groups ?? []), [groups])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const items = all?.items ?? []
    if (!term) return items
    return items.filter(
      (device) =>
        device.rustdesk_id.toLowerCase().includes(term) || device.name.toLowerCase().includes(term),
    )
  }, [all, search])

  const change = diffIds(baseline.current, [...selected])
  const truncated = all?.truncated ?? false

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const latest = await refetchGroups().unwrap()
      const current = latest.find((item) => item.id === group.id)
      if (!current) {
        Toast.error('该设备组已不存在，列表已刷新')
        onClose()
        return
      }
      if (!sameIdSet(current.device_ids, baseline.current)) {
        setError('该设备组成员已被其他人修改，请关闭后重新打开')
        return
      }
      const result = await replace({
        orgId,
        groupId: group.id,
        deviceIds: [...selected],
      }).unwrap()
      Toast.success(`设备已更新：移入 ${result.added} 台，移出 ${result.removed} 台`)
      onClose()
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        Toast.error('该设备组已不存在，列表已刷新')
        onClose()
        void refetchGroups()
        return
      }
      setError(accessError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SaveDialog
      title={`编辑设备 · ${group.name}`}
      busy={replaceState.isLoading || isLoading || saving}
      saveDisabled={isLoading || truncated || Boolean(devicesError) || saving}
      onClose={onClose}
      onSave={() => void save()}
    >
      <ErrorBanner message={error} />

      {truncated ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>
            组织共有 {all?.total ?? 0} 台设备，超过页面 2000 台上限；为避免误删，暂不允许在此改组。
          </div>
        </div>
      ) : null}

      <div className="field mb-14">
        <div className="input">
          <input
            value={search}
            placeholder="搜索 RustDesk ID 或名称"
            aria-label="搜索设备"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="help mb-14">
        已选 {selected.size} 台 · 本次移入 {change.added}、移出 {change.removed}
        。保存以当前勾选集合全量替换； 选中其他组的设备会从原组移入。
      </div>

      {devicesError ? (
        <div>
          <Banner
            type="danger"
            closeIcon={null}
            description={`加载设备失败：${accessError(devicesError)}`}
          />
          <button
            className="btn outline sm"
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => void refetchDevices()}
          >
            重试
          </button>
        </div>
      ) : isLoading ? (
        <div className="help" role="status">
          正在加载设备…
        </div>
      ) : filtered.length === 0 ? (
        <div className="help">没有匹配的设备</div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              checked={selected.has(device.id)}
              currentGroup={ownership.get(device.id)}
              targetGroupId={group.id}
              onChange={(checked) => {
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (checked) next.add(device.id)
                  else next.delete(device.id)
                  return next
                })
              }}
            />
          ))}
        </div>
      )}
    </SaveDialog>
  )
}

function DeviceRow({
  device,
  checked,
  currentGroup,
  targetGroupId,
  onChange,
}: {
  device: Device
  checked: boolean
  currentGroup?: { id: number; name: string }
  targetGroupId: number
  onChange: (checked: boolean) => void
}) {
  const moving = checked && currentGroup != null && currentGroup.id !== targetGroupId
  const released = !checked && currentGroup?.id === targetGroupId
  return (
    <label className="check" style={{ display: 'flex', margin: '6px 0', gap: 7 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="mono">{device.rustdesk_id}</span>
      <span className="cell-wrap">{device.name}</span>
      {device.disabled ? <span className="tag grey">停用</span> : null}
      {moving ? <span className="tag orange">从 {currentGroup.name} 移入</span> : null}
      {released ? <span className="tag red">保存后移出本组</span> : null}
    </label>
  )
}
