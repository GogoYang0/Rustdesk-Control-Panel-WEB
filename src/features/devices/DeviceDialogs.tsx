import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import Modal from '../../components/Modal'
import type { Device, Member } from '../../lib/api'
import { deviceWriteError } from '../../lib/device-errors'
import {
  useRebindDeviceMutation,
  useRegisterDeviceMutation,
  useRequestDeviceDisconnectMutation,
  useUpdateDeviceMutation,
} from '../../store/api'

interface DialogProps {
  orgId: number
  onClose: () => void
  onDone: () => void
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
      <div>{message}</div>
    </div>
  )
}

export function RegisterDialog({ orgId, onClose, onDone }: DialogProps) {
  const [name, setName] = useState('')
  const [rustdeskId, setRustdeskId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [register, { isLoading }] = useRegisterDeviceMutation()

  async function submit() {
    setError(null)
    if (!name.trim() || !rustdeskId.trim()) {
      setError('名称与 RustDesk ID 均为必填')
      return
    }
    try {
      await register({ orgId, name: name.trim(), rustdesk_id: rustdeskId.trim() }).unwrap()
      Toast.success(`已登记 ${name.trim()}（列表按 id 升序，新设备在末页）`)
      onDone()
    } catch (err) {
      setError(deviceWriteError(err))
    }
  }

  return (
    <Modal
      title="登记设备"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '登记中…' : '登记'}
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
            aria-label="名称"
            maxLength={128}
            placeholder="例如：财务部-设计机"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="help">展示用名称，可随时修改。</div>
      </div>
      <div className="field">
        <label className="form-label">
          <span className="req">*</span>RustDesk ID
        </label>
        <div className="input">
          <input
            value={rustdeskId}
            aria-label="RustDesk ID"
            maxLength={64}
            placeholder="客户端显示的 9 位 ID"
            onChange={(event) => setRustdeskId(event.target.value)}
          />
        </div>
        <div className="help">登记不产生绑定；设备首次用该 ID 登录后才完成认领。</div>
      </div>
    </Modal>
  )
}

export function ToggleDeviceDialog({
  orgId,
  device,
  onClose,
  onDone,
}: DialogProps & { device: Device }) {
  const next = !device.disabled
  const [error, setError] = useState<string | null>(null)
  const [update, { isLoading }] = useUpdateDeviceMutation()

  async function submit() {
    setError(null)
    try {
      await update({ orgId, deviceId: device.id, patch: { disabled: next } }).unwrap()
      Toast.success(next ? `已停用 ${device.name}` : `已恢复 ${device.name}`)
      onDone()
    } catch (err) {
      setError(deviceWriteError(err))
    }
  }

  return (
    <Modal
      title={next ? '停用设备' : '恢复设备'}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button
            className={`btn ${next ? 'danger' : 'primary'}`}
            type="button"
            disabled={isLoading}
            onClick={submit}
          >
            {isLoading ? '处理中…' : next ? '停用' : '恢复'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className={`banner ${next ? 'warning' : 'info'}`} style={{ padding: '10px 12px' }}>
        <div>
          {next ? (
            <>
              停用 <b>{device.name}</b> 会拒绝该设备的新认领、compat 登录、心跳与系统信息，
              并在同一事务撤销其活跃 compat 会话。历史（心跳、会话、审计）保留，可随时恢复。
            </>
          ) : (
            <>
              恢复 <b>{device.name}</b> 后，设备可重新被客户端认领与连接。
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function OwnerDialog({
  orgId,
  device,
  members,
  onClose,
  onDone,
}: DialogProps & { device: Device; members: Member[] }) {
  // A device can still be owned by a member who has since been disabled; that
  // member is not in the selectable list, and silently re-submitting the id
  // would 404. Force an explicit choice instead (empty saves as "no owner").
  const ownerMissing =
    Boolean(device.owner_user_id) &&
    !members.some((member) => member.user_id === device.owner_user_id)
  const [value, setValue] = useState(
    ownerMissing ? '' : device.owner_user_id ? String(device.owner_user_id) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [update, { isLoading }] = useUpdateDeviceMutation()

  async function submit() {
    setError(null)
    try {
      await update({
        orgId,
        deviceId: device.id,
        patch: { owner_user_id: value ? Number(value) : null },
      }).unwrap()
      Toast.success(value ? '已更新归属人' : '已清空归属')
      onDone()
    } catch (err) {
      setError(deviceWriteError(err))
    }
  }

  return (
    <Modal
      title="设备归属"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="help mb-14">
        设备：<b>{device.name}</b> · 当前归属 {device.owner_email ?? '未归属'}
      </div>
      <div className="field">
        <label className="form-label">归属人</label>
        <select
          className="select-native"
          aria-label="归属人"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="">{ownerMissing ? '请选择归属人（当前归属人不可用）' : '未归属'}</option>
          {members.map((member) => (
            <option key={member.user_id} value={String(member.user_id)}>
              {member.email}
            </option>
          ))}
        </select>
        {ownerMissing ? (
          <div className="help" style={{ color: 'var(--warning)' }}>
            当前归属人已停用或不在成员列表；不重新选择将清空归属。
          </div>
        ) : (
          <div className="help">
            归属是持久授权：归属人始终能在自己的客户端看到并连接该设备（设备或会籍停用除外）。
          </div>
        )}
      </div>
    </Modal>
  )
}

export function NoteDialog({ orgId, device, onClose, onDone }: DialogProps & { device: Device }) {
  const [note, setNote] = useState(device.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [update, { isLoading }] = useUpdateDeviceMutation()

  async function submit() {
    setError(null)
    try {
      await update({
        orgId,
        deviceId: device.id,
        patch: { note: note.trim() ? note.trim() : null },
      }).unwrap()
      Toast.success('备注已保存')
      onDone()
    } catch (err) {
      setError(deviceWriteError(err))
    }
  }

  return (
    <Modal
      title="运维备注"
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="field">
        <label className="form-label">备注</label>
        <textarea
          className="textarea"
          aria-label="备注"
          value={note}
          maxLength={255}
          placeholder="例如：会议室一体机，负责人张三"
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="help">{note.length} / 255 · 留空即清空备注</div>
      </div>
    </Modal>
  )
}

export function ReasonDialog({
  orgId,
  device,
  action,
  onClose,
  onDone,
}: DialogProps & { device: Device; action: 'rebind' | 'disconnect' }) {
  const config =
    action === 'rebind'
      ? {
          title: '重置设备绑定',
          limit: 500,
          confirm: '重置绑定',
          success: '已重置绑定，旧客户端需重新认领',
          text: (
            <>
              将清空 <b>{device.name}</b> 的绑定并把绑定代数 +1；此前登录并认领该设备的客户端
              立即失去驱动能力（心跳与系统信息被丢弃）。重复调用是安全的。
            </>
          ),
        }
      : {
          title: '请求断开连接',
          limit: 255,
          confirm: '提交请求',
          success: '已记录断连请求，客户端下次心跳生效',
          text: (
            <>
              <b>不会立即断线</b>：请求由客户端下次心跳消费（≤30 秒 + 处理时间）。客户端当时
              没有活跃连接时请求保持 pending，15 分钟未消费则过期；同一设备已有 pending 请求会 返回
              409。请求本身不构成「已断开」的证据。
            </>
          ),
        }

  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rebind, rebindState] = useRebindDeviceMutation()
  const [disconnect, disconnectState] = useRequestDeviceDisconnectMutation()
  const isLoading = action === 'rebind' ? rebindState.isLoading : disconnectState.isLoading

  async function submit() {
    setError(null)
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('请填写理由')
      return
    }
    try {
      if (action === 'rebind') {
        await rebind({ orgId, deviceId: device.id, reason: trimmed }).unwrap()
      } else {
        await disconnect({ orgId, deviceId: device.id, reason: trimmed }).unwrap()
      }
      Toast.success(config.success)
      onDone()
    } catch (err) {
      setError(deviceWriteError(err, action === 'disconnect' ? 'disconnect' : undefined))
    }
  }

  return (
    <Modal
      title={config.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn tertiary" type="button" disabled={isLoading} onClick={onClose}>
            取消
          </button>
          <button className="btn danger" type="button" disabled={isLoading} onClick={submit}>
            {isLoading ? '提交中…' : config.confirm}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="banner warning mb-14" style={{ padding: '10px 12px' }}>
        <div>{config.text}</div>
      </div>
      <div className="field">
        <label className="form-label">
          <span className="req">*</span>理由
        </label>
        <textarea
          className="textarea"
          aria-label="理由"
          value={reason}
          maxLength={config.limit}
          placeholder="写入审计，供事后追溯"
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="help">
          {reason.length} / {config.limit}
        </div>
      </div>
    </Modal>
  )
}
