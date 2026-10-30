import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useParams, useSearchParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import { webAuthnSupported } from '../../lib/webauthn'
import { panelApi, useGetMeQuery, useGetPasskeysQuery } from '../../store/api'
import IdentityCard from './IdentityCard'
import PasskeyCard from './PasskeyCard'
import PasswordCard from './PasswordCard'
import TokenCard from './TokenCard'
import TotpCard from './TotpCard'

const ACCOUNT_TABS = ['credentials', 'tokens', 'identities'] as const
type AccountTab = (typeof ACCOUNT_TABS)[number]

function parseTab(value: string | null): AccountTab {
  return value === 'tokens' || value === 'identities' ? value : 'credentials'
}

export default function AccountPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const dispatch = useDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))
  const [totpPending, setTotpPending] = useState(false)
  const { data: me, isLoading: meLoading, isFetching: meFetching, error: meError } = useGetMeQuery()
  const {
    currentData: passkeyList,
    isLoading: passkeysLoading,
    isFetching: passkeysFetching,
    error: passkeysError,
  } = useGetPasskeysQuery()
  const current = me?.orgs.find((org) => org.id === id)
  const validId = Number.isSafeInteger(id) && id > 0
  const passkeys = passkeyList?.items ?? []
  const hasPassword = passkeyList?.has_password ?? me?.user.has_password ?? false
  const totpEnabled = passkeyList?.totp_enabled ?? me?.user.totp_enabled ?? false
  const passkeysChecking = passkeysLoading || passkeysFetching
  const passkeysUnavailable = Boolean(passkeysError)
  const passkeysReady = !passkeysChecking && !passkeysUnavailable
  const stepupReason = !webAuthnSupported()
    ? '当前浏览器不支持 Passkey，或页面不在安全上下文'
    : passkeysChecking
      ? '正在确认 Passkey 状态'
      : passkeysUnavailable
        ? 'Passkey 列表不可用'
        : passkeys.length === 0
          ? '账户没有可用的 Passkey'
          : ''
  const canStepup = stepupReason === ''

  // Another tab may complete the enrollment; a stale pending flag would keep
  // password removal disabled after the server already has TOTP enabled.
  useEffect(() => {
    if (totpEnabled) setTotpPending(false)
  }, [totpEnabled])

  function changed() {
    dispatch(panelApi.util.invalidateTags(['Me', 'Passkeys']))
  }

  function selectTab(next: AccountTab) {
    if (next === tab) return
    const params = new URLSearchParams(searchParams)
    if (next === 'credentials') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params)
  }

  if (!validId) {
    return <StateBlock code="404" title="组织不存在" description="组织 id 不合法。" />
  }
  if (meLoading) {
    return (
      <section className="page on">
        <div className="card">
          <div className="card-body">
            <div className="help" role="status">
              正在加载账户…
            </div>
          </div>
        </div>
      </section>
    )
  }
  if (!me || !current) {
    return (
      <StateBlock
        code="403"
        title="账户不可用"
        description="无法确认当前组织与账户，请重新登录。"
      />
    )
  }

  return (
    <section className="page on">
      <div className="page-head">
        <div>
          <h1 className="page-title">账户与安全</h1>
          <div className="page-sub">{me.user.email} · 账户凭据、个人 API Token 与外部身份</div>
        </div>
      </div>
      {meError ? (
        <div className="banner warning mb-14">
          <div>账户信息刷新失败，当前展示的可能是上次结果。</div>
        </div>
      ) : null}
      <div className="banner info mb-14">
        <div>
          <b>账户级设置。</b>
          这里管理你自己的登录凭据、个人 API Token 与外部身份；控制角色和客户端策略在组织页面管理。
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="账户与安全页签">
        {ACCOUNT_TABS.map((value) => (
          <button
            key={value}
            id={`account-tab-${value}`}
            className={`tab ${tab === value ? 'on' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls="account-panel"
            onClick={() => selectTab(value)}
          >
            {value === 'credentials'
              ? '登录凭据'
              : value === 'tokens'
                ? '个人 API Token'
                : '外部身份'}
          </button>
        ))}
      </div>

      <div id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`}>
        {tab === 'credentials' ? (
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 12,
            }}
          >
            <TotpCard
              enabled={totpEnabled}
              hasPassword={hasPassword}
              accountFetching={meFetching}
              pending={totpPending}
              onPendingChange={setTotpPending}
              onChange={changed}
            />
            <PasskeyCard
              passkeys={passkeys}
              loading={passkeysLoading}
              fetching={passkeysFetching}
              error={passkeysError}
              onChanged={changed}
            />
            <PasswordCard
              hasPassword={hasPassword}
              passkeys={passkeys.length}
              passkeysReady={passkeysReady}
              passkeysChecking={passkeysChecking}
              passkeysUnavailable={passkeysUnavailable}
              totpEnabled={totpEnabled}
              totpPending={totpPending}
              accountFetching={meFetching}
              onChanged={changed}
            />
          </div>
        ) : tab === 'tokens' ? (
          <TokenCard key={`tokens-${id}`} orgId={id} permissions={current.permissions} />
        ) : (
          <IdentityCard
            hasPassword={hasPassword}
            canStepup={canStepup}
            stepupReason={stepupReason}
          />
        )}
      </div>

      <p className="help" style={{ marginTop: 12 }}>
        {tab === 'credentials'
          ? 'Passkey 操作需要安全上下文（HTTPS 或 localhost）与兼容浏览器；TOTP 使用验证器 App。'
          : tab === 'tokens'
            ? '令牌明文只显示一次；其权限始终与当前角色取交集。'
            : '解绑必须用当前密码或 Passkey 验证；绑定与重置由管理员处理。'}
      </p>
    </section>
  )
}
