import { Banner, Empty, Toast } from '@douyinfe/semi-ui'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import type { AddressBook } from '../../lib/api'
import { addressBookError, canEditBook, groupBooks } from '../../lib/addressbook-form'
import { formatTime } from '../../lib/format'
import {
  useDeleteAddressBookMutation,
  useGetAddressBooksQuery,
  useGetMeQuery,
} from '../../store/api'
import { BookDialog, ConfirmDelete } from './AddressBookDialogs'

export default function AddressBooksPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const navigate = useNavigate()
  const {
    currentData: books,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetAddressBooksQuery(id, { skip: !id })
  const loading = isLoading || (isFetching && books === undefined)

  const { data: me } = useGetMeQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const perms = useMemo(() => new Set(current?.permissions ?? []), [current])
  const canCreateShared = perms.has('addressbook.write')

  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<AddressBook | null>(null)
  const [deleting, setDeleting] = useState<AddressBook | null>(null)
  const [busy, setBusy] = useState(false)
  const [remove] = useDeleteAddressBookMutation()

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const visible = (books ?? []).filter((book) => book.name.toLowerCase().includes(needle))
    return groupBooks(visible)
  }, [books, query])

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await remove({ orgId: id, bookId: deleting.id }).unwrap()
      Toast.success(`已删除 ${deleting.name}`)
      setDeleting(null)
    } catch (err) {
      Toast.error(addressBookError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">地址簿</h1>
          <div className="page-sub">
            共 {(books ?? []).length} 本 · 个人簿仅自己可见；共享簿对组织成员可读
          </div>
        </div>
        <div className="spacer" />
        <div className="head-actions">
          <button className="btn outline sm" type="button" onClick={() => void refetch()}>
            刷新
          </button>
          <button className="btn primary sm" type="button" onClick={() => setCreating(true)}>
            新建地址簿
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="input" style={{ width: 260 }}>
          <input
            value={query}
            placeholder="搜索地址簿名称"
            aria-label="搜索地址簿"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="spacer" />
        <span className="help">按名称排序；共享簿写操作需要 addressbook.write</span>
      </div>

      {error ? (
        <Banner
          type="danger"
          closeIcon={null}
          description={`加载地址簿失败：${addressBookError(error)}`}
        />
      ) : null}

      {loading ? (
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载地址簿…
            </div>
          </div>
        </div>
      ) : error && !books ? null : (books ?? []).length === 0 ? (
        <div className="card">
          <div className="card-body">
            <Empty title="还没有地址簿" description="新建一本个人或共享地址簿开始整理设备" />
          </div>
        </div>
      ) : groups.personal.length === 0 && groups.shared.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <Empty title="没有匹配的地址簿" description="换个关键词再试" />
          </div>
        </div>
      ) : (
        <>
          <BookGroup
            title="我的地址簿"
            hint="仅自己可见"
            books={groups.personal}
            me={me?.user.id}
            perms={perms}
            onOpen={(book) => navigate(`/orgs/${id}/address-books/${book.id}`)}
            onRename={setRenaming}
            onDelete={setDeleting}
          />
          <BookGroup
            title="共享地址簿"
            hint="组织成员可读"
            books={groups.shared}
            me={me?.user.id}
            perms={perms}
            onOpen={(book) => navigate(`/orgs/${id}/address-books/${book.id}`)}
            onRename={setRenaming}
            onDelete={setDeleting}
          />
        </>
      )}

      <p className="help" style={{ marginTop: 12 }}>
        共享簿的 peers
        用「全量替换」保存：多人同时编辑时以最后保存者为准；控制台会在保存前校验内容版本。
        若你只持有某共享簿的 full 授权而按钮不可用，请管理员授予 addressbook.write。
      </p>

      {creating || renaming ? (
        <BookDialog
          orgId={id}
          book={renaming ?? undefined}
          canCreateShared={canCreateShared}
          onClose={() => {
            setCreating(false)
            setRenaming(null)
          }}
          onDone={() => {
            setCreating(false)
            setRenaming(null)
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDelete
          title="删除地址簿"
          confirmLabel="删除"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
          body={
            <>
              即将删除 <b>{deleting.name}</b>。该簿的全部 peers 与标签会一并删除，<b>不可恢复</b>。
            </>
          }
        />
      ) : null}
    </section>
  )
}

function BookGroup({
  title,
  hint,
  books,
  me,
  perms,
  onOpen,
  onRename,
  onDelete,
}: {
  title: string
  hint: string
  books: AddressBook[]
  me?: number
  perms: Set<string>
  onOpen: (book: AddressBook) => void
  onRename: (book: AddressBook) => void
  onDelete: (book: AddressBook) => void
}) {
  if (books.length === 0) return null
  return (
    <div className="mb-14">
      <div className="card-title" style={{ marginBottom: 10 }}>
        {title}
        <span className="hint">{hint}</span>
      </div>
      <div className="grid-2">
        {books.map((book) => {
          const editable = canEditBook(book, me, perms)
          return (
            <div className="card" key={book.id}>
              <div className="card-head">
                <div className="card-title" style={{ minWidth: 0 }}>
                  <span className="cell-wrap">{book.name}</span>
                  <span className="tag primary">{book.scope === 'personal' ? '个人' : '共享'}</span>
                </div>
                <span className="help mono">#{book.id}</span>
              </div>
              <div className="card-body">
                <dl className="desc" style={{ gridTemplateColumns: '84px 1fr' }}>
                  <dt>Peers</dt>
                  <dd>{book.peers?.length ?? 0} 个</dd>
                  <dt>标签</dt>
                  <dd>{book.tags?.length ?? 0} 个</dd>
                  <dt>更新于</dt>
                  <dd className="mono">{formatTime(book.updated_at)}</dd>
                </dl>
                <div className="row-end">
                  <button className="btn outline sm" type="button" onClick={() => onOpen(book)}>
                    打开
                  </button>
                  <button
                    className="btn outline sm"
                    type="button"
                    disabled={!editable}
                    title={editable ? undefined : '没有该地址簿的写权限'}
                    onClick={() => onRename(book)}
                  >
                    重命名
                  </button>
                  <button
                    className="btn danger sm"
                    type="button"
                    disabled={!editable}
                    title={editable ? undefined : '没有该地址簿的写权限'}
                    onClick={() => onDelete(book)}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
