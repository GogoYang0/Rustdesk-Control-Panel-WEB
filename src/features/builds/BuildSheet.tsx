import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useState } from 'react'

import SideSheet from '../../components/SideSheet'
import type { ClientBuildCapabilities } from '../../lib/api'
import { fetchClientBuildArtifact } from '../../lib/api'
import {
  buildPlatformsLabel,
  buildStatusLabel,
  buildStatusTone,
  canCancelBuild,
  clientBuildError,
  formatBytes,
  shortSha,
} from '../../lib/client-build'
import { saveBlobFile } from '../../lib/download'
import { formatTime } from '../../lib/format'
import { useCancelClientBuildMutation, useGetClientBuildQuery } from '../../store/api'

export default function BuildSheet({
  orgId,
  buildId,
  caps,
  cancelRequested,
  onCancelRequested,
  onClose,
}: {
  orgId: number
  buildId: number
  caps?: ClientBuildCapabilities
  cancelRequested: boolean
  onCancelRequested: (requested: boolean) => void
  onClose: () => void
}) {
  const {
    currentData: build,
    isLoading,
    error,
    refetch,
  } = useGetClientBuildQuery({ orgId, buildId })
  const [cancel] = useCancelClientBuildMutation()
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function requestCancel() {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const updated = await cancel({ orgId, buildId }).unwrap()
      const live = !['succeeded', 'failed', 'cancelled'].includes(updated.status)
      onCancelRequested(live)
      Toast.success(live ? '已请求取消，等待服务端确认' : '构建已取消')
      void refetch()
    } catch (err) {
      setActionError(clientBuildError(err, 'build-cancel'))
      void refetch()
    } finally {
      setBusy(false)
    }
  }

  async function download(artifactId: number, fileName: string) {
    if (downloading !== null) return
    setDownloading(artifactId)
    setActionError(null)
    try {
      const { blob, filename } = await fetchClientBuildArtifact(
        orgId,
        buildId,
        artifactId,
        fileName,
      )
      saveBlobFile(filename, blob)
      Toast.success('产物已开始下载')
    } catch (err) {
      setActionError(clientBuildError(err, 'artifact'))
    } finally {
      setDownloading(null)
    }
  }

  const status = build?.status ?? ''
  const live = build ? canCancelBuild(status) : false

  useEffect(() => {
    if (!build || !cancelRequested) return
    if (!['succeeded', 'failed', 'cancelled'].includes(build.status)) return
    onCancelRequested(false)
  }, [build, cancelRequested, onCancelRequested])

  return (
    <SideSheet title={`构建 #${buildId}`} onClose={onClose}>
      {error && !build ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载构建失败。</b>
            {clientBuildError(error, 'build')}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{actionError}</div>
        </div>
      ) : null}

      {isLoading && !build ? (
        <div className="help" role="status">
          正在加载构建详情…
        </div>
      ) : build ? (
        <>
          <dl className="desc">
            <dt>状态</dt>
            <dd>
              <span className={`tag ${buildStatusTone(build.status)}`}>
                {buildStatusLabel(build.status)}
              </span>
              {cancelRequested && live ? (
                <span className="tag orange" style={{ marginLeft: 6 }}>
                  已请求取消
                </span>
              ) : null}
            </dd>
            <dt>Profile</dt>
            <dd className="cell-wrap">
              {build.profile_name}（{build.app_name}）
            </dd>
            <dt>平台</dt>
            <dd className="cell-wrap">{buildPlatformsLabel(build.platforms)}</dd>
            <dt>上游版本</dt>
            <dd className="mono">{build.upstream_version}</dd>
            <dt>创建时间</dt>
            <dd className="mono">{formatTime(build.created_at)}</dd>
            <dt>派发时间</dt>
            <dd className="mono">{formatTime(build.dispatched_at)}</dd>
            <dt>完成时间</dt>
            <dd className="mono">{formatTime(build.finished_at)}</dd>
            <dt>GitHub Run</dt>
            <dd className="mono">
              {build.github_run_url ? (
                <a href={build.github_run_url} target="_blank" rel="noreferrer">
                  run {build.github_run_id ?? '—'}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt>操作</dt>
            <dd>
              <button className="btn outline sm" type="button" onClick={() => void refetch()}>
                刷新
              </button>
            </dd>
            <dt>失败原因</dt>
            <dd className="cell-wrap">
              {build.error_message ? (
                <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {build.error_message}
                </pre>
              ) : (
                '—'
              )}
            </dd>
          </dl>

          <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
          <div className="card-title" style={{ marginBottom: 8 }}>
            快照
          </div>
          <dl className="desc">
            <dt>服务器</dt>
            <dd className="mono cell-wrap">{build.manifest.server}</dd>
            <dt>API server</dt>
            <dd className="mono cell-wrap">{build.manifest.api_server}</dd>
            <dt>服务器公钥</dt>
            <dd className="cell-wrap">{build.manifest.server_key ? '已写入（公钥）' : '—'}</dd>
            <dt>Logo</dt>
            <dd>
              {build.manifest.logo
                ? `${build.manifest.logo.width}×${build.manifest.logo.height} · ${shortSha(
                    build.manifest.logo.sha256,
                  )}`
                : '未写入 Logo'}
            </dd>
          </dl>

          <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
          <div className="card-title" style={{ marginBottom: 8 }}>
            产物
          </div>
          {build.artifacts_purged ? (
            <div className="help">
              产物已清理（保留期 {caps?.limits.artifact_retention_days ?? '—'} 天），元数据已移除。
            </div>
          ) : build.artifacts.length === 0 ? (
            <div className="help">暂无可下载产物。</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>平台</th>
                  <th>文件</th>
                  <th>大小</th>
                  <th>SHA-256</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {build.artifacts.map((artifact) => (
                  <tr key={artifact.id}>
                    <td>{buildPlatformsLabel([artifact.platform])}</td>
                    <td className="mono cell-wrap">{artifact.file_name}</td>
                    <td className="mono">{formatBytes(artifact.size_bytes)}</td>
                    <td className="mono">{shortSha(artifact.sha256)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn borderless sm"
                        type="button"
                        disabled={downloading !== null}
                        onClick={() => void download(artifact.id, artifact.file_name)}
                      >
                        {downloading === artifact.id ? '下载中…' : '下载'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {live ? (
            <div className="hstack" style={{ marginTop: 16 }}>
              <div className="spacer" />
              <button
                className="btn danger sm"
                type="button"
                disabled={busy || cancelRequested}
                onClick={() => void requestCancel()}
              >
                {cancelRequested ? '已请求取消' : busy ? '请求中…' : '取消构建'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </SideSheet>
  )
}
