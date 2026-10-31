import { Toast } from '@douyinfe/semi-ui'
import { useRef, useState } from 'react'

import Modal from '../../components/Modal'
import type { AddressBook } from '../../lib/api'
import { addressBookError, revisionChanged } from '../../lib/addressbook-form'
import { colorToHex, hexToColor, tagRowsProblem, type TagRow } from '../../lib/addressbook-tags'
import { useGetAddressBookQuery, useReplaceAddressBookTagsMutation } from '../../store/api'

interface Props {
  orgId: number
  book: AddressBook
  onClose: () => void
  onDone: () => void
}

interface EditRow extends TagRow {
  id: number
}

export default function BookTagsDialog({ orgId, book, onClose, onDone }: Props) {
  const nextId = useRef(book.tags?.length ?? 0)
  // Freeze the opened baseline: the first failed save refreshes the shared book
  // query, so comparing against the live `book.revision` would let the second
  // click overwrite whatever changed in between.
  const [baselineRevision] = useState(book.revision)
  const [rows, setRows] = useState<EditRow[]>(() =>
    (book.tags ?? []).map((tag, index) => ({
      id: index,
      name: tag.name,
      color: tag.color ?? 0,
    })),
  )
  const [error, setError] = useState('')
  const [replace, { isLoading }] = useReplaceAddressBookTagsMutation()
  const {
    currentData: latest,
    isFetching,
    error: readError,
    refetch,
  } = useGetAddressBookQuery({ orgId, bookId: book.id }, { refetchOnMountOrArgChange: true })

  function patch(index: number, next: Partial<TagRow>) {
    setRows((previous) =>
      previous.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)),
    )
    if (error) setError('')
  }

  function remove(index: number) {
    setRows((previous) => previous.filter((_, rowIndex) => rowIndex !== index))
    if (error) setError('')
  }

  async function submit() {
    if (isLoading || isFetching) return
    const problem = tagRowsProblem(rows)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    try {
      const result = await refetch()
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
      const tags = rows.map((row) => ({ name: row.name.trim(), color: row.color }))
      await replace({ orgId, bookId: book.id, tags }).unwrap()
      Toast.success('标签已保存')
      onDone()
    } catch (err) {
      setError(addressBookError(err))
    }
  }

  return (
    <Modal
      title="管理标签"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={isLoading || isFetching || (!latest && !readError)}
            onClick={submit}
          >
            {isLoading ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
        <div>
          保存会整体替换标签目录。移除或改名<b>不会改动联系人上的同名标签</b>
          ；这些标签会显示为「未定义」， 需要在 peer 编辑里单独移除或改选。
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="help" style={{ marginBottom: 12 }}>
          还没有标签。添加后可在 peer 编辑中勾选。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, index) => (
            <div className="hstack" key={row.id} style={{ gap: 8 }}>
              <div className="input" style={{ flex: 1 }}>
                <input
                  value={row.name}
                  maxLength={64}
                  aria-label={`标签名称 ${index + 1}`}
                  placeholder="标签名称"
                  onChange={(event) => patch(index, { name: event.target.value })}
                />
              </div>
              <input
                type="color"
                aria-label={`标签颜色 ${index + 1}`}
                value={colorToHex(row.color)}
                style={{ width: 44, height: 32, padding: 2, border: 'none', background: 'none' }}
                onChange={(event) => patch(index, { color: hexToColor(event.target.value) ?? 0 })}
              />
              <button
                className="btn borderless sm"
                type="button"
                style={{ color: 'var(--danger)' }}
                onClick={() => remove(index)}
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="row-end" style={{ marginTop: 12 }}>
        <button
          className="btn outline sm"
          type="button"
          disabled={rows.length >= 256}
          onClick={() =>
            setRows((previous) => [...previous, { id: nextId.current++, name: '', color: 0 }])
          }
        >
          添加标签
        </button>
      </div>
      <div className="help" style={{ marginTop: 8 }}>
        最多 256 个标签，名称 1–64 个字符且不可重复；颜色 0 表示默认灰。
      </div>
    </Modal>
  )
}
