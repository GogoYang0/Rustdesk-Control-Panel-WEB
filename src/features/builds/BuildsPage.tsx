import { useMemo } from 'react'
import { useParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import {
  capabilityBlockReason,
  clientBuildError,
  formatBytes,
  platformLabel,
} from '../../lib/client-build'
import { useGetClientBuildCapabilitiesQuery, useGetMeQuery } from '../../store/api'
import ProfilesSection from './ProfilesSection'

export default function BuildsPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const { data: me, isLoading: meLoading } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canManage = perms.has('client_build.manage')
  const validId = Number.isSafeInteger(id) && id > 0

  const {
    currentData: caps,
    isLoading: capsLoading,
    error: capsError,
    refetch: refetchCaps,
  } = useGetClientBuildCapabilitiesQuery(id, { skip: !validId || !canManage })

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
        title="没有客户端生成器权限"
        description="无法确认当前组织与权限，请重新登录或联系管理员。"
      />
    )
  }

  if (!canManage) {
    return (
      <StateBlock
        code="403"
        title="没有客户端生成器权限"
        description="当前角色没有 client_build.manage；该权限只由 owner/admin 持有，且不可委派。"
      />
    )
  }

  const blockReason = caps ? capabilityBlockReason(caps) : null

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">客户端生成器</h1>
          <div className="page-sub">
            品牌 Profile 与 Logo；构建能力由部署配置管理，生成包在自建 GitHub 仓库执行
          </div>
        </div>
      </div>

      {capsError ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载构建能力失败。</b>
            {clientBuildError(capsError, 'capabilities')}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetchCaps()}>
            重试
          </button>
        </div>
      ) : capsLoading && !caps ? (
        <div className="banner info mb-14">
          <div>正在加载构建能力…</div>
        </div>
      ) : caps && blockReason ? (
        <div className="banner warning mb-14">
          <div>
            <b>构建暂不可发起。</b>
            {blockReason}
          </div>
        </div>
      ) : caps ? (
        <div className="banner info mb-14">
          <div>
            <b>构建能力已启用。</b>
            本组织服务器 <span className="mono">{caps.defaults?.server}</span>，API server{' '}
            <span className="mono">{caps.defaults?.api_server}</span>；生成包未签名，安装身份与官方
            RustDesk 相同，不能共存，且关闭官方更新通道。
          </div>
        </div>
      ) : null}

      {caps ? (
        <div className="help mb-14">
          配额：最多 {caps.limits.max_profiles_per_org} 个 Profile；每组织同时{' '}
          {caps.limits.max_concurrent_per_org} 个活跃构建；产物保留{' '}
          {caps.limits.artifact_retention_days} 天，单构建产物上限{' '}
          {formatBytes(caps.limits.max_artifact_bytes)}。支持平台：{' '}
          {caps.platforms.map(platformLabel).join(' / ')}。
        </div>
      ) : null}

      <ProfilesSection key={id} orgId={id} caps={caps} />
    </section>
  )
}
