import { useParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import { useGetMeQuery } from '../../store/api'
import OrgCard from './OrgCard'
import ProviderCard from './ProviderCard'
import ProvisioningCard from './ProvisioningCard'
import RetentionCard from './RetentionCard'

export default function SettingsPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me, isLoading, error } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const validId = Number.isSafeInteger(id) && id > 0

  if (!validId) {
    return <StateBlock code="404" title="组织不存在" description="组织 id 不合法。" />
  }
  if (isLoading) {
    return (
      <section className="page on">
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载系统设置…
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
        title="组织不可用"
        description="无法确认当前组织与账户，请重新登录。"
      />
    )
  }
  if (!current.permissions.includes('org.admin')) {
    return (
      <StateBlock
        code="403"
        title="需要 owner 权限"
        description="系统设置仅对拥有 org.admin 的 owner 开放；当前角色不能查看供应或审计保留配置。"
      />
    )
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">系统设置</h1>
          <div className="page-sub">{current.name} · 组织级配置与部署状态</div>
        </div>
      </div>

      {error ? (
        <div className="banner warning mb-14">
          <div>账户信息刷新失败，当前展示的可能是上次结果。</div>
        </div>
      ) : null}
      <div className="banner info mb-14">
        <div>
          <b>owner 级设置。</b>
          供应与审计保留的修改会写入审计；秘密项来自环境变量，控制台只读且不回显。
        </div>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}
      >
        <OrgCard key={current.id} org={current} />
        <ProvisioningCard key={`provisioning-${id}`} orgId={id} />
        <RetentionCard key={`retention-${id}`} orgId={id} />
        <ProviderCard />
      </div>

      <p className="help" style={{ marginTop: 12 }}>
        供应状态的异步变化本页不自动轮询，可手动刷新；席位、时区与验证码运行状态尚无只读 API。
      </p>
    </section>
  )
}
