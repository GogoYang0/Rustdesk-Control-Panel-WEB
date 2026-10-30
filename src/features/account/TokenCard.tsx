import { Toast } from '@douyinfe/semi-ui'
import { useState } from 'react'
import { useDispatch } from 'react-redux'

import Modal from '../../components/Modal'
import {
  ApiError,
  createToken,
  revokeToken,
  type ApiToken,
  type IssuedApiToken,
} from '../../lib/api'
import {
  activeTokenCount,
  DEFAULT_TOKEN_EXPIRY_DAYS,
  expiryDaysProblem,
  MAX_ACTIVE_TOKENS,
  tokenNameProblem,
  tokenStatus,
  tokenStatusLabel,
  tokenStatusTone,
} from '../../lib/account-tokens'
import { accountSecurityError } from '../../lib/account-security'
import { writeClipboard } from '../../lib/clipboard'
import { formatTime } from '../../lib/format'
import { panelApi, useGetTokensQuery } from '../../store/api'

export default function TokenCard({
  orgId,
  permissions,
}: {
  orgId: number
  permissions: string[]
}) {
  const dispatch = useDispatch()
  const { data, isLoading, isFetching, error, refetch } = useGetTokensQuery(orgId)
  const tokens = data ?? []
  const loading = isLoading || (isFetching && data === undefined)
  const activeCount = activeTokenCount(tokens)

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [days, setDays] = useState(String(DEFAULT_TOKEN_EXPIRY_DAYS))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<IssuedApiToken | null>(null)

  const [revoking, setRevoking] = useState<ApiToken | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)

  function openCreate() {
    setName('')
    setDays(String(DEFAULT_TOKEN_EXPIRY_DAYS))
    setSelected(new Set(permissions))
    setCreateError(null)
    setCreateOpen(true)
  }

  function togglePermission(code: string) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function submitCreate() {
    if (creating) return
    const nameProblem = tokenNameProblem(name)
    const daysProblem = expiryDaysProblem(days)
    if (nameProblem || daysProblem) {
      setCreateError(nameProblem ?? daysProblem)
      return
    }
    const chosen = permissions.filter((code) => selected.has(code))
    const allSelected = chosen.length === permissions.length
    setCreating(true)
    setCreateError(null)
    try {
      const result = await createToken({
        name: name.trim(),
        organization_id: orgId,
        expires_in_days: Number(days),
        ...(allSelected ? {} : { permissions: chosen }),
      })
      dispatch(panelApi.util.invalidateTags([{ type: 'Tokens', id: orgId }]))
      setIssued(result)
      setCreateOpen(false)
      Toast.success('令牌已创建，请立即复制明文')
    } catch (err) {
      setCreateError(accountSecurityError(err, 'token-create'))
    } finally {
      setCreating(false)
    }
  }

  async function submitRevoke() {
    if (!revoking || revokeBusy) return
    setRevokeBusy(true)
    setRevokeError(null)
    try {
      await revokeToken(revoking.id)
      dispatch(panelApi.util.invalidateTags([{ type: 'Tokens', id: orgId }]))
      Toast.success('令牌已撤销')
      setRevoking(null)
    } catch (err) {
      setRevokeError(accountSecurityError(err, 'token-revoke'))
      if (err instanceof ApiError && err.status === 404) void refetch()
    } finally {
      setRevokeBusy(false)
    }
  }

  async function copyPlaintext() {
    if (!issued) return
    if (await writeClipboard(issued.plaintext)) {
      Toast.success('令牌已复制')
    } else {
      Toast.error('复制失败，请手动选择')
    }
  }

  return (
    <>
      <div className="card" data-testid="token-card">
        <div className="card-head">
          <div className="card-title">
            个人 API Token
            <span className="hint">仅用于当前组织；明文只显示一次</span>
          </div>
          <div className="hstack" style={{ gap: 8 }}>
            <span className="help" data-testid="token-activity">
              {data ? `活跃 ${activeCount} / ${MAX_ACTIVE_TOKENS}` : '活跃 — / 20'}
            </span>
            <button
              className="btn primary sm"
              type="button"
              title="创建个人 API Token"
              onClick={openCreate}
            >
              创建令牌
            </button>
          </div>
        </div>
        <div className="card-body">
          {error ? (
            <div className="banner danger mb-14">
              <div>{accountSecurityError(error, 'token-list')}</div>
              <button className="btn tertiary sm" type="button" onClick={() => void refetch()}>
                重试
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="help" role="status">
              正在加载令牌…
            </div>
          ) : tokens.length === 0 ? (
            <div className="help">{error ? '令牌列表加载失败。' : '还没有个人 API Token。'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>前缀</th>
                    <th>权限</th>
                    <th>创建</th>
                    <th>过期</th>
                    <th>最近使用</th>
                    <th>状态</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => {
                    const status = tokenStatus(token)
                    return (
                      <tr key={token.id}>
                        <td>
                          <b>{token.name}</b>
                        </td>
                        <td>
                          <code className="mono">{token.token_prefix}</code>
                        </td>
                        <td className="help" style={{ maxWidth: 320 }}>
                          {token.permissions.length ? token.permissions.join('、') : '无权限'}
                        </td>
                        <td className="help">{formatTime(token.created_at)}</td>
                        <td className="help">{formatTime(token.expires_at)}</td>
                        <td className="help">
                          {token.last_used_at ? formatTime(token.last_used_at) : '尚未使用'}
                        </td>
                        <td>
                          <span className={`tag ${tokenStatusTone(status)}`}>
                            {tokenStatusLabel(status)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {status === 'active' ? (
                            <button
                              className="btn danger sm"
                              type="button"
                              onClick={() => {
                                setRevokeError(null)
                                setRevoking(token)
                              }}
                            >
                              撤销
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <Modal
          title="创建个人 API Token"
          onClose={() => {
            if (!creating) setCreateOpen(false)
          }}
          width={640}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button
                className="btn primary"
                type="button"
                disabled={creating}
                onClick={() => void submitCreate()}
              >
                {creating ? '创建中…' : '创建'}
              </button>
            </>
          }
        >
          {createError ? (
            <div className="banner danger mb-14">
              <div>{createError}</div>
            </div>
          ) : null}
          <div className="field mb-14">
            <label className="form-label" htmlFor="token-name">
              名称
            </label>
            <div className="input">
              <input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如 CI 流水线"
              />
            </div>
          </div>
          <div className="field mb-14">
            <label className="form-label" htmlFor="token-days">
              有效天数
            </label>
            <div className="input">
              <input
                id="token-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
            <div className="help">1–365 天，默认 90 天。过期后令牌立即失效。</div>
            {activeCount >= MAX_ACTIVE_TOKENS ? (
              <div className="help err">
                当前已有 {MAX_ACTIVE_TOKENS} 个活跃令牌；服务端会拒绝创建，请先撤销旧令牌。
              </div>
            ) : null}
          </div>
          <div className="field">
            <span className="form-label">权限（默认全部）</span>
            <div className="help" style={{ marginBottom: 8 }}>
              只能选择当前角色拥有的权限；服务端每次请求还会与当前角色取交集。
            </div>
            {permissions.length === 0 ? (
              <div className="help">当前角色没有可分配的权限。</div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {permissions.map((code) => (
                  <label key={code} className="hstack" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(code)}
                      onChange={() => togglePermission(code)}
                    />
                    <span className="mono">{code}</span>
                  </label>
                ))}
              </div>
            )}
            {selected.size === 0 ? (
              <div className="help err">未勾选任何权限时，该令牌无法调用管理端点。</div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {issued ? (
        <Modal
          title="令牌已创建"
          // A mask click or Escape must not discard the only copy of the
          // plaintext; only the explicit save button closes this dialog.
          onClose={() => undefined}
          footer={
            <>
              <button className="btn tertiary" type="button" onClick={() => void copyPlaintext()}>
                复制令牌
              </button>
              <button className="btn primary" type="button" onClick={() => setIssued(null)}>
                我已保存
              </button>
            </>
          }
        >
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>
              <b>明文只显示这一次。</b>
              关闭后无法再次查看，列表只能看到前缀；点击遮罩或 Escape
              不会关闭，请先复制或点「我已保存」。
            </div>
          </div>
          <pre
            className="mono cell-wrap"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}
            data-testid="token-plaintext"
          >
            {issued.plaintext}
          </pre>
          <div className="help" style={{ marginTop: 8 }}>
            名称：{issued.token.name} · 前缀：{issued.token.token_prefix}
          </div>
        </Modal>
      ) : null}

      {revoking ? (
        <Modal
          title="撤销令牌"
          onClose={() => {
            if (!revokeBusy) setRevoking(null)
          }}
          footer={
            <>
              <button
                className="btn tertiary"
                type="button"
                disabled={revokeBusy}
                onClick={() => setRevoking(null)}
              >
                取消
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={revokeBusy}
                onClick={() => void submitRevoke()}
              >
                {revokeBusy ? '撤销中…' : '撤销'}
              </button>
            </>
          }
        >
          {revokeError ? (
            <div className="banner danger mb-14">
              <div>{revokeError}</div>
            </div>
          ) : null}
          <div className="banner warning mb-14" style={{ padding: '9px 11px' }}>
            <div>撤销后使用「{revoking.name}」的客户端会立即失去访问，且无法恢复。</div>
          </div>
          <div className="help">前缀 {revoking.token_prefix}</div>
        </Modal>
      ) : null}
    </>
  )
}
