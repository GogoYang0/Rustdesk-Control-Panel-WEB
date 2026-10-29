import { Empty, Toast } from '@douyinfe/semi-ui'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import type { ClientBuildCapabilities, ClientBuildDetail } from '../../lib/api'
import {
  BUILD_PAGE_SIZES,
  CLIENT_BUILD_STATUSES,
  DEFAULT_BUILD_FILTERS,
  buildArtifactLabel,
  buildPlatformsLabel,
  buildStatusLabel,
  buildStatusTone,
  capabilityBlockReason,
  clientBuildError,
  parseBuildFilters,
  toBuildRequestQuery,
  toBuildSearchParams,
  type BuildFilters,
} from '../../lib/client-build'
import { formatTime } from '../../lib/format'
import { totalPages } from '../../lib/paging'
import { useGetClientBuildPageQuery, useGetClientBuildProfilesQuery } from '../../store/api'
import BuildDialog from './BuildDialog'
import BuildSheet from './BuildSheet'

export default function BuildsSection({
  orgId,
  caps,
}: {
  orgId: number
  caps?: ClientBuildCapabilities
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const scopeRef = useRef(orgId)
  const orgChanged = scopeRef.current !== orgId
  const filters = parseBuildFilters(searchParams)
  const effective: BuildFilters = orgChanged ? { ...DEFAULT_BUILD_FILTERS } : filters
  const queryString = toBuildRequestQuery(effective).toString()

  const {
    currentData: page,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetClientBuildPageQuery({ orgId, queryString }, { skip: !orgId })
  const {
    currentData: profilePage,
    isLoading: profilesLoading,
    error: profilesError,
    refetch: refetchProfiles,
  } = useGetClientBuildProfilesQuery(orgId, { skip: !orgId })
  const profiles = profilePage?.items ?? []

  const [selected, setSelected] = useState<number | null>(null)
  const [cancelRequested, setCancelRequested] = useState<Set<number>>(new Set())
  const [creating, setCreating] = useState(false)

  useLayoutEffect(() => {
    if (scopeRef.current === orgId) return
    scopeRef.current = orgId
  }, [orgId])

  useEffect(() => {
    if (!orgChanged) return
    setSelected(null)
    setCreating(false)
    setCancelRequested(new Set())
    if (searchParams.toString()) setSearchParams(new URLSearchParams(), { replace: true })
  }, [orgChanged, searchParams, setSearchParams])

  const rows = page?.items ?? []
  const total = page?.total ?? 0
  const pages = totalPages(total, page?.page_size ?? effective.pageSize)

  useEffect(() => {
    if (page && effective.page > pages) change({ page: pages })
  }, [page, effective.page, pages])

  function change(patch: Partial<BuildFilters>) {
    const next = { ...effective, ...patch, page: patch.page ?? 1 }
    setSearchParams(toBuildSearchParams(next), { replace: true })
  }

  function refresh() {
    void refetch()
  }

  function markCancelRequested(buildId: number, requested: boolean) {
    setCancelRequested((current) => {
      const next = new Set(current)
      if (requested) next.add(buildId)
      else next.delete(buildId)
      return next
    })
  }

  function created(build: ClientBuildDetail) {
    setCreating(false)
    Toast.success('已发起构建')
    void refetch()
    setSelected(build.id)
  }

  const blockReason = caps ? capabilityBlockReason(caps) : '构建能力尚未加载'
  const createDisabled =
    !caps || blockReason !== null || profilesError !== undefined || profiles.length === 0
  const createTitle = !caps
    ? '构建能力尚未加载'
    : (blockReason ??
      (profilesError
        ? 'Profile 列表加载失败，请重试'
        : profilesLoading && !profilePage
          ? '正在加载 Profile…'
          : profiles.length === 0
            ? '请先创建 Profile'
            : undefined))
  const loadingCurrent = isLoading || (isFetching && page === undefined)

  return (
    <div style={{ marginTop: 24 }}>
      <div className="hstack" style={{ marginBottom: 10 }}>
        <div className="card-title">构建</div>
        <span className="tag grey">{total}</span>
        <div className="spacer" />
        <button
          className="btn primary sm"
          type="button"
          disabled={createDisabled}
          title={createTitle}
          onClick={() => setCreating(true)}
        >
          新建构建
        </button>
      </div>

      {profilesError ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载 Profile 筛选失败。</b>
            {clientBuildError(profilesError, 'profiles')}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetchProfiles()}>
            重试
          </button>
        </div>
      ) : null}

      <div className="toolbar">
        <div className="chips" role="group" aria-label="构建状态" style={{ margin: 0 }}>
          <button
            type="button"
            className={`chip-btn ${effective.status === '' ? 'on' : ''}`}
            aria-pressed={effective.status === ''}
            onClick={() => change({ status: '' })}
          >
            全部
          </button>
          {CLIENT_BUILD_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`chip-btn ${effective.status === status ? 'on' : ''}`}
              aria-pressed={effective.status === status}
              onClick={() => change({ status })}
            >
              {buildStatusLabel(status)}
            </button>
          ))}
        </div>

        <select
          className="select-native"
          aria-label="Profile 筛选"
          value={effective.profileId === null ? '' : String(effective.profileId)}
          onChange={(event) =>
            change({
              profileId: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        >
          <option value="">全部 Profile</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={String(profile.id)}>
              {profile.name}
            </option>
          ))}
          {effective.profileId !== null &&
          !profiles.some((profile) => profile.id === effective.profileId) ? (
            <option value={String(effective.profileId)}>
              Profile #{effective.profileId}（不在列表）
            </option>
          ) : null}
        </select>

        <select
          className="select-native"
          aria-label="每页条数"
          value={String(effective.pageSize)}
          onChange={(event) =>
            change({
              pageSize: Number(event.target.value) as BuildFilters['pageSize'],
            })
          }
        >
          {BUILD_PAGE_SIZES.map((size) => (
            <option key={size} value={String(size)}>
              每页 {size} 条
            </option>
          ))}
        </select>

        <div className="spacer" />
        <button className="btn outline sm" type="button" onClick={refresh}>
          刷新
        </button>
      </div>

      {error ? (
        <div className="banner danger mb-14">
          <div>
            <b>加载构建失败。</b>
            {clientBuildError(error, 'builds')}
            {rows.length > 0 ? '（显示上次结果）' : ''}
          </div>
          <button className="btn outline sm" type="button" onClick={() => void refetch()}>
            重试
          </button>
        </div>
      ) : null}

      {error && rows.length === 0 ? null : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            {loadingCurrent ? (
              <div className="help" role="status" style={{ padding: '14px 0' }}>
                正在加载构建…
              </div>
            ) : rows.length === 0 ? (
              <Empty
                title="还没有构建"
                description="选择 Profile 与平台发起构建；历史与产物状态会显示在这里"
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>构建</th>
                    <th style={{ width: 140 }}>Profile</th>
                    <th>平台</th>
                    <th style={{ width: 90 }}>状态</th>
                    <th style={{ width: 120 }}>GitHub Run</th>
                    <th style={{ width: 90 }}>产物</th>
                    <th style={{ width: 150 }}>创建时间</th>
                    <th style={{ width: 70 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">#{row.id}</td>
                      <td className="cell-wrap">{row.profile_name}</td>
                      <td className="cell-wrap">{buildPlatformsLabel(row.platforms)}</td>
                      <td>
                        <span className={`tag ${buildStatusTone(row.status)}`}>
                          {buildStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="mono">
                        {row.github_run_url ? (
                          <a href={row.github_run_url} target="_blank" rel="noreferrer">
                            run {row.github_run_id ?? '—'}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{buildArtifactLabel(row.artifact_count, row.artifacts_purged)}</td>
                      <td className="mono">{formatTime(row.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn borderless sm"
                          type="button"
                          onClick={() => setSelected(row.id)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {total > 0 ? (
              <div className="pager" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <span className="total">
                  共 {total} 条 · 第 {effective.page} / {pages} 页
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={effective.page <= 1}
                  aria-label="上一页"
                  onClick={() => change({ page: effective.page - 1 })}
                >
                  ‹
                </button>
                <span className="pg on" aria-current="page">
                  {effective.page}
                </span>
                <button
                  className="pg"
                  type="button"
                  disabled={effective.page >= pages}
                  aria-label="下一页"
                  onClick={() => change({ page: effective.page + 1 })}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="help" style={{ marginTop: 10 }}>
        构建状态由服务端按 GitHub run
        轮询更新；页面不自动刷新。取消为尽力而为，最终状态以服务端为准。
      </div>

      {creating ? (
        <BuildDialog
          orgId={orgId}
          caps={caps}
          profiles={profiles}
          onClose={() => setCreating(false)}
          onCreated={created}
        />
      ) : null}

      {selected !== null && !orgChanged ? (
        <BuildSheet
          orgId={orgId}
          buildId={selected}
          caps={caps}
          cancelRequested={cancelRequested.has(selected)}
          onCancelRequested={(requested) => markCancelRequested(selected, requested)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  )
}
