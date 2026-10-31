import { Toast } from '@douyinfe/semi-ui'
import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import type { MeOrg } from '../../lib/api'
import { renameOrg } from '../../lib/api'
import { orgNameProblem, ORG_NAME_MAX } from '../../lib/org-create'
import { patchOrgName, renameOrgError } from '../../lib/org-rename'
import type { AppDispatch } from '../../store'
import { panelApi } from '../../store/api'

interface Props {
  org: MeOrg
  onClose: () => void
}

export default function RenameOrgDialog({ org, onClose }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const [name, setName] = useState(org.name)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function submit() {
    if (busyRef.current) return
    const problem = orgNameProblem(name)
    if (problem) {
      setError(problem)
      return
    }
    const trimmed = name.trim()
    if (trimmed === org.name) {
      setError('新名称与当前名称相同')
      return
    }
    setError('')
    setSubmitting(true)
    busyRef.current = true
    try {
      const updated = await renameOrg(org.id, trimmed)
      if (!mountedRef.current) return
      // 200 carries only the organization; permissions are unchanged, so patch
      // the shell cache instead of refetching /me.
      dispatch(
        panelApi.util.updateQueryData('getMe', undefined, (draft) =>
          patchOrgName(draft, org.id, updated.name),
        ),
      )
      Toast.success(`已重命名为 ${updated.name}`)
      onClose()
    } catch (err) {
      if (mountedRef.current) setError(renameOrgError(err))
    } finally {
      busyRef.current = false
      if (mountedRef.current) setSubmitting(false)
    }
  }

  return (
    <Modal
      title="重命名组织"
      onClose={submitting ? () => undefined : onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={submitting} onClick={submit}>
            {submitting ? '保存中…' : '保存'}
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
        <label className="form-label" htmlFor="org-rename-name">
          <span className="req">*</span>组织名称
        </label>
        <div className="input">
          <input
            id="org-rename-name"
            value={name}
            aria-label="组织名称"
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
          改名会写入审计，并立即更新顶栏与组织切换器；供应容器与会话按组织 id 绑定，不受名称影响。
          组织名称可以重复。
        </div>
      </div>
    </Modal>
  )
}
