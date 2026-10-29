import { useState } from 'react'

import Modal from '../../components/Modal'
import type { ClientBuildProfile } from '../../lib/api'
import { appNameProblem, clientBuildError, profileNameProblem } from '../../lib/client-build'
import {
  useCreateClientBuildProfileMutation,
  useUpdateClientBuildProfileMutation,
} from '../../store/api'

export default function ProfileDialog({
  orgId,
  profile,
  profiles,
  onClose,
}: {
  orgId: number
  profile?: ClientBuildProfile
  profiles: ClientBuildProfile[]
  onClose: () => void
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [appName, setAppName] = useState(profile?.app_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [createProfile] = useCreateClientBuildProfileMutation()
  const [updateProfile] = useUpdateClientBuildProfileMutation()

  async function submit() {
    if (busy) return
    const problem = profileNameProblem(name, profiles, profile?.id) ?? appNameProblem(appName)
    setError(problem)
    if (problem) return

    setBusy(true)
    try {
      if (profile) {
        await updateProfile({
          orgId,
          profileId: profile.id,
          patch: { name: name.trim(), app_name: appName.trim() },
        }).unwrap()
      } else {
        await createProfile({ orgId, name: name.trim(), app_name: appName.trim() }).unwrap()
      }
      onClose()
    } catch (err) {
      setError(clientBuildError(err, profile ? 'profile-update' : 'profile-create'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={profile ? `编辑 Profile #${profile.id}` : '新建 Profile'}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={submit}>
            {busy ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="field">
        <label className="form-label" htmlFor="profile-name">
          <span className="req">*</span>名称
        </label>
        <div className="input">
          <input
            id="profile-name"
            aria-label="名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="help">组织内不区分大小写唯一，1–64 个字符。</div>
      </div>
      <div className="field">
        <label className="form-label" htmlFor="profile-app-name">
          <span className="req">*</span>应用名
        </label>
        <div className="input">
          <input
            id="profile-app-name"
            aria-label="应用名"
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
          />
        </div>
        <div className="help">安装后显示的应用名；不能是 RustDesk，升级/共存身份沿用上游。</div>
      </div>
    </Modal>
  )
}
