import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import { useGetMeQuery } from '../../store/api'
import DeviceGroupsTab from './DeviceGroupsTab'
import UserGroupsTab from './UserGroupsTab'

const TABS = ['user-groups', 'device-groups'] as const
type AccessTab = (typeof TABS)[number]

const TAB_LABELS: Record<AccessTab, string> = {
  'user-groups': '用户组',
  'device-groups': '设备组',
}

function parseTab(value: string | null): AccessTab {
  return value === 'device-groups' ? 'device-groups' : 'user-groups'
}

export default function AccessPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canManage = perms.has('access.manage')

  const scopeRef = useRef(id)
  const orgChanged = scopeRef.current !== id
  const tab = orgChanged ? 'user-groups' : parseTab(searchParams.get('tab'))

  useLayoutEffect(() => {
    if (scopeRef.current === id) return
    scopeRef.current = id
  }, [id])

  useEffect(() => {
    if (orgChanged && searchParams.toString()) {
      setSearchParams(new URLSearchParams(), { replace: true })
    }
  }, [orgChanged, searchParams, setSearchParams])

  function changeTab(next: AccessTab) {
    const params = new URLSearchParams(searchParams)
    if (next === 'user-groups') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  if (!Number.isSafeInteger(id) || id <= 0) {
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
        title="没有访问控制权限"
        description="无法确认当前组织与权限，请重新登录或联系管理员。"
      />
    )
  }

  if (!canManage) {
    return (
      <StateBlock
        code="403"
        title="没有访问控制权限"
        description="当前角色没有 access.manage；该权限当前只由 owner/admin 持有。"
      />
    )
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">访问控制</h1>
          <div className="page-sub">用户组 / 设备组；规则页签与 allow-only 规则在 10b 接入</div>
        </div>
      </div>

      <div className="banner info mb-14">
        <div>
          <b>当前默认 everyone → 全部设备规则仍生效。</b>
          创建组、添加成员或设备本身不会收紧访问；规则页签（10b）接入后才会按组放行。 owner/admin
          不受规则限制，停用设备对所有人不可达。
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="访问控制视图">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`access-tab-${value}`}
            aria-controls={tab === value ? 'access-tabpanel' : undefined}
            aria-selected={tab === value}
            className={`tab ${tab === value ? 'on' : ''}`}
            onClick={() => changeTab(value)}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="access-tabpanel" aria-labelledby={`access-tab-${tab}`}>
        {tab === 'user-groups' ? (
          <UserGroupsTab key={`${id}-user-groups`} orgId={id} />
        ) : (
          <DeviceGroupsTab key={`${id}-device-groups`} orgId={id} />
        )}
      </div>
    </section>
  )
}
