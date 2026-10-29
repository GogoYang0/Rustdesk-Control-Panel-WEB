import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import Modal from '../../components/Modal'
import type { AddressBook, AddressBookPeer } from '../../lib/api'
import {
  PEER_LIMIT,
  addressBookError,
  buildReplacePayload,
  formToPeer,
  peerToForm,
  revisionChanged,
  validatePeerForm,
  type PeerForm,
} from '../../lib/addressbook-form'
import {
  useCreateAddressBookMutation,
  useGetAddressBookQuery,
  useReplaceAddressBookPeersMutation,
  useUpdateAddressBookMutation,
} from '../../store/api'

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
      <div>{message}</div>
    </div>
  )
}

export function BookDialog({
  orgId,
  book,
  canCreateShared,
  onClose,
  onDone,
}: {
  orgId: number
  /** Absent = create. */
  book?: AddressBook
  canCreateShared: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(book?.name ?? '')
  const [scope, setScope] = useState<'personal' | 'shared'>('personal')
  const [error, setError] = useState<string | null>(null)
  const [create, createState] = useCreateAddressBookMutation()
  const [rename, renameState] = useUpdateAddressBookMutation()
  const busy = createState.isLoading || renameState.isLoading

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请填写地址簿名称')
      return
    }
    if (trimmed.length > 128) {
      setError('名称最多 128 个字符')
      return
    }
    setError(null)
    try {
      if (book) {
        await rename({ orgId, bookId: book.id, name: trimmed }).unwrap()
        Toast.success('地址簿已重命名')
      } else {
        await create({ orgId, name: trimmed, scope }).unwrap()
        Toast.success('地址簿已创建')
      }
      onDone()
    } catch (err) {
      setError(addressBookError(err))
    }
  }

  return (
    <Modal
      title={book ? '重命名地址簿' : '新建地址簿'}
      onClose={onClose}
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
      <ErrorBanner message={error} />
      <div className="field mb-14">
        <label className="form-label">
          <span className="req">*</span>名称
        </label>
        <div className="input">
          <input
            value={name}
            maxLength={128}
            aria-label="地址簿名称"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="help">个人簿与共享簿可以同名。</div>
      </div>
      {!book ? (
        <div className="field">
          <label className="form-label">范围</label>
          <div className="chips" role="group" aria-label="地址簿范围" style={{ margin: 0 }}>
            <button
              type="button"
              className={`chip-btn ${scope === 'personal' ? 'on' : ''}`}
              aria-pressed={scope === 'personal'}
              onClick={() => setScope('personal')}
            >
              个人
            </button>
            <button
              type="button"
              className={`chip-btn ${scope === 'shared' ? 'on' : ''}`}
              aria-pressed={scope === 'shared'}
              disabled={!canCreateShared}
              title={canCreateShared ? undefined : '需要 addressbook.write 权限'}
              onClick={() => setScope('shared')}
            >
              共享
            </button>
          </div>
          <div className="help">
            个人簿只有你可见；共享簿对组织成员可读，写操作需要 addressbook.write。
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

export function PeerDialog({
  orgId,
  book,
  peer,
  onClose,
  onDone,
}: {
  orgId: number
  book: AddressBook
  /** Absent = add. */
  peer?: AddressBookPeer
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState<PeerForm>(() => peerToForm(peer))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [replace, { isLoading }] = useReplaceAddressBookPeersMutation()
  // The baseline is the revision the form was built from. The page owns the
  // same query key and refreshes it, so `book.revision` can move while this
  // dialog is open; comparing against it would let a second click overwrite
  // the change that aborted the first.
  const [baselineRevision] = useState(book.revision)
  // This read is repeated right before the replacement.
  const {
    currentData: latest,
    isFetching,
    error: readError,
    refetch,
  } = useGetAddressBookQuery({ orgId, bookId: book.id }, { refetchOnMountOrArgChange: true })

  function patch(next: Partial<PeerForm>) {
    setForm((prev) => ({ ...prev, ...next }))
    setErrors((prev) => {
      const copy = { ...prev }
      for (const key of Object.keys(next)) delete copy[key]
      return copy
    })
  }

  async function submit() {
    const nextErrors = validatePeerForm(form, latest?.peers ?? book.peers ?? [], peer?.peer_id)
    setErrors(nextErrors)
    setError(null)
    if (Object.keys(nextErrors).length > 0) return
    try {
      const result = await refetch()
      // A failed refetch resolves with the previous cache entry; trusting it
      // would replace the live list with a stale snapshot.
      if (result.isError || result.error) {
        setError('无法读取地址簿最新内容，请稍后重试')
        return
      }
      const fresh = result.data
      if (!fresh) {
        setError(readError ? addressBookError(readError) : '无法读取地址簿最新内容，请稍后重试')
        return
      }
      if (revisionChanged(baselineRevision, fresh.revision)) {
        setError('地址簿已被他人修改，请关闭后重新打开再保存')
        return
      }
      const freshPeers = fresh.peers ?? []
      if (peer && !freshPeers.some((item) => item.peer_id === peer.peer_id)) {
        setError('该 peer 已被他人删除，请刷新后重试')
        return
      }
      const nextPeer = formToPeer(form, peer?.tags)
      const peers = buildReplacePayload(
        freshPeers,
        peer
          ? { kind: 'edit', peerId: peer.peer_id, peer: nextPeer }
          : { kind: 'add', peer: nextPeer },
      )
      await replace({ orgId, bookId: book.id, peers }).unwrap()
      Toast.success(peer ? 'peer 已更新' : 'peer 已添加')
      onDone()
    } catch (err) {
      setError(err instanceof RangeError ? err.message : addressBookError(err))
    }
  }

  const atLimit = (latest?.peers ?? book.peers ?? []).length >= PEER_LIMIT

  return (
    <Modal
      title={peer ? '编辑 peer' : '添加 peer'}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={isLoading || isFetching || (!latest && !readError) || (!peer && atLimit)}
            onClick={submit}
          >
            {isLoading ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      {!peer && atLimit ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>该地址簿已有 {PEER_LIMIT} 个 peer，达到上限，无法继续添加。</div>
        </div>
      ) : null}
      <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
        <div>
          保存会用本次结果替换<b>整本 peers</b>；若期间有其他修改，会要求你重新打开再保存。
        </div>
      </div>
      <div className="field mb-14">
        <label className="form-label">
          <span className="req">*</span>Peer ID
        </label>
        <div className="input">
          <input
            value={form.peerId}
            maxLength={64}
            disabled={Boolean(peer)}
            aria-label="Peer ID"
            onChange={(event) => patch({ peerId: event.target.value })}
          />
        </div>
        {errors.peerId ? <div className="help err">{errors.peerId}</div> : null}
        <div className="help">编辑时不可修改 peer id；如需更换请删除后重新添加。</div>
      </div>
      <div className="field mb-14">
        <label className="form-label">别名</label>
        <div className="input">
          <input
            value={form.alias}
            maxLength={128}
            aria-label="别名"
            onChange={(event) => patch({ alias: event.target.value })}
          />
        </div>
        {errors.alias ? <div className="help err">{errors.alias}</div> : null}
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="form-label">用户名</label>
          <div className="input">
            <input
              value={form.username}
              maxLength={128}
              aria-label="用户名"
              onChange={(event) => patch({ username: event.target.value })}
            />
          </div>
          {errors.username ? <div className="help err">{errors.username}</div> : null}
        </div>
        <div className="field">
          <label className="form-label">主机名</label>
          <div className="input">
            <input
              value={form.hostname}
              maxLength={128}
              aria-label="主机名"
              onChange={(event) => patch({ hostname: event.target.value })}
            />
          </div>
          {errors.hostname ? <div className="help err">{errors.hostname}</div> : null}
        </div>
      </div>
      <div className="field mt-14">
        <label className="form-label">平台</label>
        <div className="input">
          <input
            value={form.platform}
            maxLength={64}
            aria-label="平台"
            onChange={(event) => patch({ platform: event.target.value })}
          />
        </div>
        {errors.platform ? <div className="help err">{errors.platform}</div> : null}
      </div>
    </Modal>
  )
}

export function ConfirmDelete({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="btn danger" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="banner warning" style={{ padding: '10px 12px' }}>
        <div>{body}</div>
      </div>
    </Modal>
  )
}
