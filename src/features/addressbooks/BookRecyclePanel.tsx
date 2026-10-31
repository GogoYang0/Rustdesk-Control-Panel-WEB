import { Toast } from '@douyinfe/semi-ui'
import { useMemo, useState } from 'react'

import type { AddressBookRecycleBinItem } from '../../lib/api'
import {
  deletedByLabel,
  filterRecycle,
  RECYCLE_RETENTION_DAYS,
  recycleError,
  retentionText,
} from '../../lib/addressbook-recycle'
import { formatTime } from '../../lib/format'
import {
  useGetAddressBookRecycleBinQuery,
  usePurgeAddressBookPeerMutation,
  useRestoreAddressBookPeerMutation,
} from '../../store/api'
import { ConfirmDelete } from './AddressBookDialogs'

interface Props {
  orgId: number
  bookId: number
  emails: Map<number, string>
}

export default function BookRecyclePanel({ orgId, bookId, emails }: Props) {
  const {
    currentData: items,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAddressBookRecycleBinQuery({ orgId, bookId })
  const [restore] = useRestoreAddressBookPeerMutation()
  const [purge] = usePurgeAddressBookPeerMutation()
  const [query, setQuery] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [purging, setPurging] = useState<AddressBookRecycleBinItem | null>(null)
  const [purgeBusy, setPurgeBusy] = useState(false)

  const search = useMemo(() => filterRecycle(items ?? [], query), [items, query])
  const loading = isLoading || (isFetching && items === undefined)

  async function restoreOne(item: AddressBookRecycleBinItem) {
    if (restoring) return
    setRestoring(item.peer_id)
    try {
      await restore({ orgId, bookId, peerId: item.peer_id }).unwrap()
      Toast.success(`已恢复 peer ${item.peer_id}`)
    } catch (err) {
      Toast.error(recycleError(err, 'restore'))
      const status = (err as { status?: number }).status
      // A full book and a row that just disappeared both leave this list stale.
      if (status === 400 || status === 404) void refetch()
    } finally {
      setRestoring(null)
    }
  }

  async function confirmPurge() {
    if (!purging || purgeBusy) return
    setPurgeBusy(true)
    try {
      await purge({ orgId, bookId, peerId: purging.peer_id }).unwrap()
      Toast.success(`已永久删除 peer ${purging.peer_id}`)
      setPurging(null)
    } catch (err) {
      Toast.error(recycleError(err, 'purge'))
      if ((err as { status?: number }).status === 404) {
        setPurging(null)
        void refetch()
      }
    } finally {
      setPurgeBusy(false)
    }
  }

  return (
    <>
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>
            {recycleError(error, 'list')}
            <div style={{ marginTop: 8 }}>
              <button className="btn outline sm" type="button" onClick={() => void refetch()}>
                重试
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载回收站…
            </div>
          </div>
        </div>
      ) : error && !items ? null : (items ?? []).length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="home-empty">
              <b>回收站为空</b>
              <div className="help">
                删除的 peer 会在这里保留 {RECYCLE_RETENTION_DAYS} 天，之后由后台清扫永久删除。
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="card-title">
              已删除的 peer
              <span className="hint">保留 {RECYCLE_RETENTION_DAYS} 天；永久删除不可恢复</span>
            </div>
            <div className="input" style={{ width: 220 }}>
              <input
                value={query}
                placeholder="搜索 peer id / 别名 / 主机名 / 标签"
                aria-label="搜索回收站"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="card-body tight" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Peer ID</th>
                  <th>别名 / 主机名</th>
                  <th style={{ width: 150 }}>标签</th>
                  <th style={{ width: 150 }}>删除于</th>
                  <th style={{ width: 130 }}>删除人</th>
                  <th style={{ width: 150 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {search.visible.map((item) => (
                  <tr key={item.peer_id} data-testid="recycle-row">
                    <td className="mono">{item.peer_id}</td>
                    <td className="cell-wrap">
                      <div>{item.alias || '—'}</div>
                      <div className="mono help">{item.hostname || '—'}</div>
                    </td>
                    <td>
                      {(item.tags ?? []).length === 0 ? (
                        '—'
                      ) : (
                        <span className="hstack" style={{ flexWrap: 'wrap', gap: 4 }}>
                          {(item.tags ?? []).map((tag) => (
                            <span key={tag} className="tag grey">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="mono">{formatTime(item.deleted_at)}</div>
                      <div className="help">{retentionText(item.deleted_at, new Date())}</div>
                    </td>
                    <td className="cell-wrap">{deletedByLabel(item.deleted_by, emails)}</td>
                    <td>
                      <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="btn borderless sm"
                          type="button"
                          disabled={restoring !== null}
                          data-testid="recycle-restore"
                          onClick={() => void restoreOne(item)}
                        >
                          {restoring === item.peer_id ? '恢复中…' : '恢复'}
                        </button>
                        <button
                          className="btn borderless sm"
                          type="button"
                          style={{ color: 'var(--danger)' }}
                          disabled={restoring !== null}
                          data-testid="recycle-purge"
                          onClick={() => setPurging(item)}
                        >
                          永久删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {search.truncated ? (
              <div className="help" style={{ marginTop: 8 }}>
                匹配 {search.matched} 个，仅显示前 {search.visible.length} 个；请用搜索缩小范围。
              </div>
            ) : null}
          </div>
        </div>
      )}

      {purging ? (
        <ConfirmDelete
          title="永久删除 peer"
          confirmLabel="永久删除"
          busy={purgeBusy}
          onClose={() => {
            if (!purgeBusy) setPurging(null)
          }}
          onConfirm={() => void confirmPurge()}
          body={
            <>
              即将永久删除 <b>{purging.peer_id}</b>（{purging.alias || '无别名'}）。
              <b>该操作不可恢复</b>，且不会增加地址簿的内容版本。
            </>
          }
        />
      ) : null}
    </>
  )
}
