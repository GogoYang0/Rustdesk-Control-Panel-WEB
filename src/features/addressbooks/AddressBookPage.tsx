import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import type { AddressBookPeer } from '../../lib/api'
import { PEER_LIMIT, addressBookError, canEditBook, filterPeers } from '../../lib/addressbook-form'
import {
  useDeleteAddressBookPeerMutation,
  useGetAddressBookQuery,
  useGetMeQuery,
  useGetMembersQuery,
  useGetUserGroupsQuery,
} from '../../store/api'
import { ConfirmDelete, PeerDialog } from './AddressBookDialogs'
import BookGrantsPanel from './BookGrantsPanel'

export default function AddressBookPage() {
  const { orgId, bookId } = useParams()
  const id = Number(orgId)
  const bid = Number(bookId)
  const validId = Number.isSafeInteger(bid) && bid > 0
  const navigate = useNavigate()

  const {
    currentData: book,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAddressBookQuery({ orgId: id, bookId: bid }, { skip: !validId || !id })
  const loading = isLoading || (isFetching && book === undefined)

  const { data: me } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const editable = book ? canEditBook(book, me?.user.id, perms) : false
  const canManageGroups = perms.has('access.manage')
  const [searchParams, setSearchParams] = useSearchParams()
  const showGrants = book?.scope === 'shared' && editable
  const tab: 'peers' | 'grants' =
    showGrants && searchParams.get('tab') === 'grants' ? 'grants' : 'peers'

  const { currentData: members } = useGetMembersQuery(id, { skip: !id || !showGrants })
  const { currentData: groups } = useGetUserGroupsQuery(id, { skip: !id || !canManageGroups })

  const emails = useMemo(() => {
    const map = new Map<number, string>()
    for (const member of members ?? []) map.set(member.user_id, member.email)
    return map
  }, [members])

  function switchTab(next: 'peers' | 'grants') {
    const params = new URLSearchParams(searchParams)
    if (next === 'grants') params.set('tab', 'grants')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AddressBookPeer | null>(null)
  const [deleting, setDeleting] = useState<AddressBookPeer | null>(null)
  const [busy, setBusy] = useState(false)
  const [removePeer] = useDeleteAddressBookPeerMutation()
  const searchRef = useRef<HTMLInputElement>(null)

  const search = useMemo(() => filterPeers(book?.peers ?? [], query), [book?.peers, query])

  if (!validId) {
    return <StateBlock code="404" title="地址簿不存在" description="地址簿 id 不合法。" />
  }

  async function confirmDeletePeer() {
    if (!deleting) return
    setBusy(true)
    try {
      await removePeer({ orgId: id, bookId: bid, peerId: deleting.peer_id }).unwrap()
      Toast.success(`已删除 peer ${deleting.peer_id}`)
      setDeleting(null)
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        Toast.error('该 peer 已不存在，已刷新')
        void refetch()
      } else {
        Toast.error(addressBookError(err))
      }
    } finally {
      setBusy(false)
      searchRef.current?.focus()
    }
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <button
            className="btn borderless sm"
            type="button"
            onClick={() => navigate(`/orgs/${id}/address-books`)}
          >
            ‹ 返回地址簿
          </button>
          <h1 className="page-title">{book?.name ?? '地址簿'}</h1>
          <div className="page-sub">
            {book ? (
              <>
                <span className="tag primary">{book.scope === 'personal' ? '个人' : '共享'}</span> ·{' '}
                {(book.peers ?? []).length} 个 peer · {(book.tags ?? []).length} 个标签 · 内容版本{' '}
                {book.revision}
              </>
            ) : (
              '正在读取…'
            )}
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="btn outline sm"
            type="button"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? '刷新中…' : '刷新'}
          </button>
          {tab === 'peers' ? (
            <button
              className="btn primary sm"
              type="button"
              disabled={!editable || !book || (book.peers?.length ?? 0) >= PEER_LIMIT}
              title={
                !editable
                  ? '没有该地址簿的写权限'
                  : (book?.peers?.length ?? 0) >= PEER_LIMIT
                    ? `最多 ${PEER_LIMIT} 个 peer`
                    : undefined
              }
              onClick={() => setAdding(true)}
            >
              添加 peer
            </button>
          ) : null}
        </div>
      </div>

      {showGrants ? (
        <div className="tabs" role="tablist" aria-label="地址簿视图">
          <button
            type="button"
            role="tab"
            id="book-tab-peers"
            aria-controls={tab === 'peers' ? 'book-tabpanel' : undefined}
            aria-selected={tab === 'peers'}
            className={`tab ${tab === 'peers' ? 'on' : ''}`}
            onClick={() => switchTab('peers')}
          >
            Peers
          </button>
          <button
            type="button"
            role="tab"
            id="book-tab-grants"
            aria-controls={tab === 'grants' ? 'book-tabpanel' : undefined}
            aria-selected={tab === 'grants'}
            className={`tab ${tab === 'grants' ? 'on' : ''}`}
            onClick={() => switchTab('grants')}
          >
            授权
          </button>
        </div>
      ) : null}

      {book && !editable ? (
        <div className="banner info mb-14">
          <div>
            当前为只读视图。共享簿的写操作需要 <code>addressbook.write</code>；如果你只持有该簿的{' '}
            <code>full</code> 授权而按钮不可用，请联系管理员授予该权限。
          </div>
        </div>
      ) : null}

      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`加载地址簿失败：${addressBookError(error)}`}
        />
      ) : null}

      <div
        role={showGrants ? 'tabpanel' : undefined}
        id={showGrants ? 'book-tabpanel' : undefined}
        aria-labelledby={showGrants ? `book-tab-${tab}` : undefined}
      >
        {tab === 'grants' && book ? (
          <BookGrantsPanel
            orgId={id}
            book={book}
            emails={emails}
            members={members ?? []}
            groups={groups ?? []}
            canManageGroups={canManageGroups}
          />
        ) : loading ? (
          <div className="card">
            <div className="card-body">
              <div className="help" role="status">
                正在加载 peers…
              </div>
            </div>
          </div>
        ) : error && !book ? null : (book?.peers ?? []).length === 0 ? (
          <div className="card">
            <div className="card-body">
              <Empty title="地址簿还没有 peer" description="添加 peer 后，客户端登录即可看到" />
            </div>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-head">
              <div className="card-title">
                Peers<span className="hint">按 peer id 排序；最多渲染 200 行</span>
              </div>
              <div className="input" style={{ width: 220 }}>
                <input
                  ref={searchRef}
                  value={query}
                  placeholder="搜索 peer id / 别名 / 主机名"
                  aria-label="搜索 peer"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="card-body tight" style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Peer ID</th>
                    <th>别名</th>
                    <th style={{ width: 160 }}>主机名</th>
                    <th style={{ width: 110 }}>平台</th>
                    <th style={{ width: 160 }}>标签</th>
                    <th style={{ width: 140 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {search.visible.map((peer) => (
                    <tr key={peer.peer_id}>
                      <td className="mono">{peer.peer_id}</td>
                      <td className="cell-wrap">{peer.alias || '—'}</td>
                      <td className="cell-wrap">{peer.hostname || '—'}</td>
                      <td>{peer.platform || '—'}</td>
                      <td>
                        {(peer.tags ?? []).length === 0 ? (
                          '—'
                        ) : (
                          <span className="hstack" style={{ flexWrap: 'wrap', gap: 4 }}>
                            {(peer.tags ?? []).map((tag) => (
                              <span key={tag} className="tag grey">
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="hstack" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="btn borderless sm"
                            type="button"
                            disabled={!editable}
                            onClick={() => setEditing(peer)}
                          >
                            编辑
                          </button>
                          <button
                            className="btn borderless sm"
                            type="button"
                            style={{ color: 'var(--danger)' }}
                            disabled={!editable}
                            onClick={() => setDeleting(peer)}
                          >
                            删除
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

        {tab === 'peers' ? (
          <p className="help" style={{ marginTop: 12 }}>
            保存 peers
            走「全量替换」：控制台会先读取最新内容并核对版本，版本变化时中止保存，避免覆盖他人的修改。
            删除单个 peer 使用独立端点，不会重写整本。
          </p>
        ) : null}
      </div>

      {tab === 'peers' && book && (adding || editing) ? (
        <PeerDialog
          key={editing ? `edit-${editing.peer_id}` : 'add'}
          orgId={id}
          book={book}
          peer={editing ?? undefined}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onDone={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      ) : null}

      {tab === 'peers' && deleting ? (
        <ConfirmDelete
          title="删除 peer"
          confirmLabel="删除"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDeletePeer()}
          body={
            <>
              即将从本地址簿删除 peer <b>{deleting.peer_id}</b>（{deleting.alias || '无别名'}）。
              该记录会进入服务端回收站，本版本控制台暂不提供恢复入口。
            </>
          }
        />
      ) : null}
    </section>
  )
}
