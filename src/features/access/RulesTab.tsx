import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import type { AccessRule, AccessRuleTargetKind, DeviceGroup, UserGroup } from '../../lib/api'
import {
  accessError,
  ruleError,
  accessRuleImpact,
  accessRuleTargetLabel,
  findDuplicateRule,
  isDefaultAccessRule,
  ruleTargetKindLabel,
  validateRuleForm,
} from '../../lib/access-control'
import { formatTime } from '../../lib/format'
import {
  useCreateAccessRuleMutation,
  useDeleteAccessRuleMutation,
  useGetAccessRulesQuery,
  useGetDeviceGroupsQuery,
  useGetUserGroupsQuery,
} from '../../store/api'
import { ConfirmDelete } from '../addressbooks/AddressBookDialogs'
import { ErrorBanner, SaveDialog } from './AccessDialogs'

const TARGET_KINDS: AccessRuleTargetKind[] = ['device_group', 'user_group', 'all_devices']

export default function RulesTab({ orgId }: { orgId: number }) {
  const {
    currentData: rules,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAccessRulesQuery(orgId)
  const { currentData: groups } = useGetUserGroupsQuery(orgId)
  const { currentData: deviceGroups } = useGetDeviceGroupsQuery(orgId)
  const [removeRule, removeState] = useDeleteAccessRuleMutation()

  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AccessRule | null>(null)
  const loadingCurrent = isLoading || (isFetching && rules === undefined)
  const groupMap = new Map((groups ?? []).map((group) => [group.id, group]))

  async function confirmDelete() {
    if (!deleting) return
    try {
      await removeRule({ orgId, ruleId: deleting.id }).unwrap()
      Toast.success('访问规则已删除')
      setDeleting(null)
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        Toast.error('该规则已不存在，列表已刷新')
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
            访问规则<span className="hint">只有 allow、取并集；删除默认规则即收紧</span>
          </div>
          <button
            className="btn primary sm"
            type="button"
            disabled={!rules || !groups}
            onClick={() => {
              void refetch()
              setCreating(true)
            }}
          >
            新建规则
          </button>
        </div>

        {error ? (
          <div className="card-body">
            <Banner
              type="danger"
              closeIcon={null}
              description={`加载规则失败：${accessError(error)}`}
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

        {!error || rules ? (
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载访问规则…
              </div>
            ) : (rules ?? []).length === 0 ? (
              <Empty title="还没有访问规则" description="新建规则后，组成员才能访问对应设备" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>来源用户组</th>
                    <th>目标</th>
                    <th style={{ width: 160 }}>创建时间</th>
                    <th style={{ width: 90 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(rules ?? []).map((rule) => {
                    const source = groupMap.get(rule.source_group_id)
                    return (
                      <tr key={rule.id}>
                        <td className="cell-wrap">
                          {source?.kind === 'everyone' ? (
                            <span className="tag grey">保留组</span>
                          ) : null}{' '}
                          {rule.source_group_name}
                        </td>
                        <td className="cell-wrap">
                          <span
                            className={`tag ${
                              rule.target_kind === 'all_devices' ? 'orange' : 'blue'
                            }`}
                          >
                            {ruleTargetKindLabel(rule.target_kind)}
                          </span>{' '}
                          {rule.target_kind === 'all_devices' ? '全部设备' : rule.target_group_name}
                        </td>
                        <td className="mono">{formatTime(rule.created_at)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn borderless sm"
                            type="button"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setDeleting(rule)}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>

      <p className="help" style={{ marginTop: 12 }}>
        规则只允许、取并集；owner/admin
        不受规则限制；有效成员可访问本人未停用设备；停用设备对所有人不可达。 user 级限制不足以表达
        deny——需要收紧时删除或重建规则。
      </p>

      {creating ? (
        <CreateRuleDialog
          orgId={orgId}
          rules={rules ?? []}
          groups={groups ?? []}
          deviceGroups={deviceGroups ?? []}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDelete
          title="删除访问规则"
          confirmLabel={isDefaultAccessRule(deleting, groups ?? []) ? '删除默认规则' : '删除'}
          busy={removeState.isLoading}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          body={
            isDefaultAccessRule(deleting, groups ?? []) ? (
              <>
                这是默认的 <b>everyone → 全部设备</b>{' '}
                规则。删除后，未被精确规则覆盖的成员将失去设备访问； 本人设备仍可见，owner/admin
                不受影响。系统不会自动重建该规则。
              </>
            ) : (
              <>
                删除 <b>{deleting.source_group_name}</b> → <b>{accessRuleTargetLabel(deleting)}</b>{' '}
                后，该来源组成员将不再通过此规则获得访问；
                仍可能通过其他规则或本人设备访问。操作不可恢复。
              </>
            )
          }
        />
      ) : null}
    </>
  )
}

function CreateRuleDialog({
  orgId,
  rules,
  groups,
  deviceGroups,
  onClose,
}: {
  orgId: number
  rules: AccessRule[]
  groups: UserGroup[]
  deviceGroups: DeviceGroup[]
  onClose: () => void
}) {
  const [sourceGroupId, setSourceGroupId] = useState('')
  const [targetKind, setTargetKind] = useState<AccessRuleTargetKind>('device_group')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [create, createState] = useCreateAccessRuleMutation()

  const source = Number(sourceGroupId || 0)
  const target = targetGroupId ? Number(targetGroupId) : null
  const subject = {
    source_group_id: source,
    target_kind: targetKind,
    target_group_id: targetKind === 'all_devices' ? null : target,
  }
  const duplicate =
    source > 0 && (targetKind === 'all_devices' || target != null)
      ? findDuplicateRule(rules, subject)
      : undefined
  const targetOptions = targetKind === 'user_group' ? groups : deviceGroups
  const validation = validateRuleForm({
    sourceGroupId: source,
    targetKind,
    targetGroupId: target,
  })

  async function submit() {
    if (createState.isLoading) return
    setError(validation)
    if (validation || duplicate) return
    try {
      await create({
        orgId,
        request: {
          source_group_id: source,
          target_kind: targetKind,
          ...(targetKind === 'all_devices' ? {} : { target_group_id: target ?? undefined }),
        },
      }).unwrap()
      Toast.success('访问规则已创建')
      onClose()
    } catch (err) {
      setError(ruleError(err))
    }
  }

  return (
    <SaveDialog
      title="新建访问规则"
      busy={createState.isLoading}
      saveDisabled={Boolean(duplicate)}
      onClose={onClose}
      onSave={() => void submit()}
    >
      <ErrorBanner message={error} />
      {duplicate ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>相同来源与目标的规则已存在，功能相同的规则不能重复创建。</div>
        </div>
      ) : null}

      <div className="field mb-14">
        <label className="form-label">
          <span className="req">*</span>来源用户组
        </label>
        <select
          className="select-native"
          aria-label="来源用户组"
          value={sourceGroupId}
          onChange={(event) => setSourceGroupId(event.target.value)}
        >
          <option value="">请选择用户组</option>
          {groups.map((group) => (
            <option key={group.id} value={String(group.id)}>
              {group.name}
              {group.kind === 'everyone' ? '（所有有效成员）' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="field mb-14">
        <label className="form-label">目标</label>
        <div className="chips" role="group" aria-label="目标类型" style={{ margin: 0 }}>
          {TARGET_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip-btn ${targetKind === kind ? 'on' : ''}`}
              aria-pressed={targetKind === kind}
              onClick={() => {
                setTargetKind(kind)
                setTargetGroupId('')
              }}
            >
              {ruleTargetKindLabel(kind)}
            </button>
          ))}
        </div>
        {targetKind === 'all_devices' ? null : (
          <select
            className="select-native"
            aria-label={`目标${ruleTargetKindLabel(targetKind)}`}
            value={targetGroupId}
            onChange={(event) => setTargetGroupId(event.target.value)}
          >
            <option value="">请选择{ruleTargetKindLabel(targetKind)}</option>
            {targetOptions.map((group) => (
              <option key={group.id} value={String(group.id)}>
                {group.name}
              </option>
            ))}
          </select>
        )}
        {targetKind !== 'all_devices' && targetOptions.length === 0 ? (
          <div className="help">
            还没有可选的{ruleTargetKindLabel(targetKind)}，请先去对应页签创建。
          </div>
        ) : null}
        <div className="banner info" style={{ marginTop: 10, padding: '9px 11px' }}>
          <div>{accessRuleImpact(targetKind)}</div>
        </div>
      </div>
    </SaveDialog>
  )
}
