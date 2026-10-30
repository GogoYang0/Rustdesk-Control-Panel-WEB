import { useState } from 'react'

import Modal from '../../components/Modal'
import type { Strategy } from '../../lib/api'
import {
  buildStrategyRows,
  optionValueProblem,
  rowsToConfig,
  strategyError,
  strategyNameProblem,
  type StrategyRow,
} from '../../lib/strategy'
import { useCreateStrategyMutation, useUpdateStrategyMutation } from '../../store/api'

export default function StrategyEditor({
  orgId,
  strategy,
  strategies,
  onClose,
}: {
  orgId: number
  strategy?: Strategy
  strategies: Strategy[]
  onClose: () => void
}) {
  const [name, setName] = useState(strategy?.name ?? '')
  const [rows, setRows] = useState<StrategyRow[]>(() => buildStrategyRows(strategy?.config_options))
  const [enabled, setEnabled] = useState(strategy?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [create] = useCreateStrategyMutation()
  const [update] = useUpdateStrategyMutation()

  function patchRow(index: number, patch: Partial<StrategyRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function submit() {
    if (busy) return
    const problem = strategyNameProblem(name, strategies, strategy?.id)
    if (problem) {
      setError(problem)
      return
    }
    const checked = rows.filter((row) => row.checked)
    for (const row of checked) {
      const invalid = optionValueProblem(row.value)
      if (invalid) {
        setError(`${row.label}：${invalid}`)
        return
      }
    }
    const config = rowsToConfig(rows)
    setBusy(true)
    setError(null)
    try {
      if (strategy) {
        await update({
          orgId,
          strategyId: strategy.id,
          request: { name: name.trim(), config_options: config, enabled },
        }).unwrap()
      } else {
        await create({ orgId, request: { name: name.trim(), config_options: config } }).unwrap()
      }
      onClose()
    } catch (err) {
      setError(strategyError(err, strategy ? 'update' : 'create'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={strategy ? `编辑客户端策略 #${strategy.id}` : '新建客户端策略'}
      width={760}
      onClose={() => {
        if (!busy) onClose()
      }}
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

      <div className="hstack" style={{ gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="form-label" htmlFor="strategy-name">
            <span className="req">*</span>名称
          </label>
          <div className="input">
            <input
              id="strategy-name"
              aria-label="名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="help">1–64 个字符，不区分大小写唯一。</div>
        </div>
        {strategy ? (
          <label className="hstack" style={{ gap: 8, paddingBottom: 4 }}>
            <input
              type="checkbox"
              aria-label="启用策略"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            启用
          </label>
        ) : (
          <div className="help" style={{ paddingBottom: 4 }}>
            创建后默认启用，可在编辑中停用。
          </div>
        )}
      </div>

      <div className="hstack" style={{ marginBottom: 8 }}>
        <span className="form-label">下发的客户端选项（最多 20 个白名单键）</span>
        <div className="spacer" />
        {strategy ? <span className="tag grey">version {strategy.version}</span> : null}
      </div>
      <div className="help mb-14">
        勾选表示下发该键；空值也是有效下发值（清除客户端值）。取消勾选表示不再发送，服务端会记录为已清除键。
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 420,
          overflowY: 'auto',
        }}
      >
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="hstack"
            style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <label className="hstack" style={{ gap: 6, width: 220 }}>
              <input
                type="checkbox"
                aria-label={`下发 ${row.label}`}
                checked={row.checked}
                disabled={busy}
                onChange={(event) => patchRow(index, { checked: event.target.checked })}
              />
              {row.label}
            </label>
            <span className="mono help" style={{ width: 220 }}>
              {row.key}
            </span>
            <div className="input" style={{ width: 180 }}>
              <input
                aria-label={`值 ${row.label}`}
                value={row.value}
                disabled={!row.checked || busy}
                placeholder="Y / N / 空"
                onChange={(event) => patchRow(index, { value: event.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      {strategy && (strategy.cleared_keys?.length ?? 0) > 0 ? (
        <div className="help" style={{ marginTop: 12 }}>
          已清除：{strategy.cleared_keys?.join('、')}
        </div>
      ) : null}
      <div className="help" style={{ marginTop: 10 }}>
        配置实际变化时服务端分配组织内下一个代次（可能跳号）；改名/空转不触发全量下发。客户端下一次心跳（≤30
        秒）才生效。
      </div>
    </Modal>
  )
}
