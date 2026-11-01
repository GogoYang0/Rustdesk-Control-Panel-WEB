import { Toast } from '@douyinfe/semi-ui'
import { useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router'

import Modal from '../../components/Modal'
import type { MeOrg } from '../../lib/api'
import { fetchMe } from '../../lib/api'
import { orgDeleteError, removeOrgFromMe } from '../../lib/org-delete'
import type { AppDispatch } from '../../store'
import { panelApi, useDeleteOrgMutation } from '../../store/api'

export default function DeleteOrgDialog({ org, onClose }: { org: MeOrg; onClose: () => void }) {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [remove] = useDeleteOrgMutation()

  async function submit() {
    if (busyRef.current) return
    if (confirm.trim() !== org.name) {
      setError('输入的组织名称与当前名称不一致')
      return
    }
    setError('')
    setBusy(true)
    busyRef.current = true
    try {
      await remove({ orgId: org.id, confirmName: confirm.trim() }).unwrap()
      dispatch(
        panelApi.util.updateQueryData('getMe', undefined, (draft) =>
          removeOrgFromMe(draft, org.id),
        ),
      )
      Toast.success(`已删除组织 ${org.name}`)
      // Reconcile with the server after the immediate local removal; a failed
      // refresh must not block navigation away from the deleted tenant.
      void fetchMe()
        .then((fresh) => dispatch(panelApi.util.updateQueryData('getMe', undefined, () => fresh)))
        .catch(() => undefined)
      navigate('/')
      onClose()
    } catch (err) {
      setError(orgDeleteError(err))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      title="删除组织"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="btn danger solid" type="button" disabled={busy} onClick={submit}>
            {busy ? '删除中…' : '删除组织'}
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
          将删除 <b>{org.name}</b>{' '}
          并清理其服务器容器。所有成员会立即失去访问权限，待接受邀请与票据失效；
          设备、会话、日志与审计历史会保留，后续由运维物理清理。此操作不能从控制台恢复。
        </div>
      </div>
      <div className="field">
        <label className="form-label" htmlFor="org-delete-confirm">
          <span className="req">*</span>输入组织名称确认
        </label>
        <div className="input">
          <input
            id="org-delete-confirm"
            value={confirm}
            aria-label="确认组织名称"
            placeholder={org.name}
            onChange={(event) => {
              setConfirm(event.target.value)
              if (error) setError('')
            }}
          />
        </div>
        <div className="help">必须与「{org.name}」完全一致。</div>
      </div>
    </Modal>
  )
}
