import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useMemo, useState } from 'react'

import { ApiError } from '../../lib/api'
import type { Strategy } from '../../lib/api'
import { STRATEGY_PRIORITY_COPY, strategyError } from '../../lib/strategy'
import { totalPages } from '../../lib/paging'
import {
  useAssignDeviceGroupStrategyMutation,
  useAssignDeviceStrategyMutation,
  useAssignMemberStrategyMutation,
  useGetDeviceGroupsQuery,
  useGetDevicePageQuery,
  useGetMembersQuery,
} from '../../store/api'

type AssignmentTab = 'members' | 'groups' | 'devices'

const TABS: { key: AssignmentTab; label: string }[] = [
  { key: 'members', label: '成员' },
  { key: 'groups', label: '设备组' },
  { key: 'devices', label: '设备' },
]

function StrategySelect({
  label,
  value,
  strategies,
  disabled,
  onChange,
}: {
  label: string
  value: string
  strategies: Strategy[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <select
      className="select-native"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">未分配</option>
      {strategies.map((strategy) => (
        <option key={strategy.id} value={String(strategy.id)}>
          {strategy.name}
          {strategy.enabled ? '' : '（已停用）'}
        </option>
      ))}
      {value !== '' && !strategies.some((strategy) => String(strategy.id) === value) ? (
        <option value={value}>策略 #{value}（不存在）</option>
      ) : null}
    </select>
  )
}

export default function StrategyAssignments({
  orgId,
  strategies,
  strategiesLoading,
  strategiesError,
  onRetryStrategies,
}: {
  orgId: number
  strategies: Strategy[]
  strategiesLoading: boolean
  strategiesError?: unknown
  onRetryStrategies: () => void
}) {
  const [tab, setTab] = useState<AssignmentTab>('members')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [assignMember] = useAssignMemberStrategyMutation()
  const [assignGroup] = useAssignDeviceGroupStrategyMutation()
  const [assignDevice] = useAssignDeviceStrategyMutation()
  const strategiesReady = !strategiesLoading && !strategiesError

  const {
    currentData: members,
    isLoading: membersLoading,
    isFetching: membersFetching,
    error: membersError,
    refetch: refetchMembers,
  } = useGetMembersQuery(orgId, { skip: tab !== 'members' })
  const {
    currentData: groups,
    isLoading: groupsLoading,
    isFetching: groupsFetching,
    error: groupsError,
    refetch: refetchGroups,
  } = useGetDeviceGroupsQuery(orgId, { skip: tab !== 'groups' })

  const [deviceQuery, setDeviceQuery] = useState('')
  const [deviceDraft, setDeviceDraft] = useState('')
  const [devicePage, setDevicePage] = useState(1)
  const deviceQueryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(devicePage), pageSize: '50' })
    if (deviceQuery) params.set('q', deviceQuery)
    return params.toString()
  }, [deviceQuery, devicePage])
  const {
    currentData: deviceData,
    isLoading: devicesLoading,
    isFetching: devicesFetching,
    error: devicesError,
    refetch: refetchDevices,
  } = useGetDevicePageQuery({ orgId, queryString: deviceQueryString }, { skip: tab !== 'devices' })

  async function save(kind: AssignmentTab, targetId: number, name: string, value: string) {
    if (busy) return
    const strategyId = value === '' ? null : Number(value)
    const key = `${kind}-${targetId}`
    setBusy(key)
    setError(null)
    try {
      if (kind === 'members') {
        await assignMember({ orgId, userId: targetId, strategyId }).unwrap()
      } else if (kind === 'groups') {
        await assignGroup({ orgId, groupId: targetId, strategyId }).unwrap()
      } else {
        await assignDevice({ orgId, deviceId: targetId, strategyId }).unwrap()
      }
      Toast.success(`${name} 的客户端策略已更新`)
    } catch (err) {
      setError(
        strategyError(
          err,
          kind === 'members'
            ? 'assign-member'
            : kind === 'groups'
              ? 'assign-group'
              : 'assign-device',
        ),
      )
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
        if (kind === 'members') void refetchMembers()
        else if (kind === 'groups') void refetchGroups()
        else void refetchDevices()
      }
    } finally {
      setBusy(null)
    }
  }

  const devicePageCount = totalPages(deviceData?.total ?? 0, deviceData?.page_size ?? 50)

  useEffect(() => {
    if (deviceData && devicePage > devicePageCount) setDevicePage(devicePageCount)
  }, [deviceData, devicePage, devicePageCount])

  function strategyValue(targetId: number | null | undefined) {
    return targetId == null ? '' : String(targetId)
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>
        三层分配
      </div>
      <div className="help mb-14">{STRATEGY_PRIORITY_COPY}</div>

      {strategiesError ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载策略字典失败。</b>
            {strategyError(strategiesError, 'strategies')}
          </div>
          <button className="btn outline sm" type="button" onClick={onRetryStrategies}>
            重试
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}

      <div className="tabs" role="tablist" aria-label="策略分配目标">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`strategy-assign-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={tab === item.key ? 'strategy-assign-panel' : undefined}
            className={`tab ${tab === item.key ? 'on' : ''}`}
            onClick={() => {
              setError(null)
              setTab(item.key)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="strategy-assign-panel" aria-labelledby={`strategy-assign-${tab}`}>
        {tab === 'members' ? (
          <>
            {membersError ? (
              <div className="banner danger mb-14">
                <div>
                  <b>加载成员失败。</b>
                  {strategyError(membersError, 'assign-member')}
                </div>
                <button
                  className="btn outline sm"
                  type="button"
                  onClick={() => void refetchMembers()}
                >
                  重试
                </button>
              </div>
            ) : null}
            <div className="card">
              <div className="card-body tight" style={{ overflowX: 'auto' }}>
                {membersLoading && !members ? (
                  <div className="help" role="status">
                    正在加载成员…
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>成员</th>
                        <th style={{ width: 130 }}>认证角色</th>
                        <th style={{ width: 90 }}>状态</th>
                        <th style={{ width: 220 }}>客户端策略</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(members ?? []).map((member) => (
                        <tr key={member.user_id}>
                          <td className="cell-wrap">{member.email}</td>
                          <td>{member.role_name}</td>
                          <td>
                            {member.disabled ? (
                              <span className="tag grey">停用</span>
                            ) : (
                              <span className="tag green">正常</span>
                            )}
                          </td>
                          <td>
                            <StrategySelect
                              label={`策略 ${member.email}`}
                              value={strategyValue(member.strategy_id)}
                              strategies={strategies}
                              disabled={
                                busy !== null ||
                                !strategiesReady ||
                                !!membersError ||
                                membersFetching
                              }
                              onChange={(value) =>
                                void save('members', member.user_id, member.email, value)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : tab === 'groups' ? (
          <>
            {groupsError ? (
              <div className="banner danger mb-14">
                <div>
                  <b>加载设备组失败。</b>
                  {strategyError(groupsError, 'assign-group')}
                </div>
                {!(groupsError instanceof ApiError && groupsError.status === 403) ? (
                  <button
                    className="btn outline sm"
                    type="button"
                    onClick={() => void refetchGroups()}
                  >
                    重试
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="card">
              <div className="card-body tight" style={{ overflowX: 'auto' }}>
                {groupsLoading && !groups ? (
                  <div className="help" role="status">
                    正在加载设备组…
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>设备组</th>
                        <th style={{ width: 90 }}>设备</th>
                        <th style={{ width: 220 }}>客户端策略</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(groups ?? []).map((group) => (
                        <tr key={group.id}>
                          <td className="cell-wrap">{group.name}</td>
                          <td className="mono">{group.device_ids.length}</td>
                          <td>
                            <StrategySelect
                              label={`策略 ${group.name}`}
                              value={strategyValue(group.strategy_id)}
                              strategies={strategies}
                              disabled={
                                busy !== null || !strategiesReady || !!groupsError || groupsFetching
                              }
                              onChange={(value) => void save('groups', group.id, group.name, value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="toolbar">
              <div className="input" style={{ width: 260 }}>
                <input
                  aria-label="搜索设备"
                  maxLength={64}
                  value={deviceDraft}
                  placeholder="设备名 / RustDesk ID"
                  onChange={(event) => setDeviceDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setDeviceQuery(deviceDraft.trim())
                      setDevicePage(1)
                    }
                  }}
                />
              </div>
              <button
                className="btn outline sm"
                type="button"
                onClick={() => {
                  setDeviceQuery(deviceDraft.trim())
                  setDevicePage(1)
                }}
              >
                搜索
              </button>
              <div className="spacer" />
              <span className="help">按服务端搜索与分页，每页 50 台</span>
            </div>
            {devicesError ? (
              <div className="banner danger mb-14">
                <div>
                  <b>加载设备失败。</b>
                  {strategyError(devicesError, 'assign-device')}
                </div>
                <button
                  className="btn outline sm"
                  type="button"
                  onClick={() => void refetchDevices()}
                >
                  重试
                </button>
              </div>
            ) : null}
            <div className="card">
              <div className="card-body tight" style={{ overflowX: 'auto' }}>
                {devicesLoading && !deviceData ? (
                  <div className="help" role="status">
                    正在加载设备…
                  </div>
                ) : (deviceData?.items.length ?? 0) === 0 ? (
                  <div className="help">没有匹配的设备。</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>设备</th>
                        <th style={{ width: 150 }}>RustDesk ID</th>
                        <th style={{ width: 220 }}>客户端策略</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceData?.items.map((device) => (
                        <tr key={device.id}>
                          <td className="cell-wrap">{device.name}</td>
                          <td className="mono">{device.rustdesk_id}</td>
                          <td>
                            <StrategySelect
                              label={`策略 ${device.name}`}
                              value={strategyValue(device.strategy_id)}
                              strategies={strategies}
                              disabled={
                                busy !== null ||
                                !strategiesReady ||
                                !!devicesError ||
                                devicesFetching
                              }
                              onChange={(value) =>
                                void save('devices', device.id, device.name, value)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {(deviceData?.total ?? 0) > 0 ? (
              <div className="pager" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <span className="total">
                  共 {deviceData?.total} 条 · 第 {deviceData?.page ?? devicePage} /{' '}
                  {devicePageCount} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  aria-label="上一页"
                  disabled={(deviceData?.page ?? devicePage) <= 1}
                  onClick={() => setDevicePage((page) => Math.max(1, page - 1))}
                >
                  ‹
                </button>
                <button
                  className="pg"
                  type="button"
                  aria-label="下一页"
                  disabled={(deviceData?.page ?? devicePage) >= devicePageCount}
                  onClick={() => setDevicePage((page) => page + 1)}
                >
                  ›
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
