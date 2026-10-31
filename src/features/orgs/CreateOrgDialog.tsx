import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import type { Org } from '../../lib/api'
import { createOrg, fetchMe } from '../../lib/api'
import { createOrgError, orgNameProblem, ORG_NAME_MAX } from '../../lib/org-create'
import type { AppDispatch } from '../../store'
import { panelApi } from '../../store/api'

interface Props {
  onClose: () => void
  onCreated: (org: Org) => void
}

export default function CreateOrgDialog({ onClose, onCreated }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<Org | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function refreshMe(org: Org) {
    setRefreshing(true)
    setRefreshError('')
    try {
      const fresh = await fetchMe()
      if (!mountedRef.current) return
      if (!fresh.orgs.some((item) => item.id === org.id)) {
        setRefreshError('组织已创建，但组织列表尚未包含该组织，请重试')
        return
      }
      // 201 carries no role/permission fields; only a fresh /me may update the
      // shell's authorization cache.
      dispatch(panelApi.util.updateQueryData('getMe', undefined, () => fresh))
      Toast.success(`已创建组织 ${org.name}`)
      onCreated(org)
    } catch {
      if (mountedRef.current) setRefreshError('组织已创建，但组织列表刷新失败')
    } finally {
      if (mountedRef.current) setRefreshing(false)
    }
  }

  async function submit() {
    if (busyRef.current) return
    const problem = orgNameProblem(name)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setSubmitting(true)
    busyRef.current = true
    try {
      const org = await createOrg(name.trim())
      if (!mountedRef.current) return
      setCreated(org)
      await refreshMe(org)
    } catch (err) {
      if (mountedRef.current) setError(createOrgError(err))
    } finally {
      busyRef.current = false
      if (mountedRef.current) setSubmitting(false)
    }
  }

  const locked = submitting || refreshing
  const close = locked
    ? () => undefined
    : () => {
        // The org exists but /me may still be stale; make the shell refetch so
        // the old organization list cannot invite a duplicate creation.
        if (created) dispatch(panelApi.util.invalidateTags(['Me']))
        onClose()
      }

  if (created) {
    return (
      <Modal
        title="组织已创建"
        onClose={close}
        footer={
          <>
            {refreshError ? (
              <button
                className="btn outline"
                type="button"
                disabled={refreshing}
                onClick={() => void refreshMe(created)}
              >
                重试刷新
              </button>
            ) : null}
            <button className="btn primary" type="button" disabled={refreshing} onClick={close}>
              关闭
            </button>
          </>
        }
      >
        <div className="banner info mb-14" style={{ padding: '9px 11px' }}>
          <div>
            已创建 <b>{created.name}</b>（#{created.id}）；你自动成为该组织的 Owner。
          </div>
        </div>
        {refreshError ? (
          <div className="banner warning" role="alert" style={{ padding: '9px 11px' }}>
            <div>{refreshError}。组织已经创建，请不要重复提交；刷新成功后会进入新组织。</div>
          </div>
        ) : (
          <div className="help" role="status">
            正在刷新组织列表…
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="创建组织"
      onClose={close}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={submitting} onClick={close}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={submitting} onClick={submit}>
            {submitting ? '创建中…' : '创建组织'}
          </button>
        </>
      }
    >
      {error ? (
        <div className="banner danger mb-14" role="alert" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      <div className="field mb-14">
        <label className="form-label" htmlFor="org-name">
          <span className="req">*</span>组织名称
        </label>
        <div className="input">
          <input
            id="org-name"
            value={name}
            aria-label="组织名称"
            placeholder="例如：北辰医疗"
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError('')
            }}
          />
        </div>
        <div className="help" style={{ textAlign: 'right' }}>
          {[...name].length}/{ORG_NAME_MAX}
        </div>
      </div>
      <div className="banner info" style={{ padding: '9px 11px' }}>
        <div>
          创建后你自动成为该组织的 <b>Owner</b>
          ；每个组织的设备、策略、审批、告警与日志作用域完全独立。 组织名称可以重复。
        </div>
      </div>
    </Modal>
  )
}
