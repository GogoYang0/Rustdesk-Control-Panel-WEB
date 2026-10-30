import { useState } from 'react'

import Modal from '../../components/Modal'
import type { ClientBuildCapabilities, ClientBuildDetail, ClientBuildProfile } from '../../lib/api'
import { capabilityBlockReason, clientBuildError, platformLabel } from '../../lib/client-build'
import { useCreateClientBuildMutation } from '../../store/api'

export default function BuildDialog({
  orgId,
  caps,
  profiles,
  onClose,
  onCreated,
}: {
  orgId: number
  caps?: ClientBuildCapabilities
  profiles: ClientBuildProfile[]
  onClose: () => void
  onCreated: (build: ClientBuildDetail) => void
}) {
  const [profileId, setProfileId] = useState<number | null>(profiles[0]?.id ?? null)
  type BuildPlatform = ClientBuildCapabilities['platforms'][number]
  const [platforms, setPlatforms] = useState<Set<BuildPlatform>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [createBuild] = useCreateClientBuildMutation()

  const blockReason = caps ? capabilityBlockReason(caps) : '构建能力尚未加载'
  const platformOptions = caps?.platforms ?? []

  function toggle(platform: BuildPlatform) {
    setPlatforms((current) => {
      const next = new Set(current)
      if (next.has(platform)) next.delete(platform)
      else next.add(platform)
      return next
    })
  }

  async function submit() {
    if (busy) return
    if (profileId === null) {
      setError('请选择 Profile')
      return
    }
    if (platforms.size === 0) {
      setError('至少选择一个平台')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const detail = await createBuild({
        orgId,
        request: { profile_id: profileId, platforms: [...platforms] },
      }).unwrap()
      onCreated(detail)
    } catch (err) {
      setError(clientBuildError(err, 'build-create'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="新建构建"
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy || blockReason !== null || profileId === null || platforms.size === 0}
            onClick={() => void submit()}
          >
            {busy ? '发起中…' : '发起构建'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      {blockReason ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>{blockReason}</div>
        </div>
      ) : null}

      <div className="field mb-14">
        <label className="form-label" htmlFor="build-profile">
          <span className="req">*</span>Profile
        </label>
        <select
          id="build-profile"
          className="select-native"
          value={profileId === null ? '' : String(profileId)}
          onChange={(event) => setProfileId(Number(event.target.value))}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={String(profile.id)}>
              {profile.name}（{profile.app_name}）
            </option>
          ))}
        </select>
        <div className="help">
          构建会冻结当前 Profile 与应用名；之后修改 Profile 不影响这次构建。
        </div>
      </div>

      <div className="field mb-14">
        <span className="form-label">
          <span className="req">*</span>平台
        </span>
        <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
          {platformOptions.map((platform) => (
            <label key={platform} className="check-item" style={{ display: 'flex', gap: 6 }}>
              <input
                type="checkbox"
                aria-label={platformLabel(platform)}
                checked={platforms.has(platform)}
                onChange={() => toggle(platform)}
              />
              {platformLabel(platform)}
            </label>
          ))}
        </div>
        <div className="help">平台白名单来自部署配置；至少选择一个。</div>
      </div>

      {caps?.defaults ? (
        <dl className="desc">
          <dt>服务器</dt>
          <dd className="mono">{caps.defaults.server}</dd>
          <dt>API server</dt>
          <dd className="mono">{caps.defaults.api_server}</dd>
          <dt>上游版本</dt>
          <dd className="mono">由部署固定</dd>
        </dl>
      ) : null}
      <div className="help">服务器地址与公钥由本组织部署推导，不能手工填写。</div>
    </Modal>
  )
}
