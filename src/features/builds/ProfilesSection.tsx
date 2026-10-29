import { Empty, Toast } from '@douyinfe/semi-ui'
import { useEffect, useRef, useState } from 'react'

import Modal from '../../components/Modal'
import type { ClientBuildCapabilities, ClientBuildProfile } from '../../lib/api'
import {
  base64FromDataUrl,
  clientBuildError,
  logoUploadProblem,
  readFileAsDataUrl,
  shortSha,
} from '../../lib/client-build'
import { formatTime } from '../../lib/format'
import {
  useDeleteClientBuildProfileLogoMutation,
  useDeleteClientBuildProfileMutation,
  useGetClientBuildProfilesQuery,
  usePutClientBuildProfileLogoMutation,
} from '../../store/api'
import ProfileDialog from './ProfileDialog'
import ProfileLogo from './ProfileLogo'

function LogoUploadButton({
  name,
  disabled,
  onFile,
}: {
  name: string
  disabled: boolean
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        className="btn borderless sm"
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        上传 Logo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        aria-label={`上传 Logo ${name}`}
        tabIndex={-1}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </>
  )
}

export default function ProfilesSection({
  orgId,
  caps,
}: {
  orgId: number
  caps?: ClientBuildCapabilities
}) {
  const { currentData: page, isLoading, error, refetch } = useGetClientBuildProfilesQuery(orgId)
  const [putLogo] = usePutClientBuildProfileLogoMutation()
  const [deleteLogo] = useDeleteClientBuildProfileLogoMutation()
  const [deleteProfile] = useDeleteClientBuildProfileMutation()

  const [dialog, setDialog] = useState<{ profile?: ClientBuildProfile } | null>(null)
  const [deleting, setDeleting] = useState<ClientBuildProfile | null>(null)
  const [removingLogo, setRemovingLogo] = useState<ClientBuildProfile | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  function beginBusy(profileId: number): boolean {
    if (busyRef.current) return false
    busyRef.current = true
    setBusyId(profileId)
    setActionError(null)
    return true
  }

  function endBusy() {
    busyRef.current = false
    if (mountedRef.current) setBusyId(null)
  }

  const profiles = page?.items ?? []
  const profileLimit = caps?.limits.max_profiles_per_org ?? 0
  const atLimit = Boolean(caps) && profiles.length >= profileLimit
  const createDisabled = !caps || atLimit || busyId !== null

  async function uploadLogo(profile: ClientBuildProfile, file: File) {
    const problem = logoUploadProblem(file)
    if (problem) {
      setActionError(problem)
      return
    }
    if (!beginBusy(profile.id)) return
    let dataUrl: string
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch {
      setActionError('读取文件失败，请重试')
      endBusy()
      return
    }
    try {
      await putLogo({
        orgId,
        profileId: profile.id,
        pngBase64: base64FromDataUrl(dataUrl),
      }).unwrap()
      if (mountedRef.current) Toast.success('Logo 已更新')
    } catch (err) {
      if (mountedRef.current) setActionError(clientBuildError(err, 'logo'))
    } finally {
      endBusy()
    }
  }

  async function removeLogo() {
    if (!removingLogo || !beginBusy(removingLogo.id)) return
    try {
      await deleteLogo({ orgId, profileId: removingLogo.id }).unwrap()
      if (!mountedRef.current) return
      setRemovingLogo(null)
      Toast.success('Logo 已移除')
    } catch (err) {
      if (mountedRef.current) setActionError(clientBuildError(err, 'logo'))
    } finally {
      endBusy()
    }
  }

  async function removeProfile() {
    if (!deleting || !beginBusy(deleting.id)) return
    try {
      await deleteProfile({ orgId, profileId: deleting.id }).unwrap()
      if (!mountedRef.current) return
      setDeleting(null)
      Toast.success('Profile 已删除')
    } catch (err) {
      if (mountedRef.current) setActionError(clientBuildError(err, 'profile-delete'))
    } finally {
      endBusy()
    }
  }

  return (
    <>
      <div className="hstack" style={{ marginBottom: 10 }}>
        <div className="card-title">品牌配置</div>
        <span className="tag grey">
          {profiles.length}
          {caps ? ` / ${profileLimit}` : ''}
        </span>
        <div className="spacer" />
        <button
          className="btn primary sm"
          type="button"
          disabled={createDisabled}
          title={
            !caps
              ? '构建能力尚未加载'
              : atLimit
                ? `已达到 ${profileLimit} 个 Profile 上限`
                : undefined
          }
          onClick={() => setDialog({})}
        >
          新建 Profile
        </button>
      </div>

      <div className="help mb-14">
        Profile 只保存名称、应用名与
        Logo；服务器地址与公钥由本组织部署推导，发起构建时写入快照，不能手填。
      </div>

      {actionError && !deleting && !removingLogo ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{actionError}</div>
        </div>
      ) : null}

      {error ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载 Profile 失败。</b>
            {clientBuildError(error, 'profiles')}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {error && !page ? null : isLoading && !page ? (
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载 Profile…
            </div>
          </div>
        </div>
      ) : profiles.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <Empty
              title="还没有品牌配置"
              description="新建 Profile 后可上传 Logo，并用于后续构建。"
            />
          </div>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {profiles.map((profile) => (
            <div className="card" key={profile.id}>
              <div className="card-body">
                <div className="hstack" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <ProfileLogo
                    orgId={orgId}
                    profileId={profile.id}
                    sha={profile.logo_sha256}
                    hasLogo={profile.has_logo}
                    name={profile.name}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="card-title cell-wrap">{profile.name}</div>
                    <div className="help">应用名 {profile.app_name}</div>
                    <div className="help">
                      {profile.has_logo
                        ? `Logo ${profile.logo_width}×${profile.logo_height} · ${shortSha(profile.logo_sha256)}`
                        : '未上传 Logo'}
                    </div>
                    <div className="help">更新于 {formatTime(profile.updated_at)}</div>
                  </div>
                </div>
                <div className="hstack" style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  <button
                    className="btn borderless sm"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => {
                      setActionError(null)
                      setDialog({ profile })
                    }}
                  >
                    编辑
                  </button>
                  <LogoUploadButton
                    name={profile.name}
                    disabled={busyId !== null}
                    onFile={(file) => void uploadLogo(profile, file)}
                  />
                  {profile.has_logo ? (
                    <button
                      className="btn borderless sm"
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => {
                        setActionError(null)
                        setRemovingLogo(profile)
                      }}
                    >
                      移除 Logo
                    </button>
                  ) : null}
                  <div className="spacer" />
                  <button
                    className="btn danger sm"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => {
                      setActionError(null)
                      setDeleting(profile)
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog ? (
        <ProfileDialog
          orgId={orgId}
          profile={dialog.profile}
          profiles={profiles}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {deleting ? (
        <Modal
          title={`删除 Profile「${deleting.name}」`}
          onClose={() => {
            if (busyId !== null) return
            setDeleting(null)
            setActionError(null)
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  setDeleting(null)
                  setActionError(null)
                }}
              >
                取消
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busyId !== null}
                onClick={() => void removeProfile()}
              >
                {busyId !== null ? '删除中…' : '删除'}
              </button>
            </>
          }
        >
          {actionError ? (
            <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
              <div>{actionError}</div>
            </div>
          ) : null}
          <p>历史构建会保留 Profile 与 Logo 快照；存在进行中的构建时服务端会拒绝删除。</p>
        </Modal>
      ) : null}

      {removingLogo ? (
        <Modal
          title={`移除「${removingLogo.name}」的 Logo`}
          onClose={() => {
            if (busyId !== null) return
            setRemovingLogo(null)
            setActionError(null)
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  setRemovingLogo(null)
                  setActionError(null)
                }}
              >
                取消
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busyId !== null}
                onClick={() => void removeLogo()}
              >
                {busyId !== null ? '移除中…' : '移除 Logo'}
              </button>
            </>
          }
        >
          {actionError ? (
            <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
              <div>{actionError}</div>
            </div>
          ) : null}
          <p>后续构建将不再写入 Logo；历史构建的产物不受影响。</p>
        </Modal>
      ) : null}
    </>
  )
}
