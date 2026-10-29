import { useEffect, useState } from 'react'

import { fetchClientBuildProfileLogo } from '../../lib/api'

export default function ProfileLogo({
  orgId,
  profileId,
  sha,
  hasLogo,
  name,
}: {
  orgId: number
  profileId: number
  sha: string
  hasLogo: boolean
  name: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!hasLogo) return
    let alive = true
    let objectUrl: string | null = null
    void fetchClientBuildProfileLogo(orgId, profileId, sha)
      .then((blob) => {
        if (!alive) return
        if (!blob) {
          setFailed(true)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [orgId, profileId, sha, hasLogo])

  return (
    <div className="logo-preview" style={{ width: 64, height: 64, flex: 'none' }}>
      {url ? (
        <img
          src={url}
          alt={`${name} Logo`}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <span className="help">{failed ? 'Logo 不可用' : hasLogo ? '加载中…' : '无 Logo'}</span>
      )}
    </div>
  )
}
