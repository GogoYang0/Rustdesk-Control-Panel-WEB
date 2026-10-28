import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'

import Modal from '../../components/Modal'
import type { Policy } from '../../lib/api'
import { policyWriteError } from '../../lib/policy-errors'
import {
  applyFormPatch,
  currentOffsetEast,
  emptyPolicyForm,
  formatMinute,
  formatOffset,
  parseTimeValue,
  policyToForm,
  toPolicyRequest,
  validatePolicyForm,
  type PolicyForm,
} from '../../lib/policy-form'
import { useCreatePolicyMutation, useUpdatePolicyMutation } from '../../store/api'

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

export default function PolicyDialog({
  orgId,
  policy,
  onClose,
  onDone,
}: {
  orgId: number
  /** Absent = create. */
  policy?: Policy
  onClose: () => void
  onDone: () => void
}) {
  const offset = currentOffsetEast()
  const [form, setForm] = useState<PolicyForm>(() =>
    policy ? policyToForm(policy, offset) : emptyPolicyForm(),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [create, createState] = useCreatePolicyMutation()
  const [update, updateState] = useUpdatePolicyMutation()
  const busy = createState.isLoading || updateState.isLoading

  function patch(next: Partial<PolicyForm>) {
    setForm((prev) => applyFormPatch(prev, next))
    // Clear only the messages the edited fields own, so a stale error does not
    // sit next to a value that already changed.
    setErrors((prev) => {
      const copy = { ...prev }
      for (const key of Object.keys(next)) {
        if (key === 'name') delete copy.name
        if (key === 'startMinute' || key === 'endMinute' || key === 'allDay') delete copy.window
        if (key === 'maxConcurrent' || key === 'noConcurrencyLimit') delete copy.maxConcurrent
        if (key === 'maxSessionMinutes' || key === 'noDurationLimit') delete copy.maxSessionMinutes
      }
      return copy
    })
  }

  async function submit() {
    const nextErrors = validatePolicyForm(form)
    setErrors(nextErrors)
    setError(null)
    if (Object.keys(nextErrors).length > 0) return
    try {
      const request = toPolicyRequest(form, offset)
      if (policy) {
        await update({ orgId, policyId: policy.id, input: request }).unwrap()
        Toast.success('策略已更新')
      } else {
        await create({ orgId, input: request }).unwrap()
        Toast.success('策略已创建')
      }
      onDone()
    } catch (err) {
      setError(policyWriteError(err))
    }
  }

  return (
    <Modal
      title={policy ? '编辑策略' : '新建策略'}
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
      {error ? (
        <div className="banner danger mb-14" style={{ padding: '9px 11px' }}>
          <div>{error}</div>
        </div>
      ) : null}
      {form.windowIncomplete ? (
        <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
          <div>
            该策略的时段只有一端有值，服务端按「完全禁止」处理；保存前请重新设置完整时段或改为全天。
          </div>
        </div>
      ) : null}

      <div className="field mb-14">
        <label className="form-label">
          <span className="req">*</span>名称
        </label>
        <div className="input">
          <input
            value={form.name}
            maxLength={128}
            aria-label="策略名称"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'policy-name-error' : undefined}
            placeholder="例如：工作日 9-18 点"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>
        {errors.name ? (
          <div className="help err" id="policy-name-error">
            {errors.name}
          </div>
        ) : null}
        <div className="help">同一组织内名称唯一。</div>
      </div>

      <div className="field mb-14">
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <label className="form-label">启用</label>
          <span className="hstack" style={{ gap: 8 }}>
            <span className="help">{form.enabled ? '启用中' : '已停用'}</span>
            <Toggle
              checked={form.enabled}
              onChange={(next) => patch({ enabled: next })}
              label="启用策略"
            />
          </span>
        </div>
        <div className="help">保存后立即按此状态生效；停用的策略不参与评估。</div>
      </div>

      <div className="field mb-14">
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <label className="form-label">允许时段</label>
          <span className="hstack" style={{ gap: 8 }}>
            <span className="help">全天</span>
            <Toggle
              checked={form.allDay}
              onChange={(next) => patch({ allDay: next })}
              label="全天允许"
            />
          </span>
        </div>
        {form.allDay ? (
          <div className="help">全天允许连接。</div>
        ) : (
          <div className="hstack" style={{ gap: 8 }}>
            <input
              className="input-time"
              type="time"
              aria-label="允许时段开始"
              aria-invalid={Boolean(errors.window)}
              aria-describedby={errors.window ? 'policy-window-error' : undefined}
              value={formatMinute(form.startMinute)}
              onChange={(event) => {
                const next = parseTimeValue(event.target.value)
                if (next !== null) patch({ startMinute: next })
              }}
            />
            <span className="help">至</span>
            <input
              className="input-time"
              type="time"
              aria-label="允许时段结束"
              aria-invalid={Boolean(errors.window)}
              aria-describedby={errors.window ? 'policy-window-error' : undefined}
              value={formatMinute(form.endMinute)}
              onChange={(event) => {
                const next = parseTimeValue(event.target.value)
                if (next !== null) patch({ endMinute: next })
              }}
            />
            <span className="help">跨零点：让开始晚于结束</span>
          </div>
        )}
        {errors.window ? (
          <div className="help err" id="policy-window-error">
            {errors.window}
          </div>
        ) : null}
        <div className="help">
          按本地时区（{formatOffset(offset)}）编辑，服务端按 UTC 分钟保存与评估。
        </div>
      </div>

      <div className="field mb-14">
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <label className="form-label">并发会话上限</label>
          <span className="hstack" style={{ gap: 8 }}>
            <span className="help">不限</span>
            <Toggle
              checked={form.noConcurrencyLimit}
              onChange={(next) => patch({ noConcurrencyLimit: next })}
              label="并发不限"
            />
          </span>
        </div>
        {form.noConcurrencyLimit ? null : (
          <div className="input" style={{ width: 140 }}>
            <input
              type="number"
              min={1}
              aria-label="并发会话上限"
              aria-invalid={Boolean(errors.maxConcurrent)}
              aria-describedby={errors.maxConcurrent ? 'policy-concurrency-error' : undefined}
              value={form.maxConcurrent}
              onChange={(event) => patch({ maxConcurrent: event.target.value })}
            />
          </div>
        )}
        {errors.maxConcurrent ? (
          <div className="help err" id="policy-concurrency-error">
            {errors.maxConcurrent}
          </div>
        ) : null}
        <div className="help">只统计进行中且由面板签发的会话；native 只告警不阻断。</div>
      </div>

      <div className="field mb-14">
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <label className="form-label">单会话时长上限</label>
          <span className="hstack" style={{ gap: 8 }}>
            <span className="help">不限</span>
            <Toggle
              checked={form.noDurationLimit}
              onChange={(next) => patch({ noDurationLimit: next })}
              label="时长不限"
            />
          </span>
        </div>
        {form.noDurationLimit ? null : (
          <div className="input" style={{ width: 140 }}>
            <input
              type="number"
              min={1}
              aria-label="单会话时长上限（分钟）"
              aria-invalid={Boolean(errors.maxSessionMinutes)}
              aria-describedby={errors.maxSessionMinutes ? 'policy-duration-error' : undefined}
              value={form.maxSessionMinutes}
              onChange={(event) => patch({ maxSessionMinutes: event.target.value })}
            />
          </div>
        )}
        {errors.maxSessionMinutes ? (
          <div className="help err" id="policy-duration-error">
            {errors.maxSessionMinutes}
          </div>
        ) : null}
        <div className="help">单位分钟；超限由后台任务记账并告警，不掐断连接。</div>
      </div>

      <div className="field">
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <label className="form-label">需要审批</label>
          <Toggle
            checked={form.requireApproval}
            onChange={(next) => patch({ requireApproval: next })}
            label="需要审批"
          />
        </div>
        <div className="help">开启后签发票据前需要审批；批准后放行一次。</div>
      </div>
    </Modal>
  )
}
