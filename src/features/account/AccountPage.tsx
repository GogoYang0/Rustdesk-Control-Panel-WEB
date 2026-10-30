import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useParams } from 'react-router'

import StateBlock from '../../components/StateBlock'
import { panelApi, useGetMeQuery, useGetPasskeysQuery } from '../../store/api'
import PasskeyCard from './PasskeyCard'
import PasswordCard from './PasswordCard'
import TotpCard from './TotpCard'

export default function AccountPage() {
  const { orgId } = useParams()
  const id = Number(orgId)
  const dispatch = useDispatch()
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

  // Another tab may complete the enrollment; a stale pending flag would keep
  // password removal disabled after the server already has TOTP enabled.
  useEffect(() => {
    if (totpEnabled) setTotpPending(false)
  }, [totpEnabled])

  function changed() {
    dispatch(panelApi.util.invalidateTags(['Me', 'Passkeys']))
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
          <div className="page-sub">{me.user.email} · 两步验证、Passkey、本地密码</div>
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
          这里只影响你自己的登录凭据；控制角色和客户端策略在组织页面管理。
        </div>
      </div>

      <div className="hstack mb-14" role="tablist" aria-label="账户与安全页签" style={{ gap: 4 }}>
        <button
          id="account-tab-credentials"
          className="btn primary sm"
          type="button"
          role="tab"
          aria-selected="true"
          aria-controls="account-panel-credentials"
        >
          登录凭据
        </button>
        <button
          id="account-tab-tokens"
          className="btn borderless sm"
          type="button"
          role="tab"
          aria-selected="false"
          aria-controls="account-panel-tokens"
          disabled
          title="个人 API Token 将在下一波提供"
        >
          个人 API Token
          <span className="nav-badge soft" style={{ marginLeft: 6 }}>
            后续
          </span>
        </button>
        <button
          id="account-tab-identities"
          className="btn borderless sm"
          type="button"
          role="tab"
          aria-selected="false"
          aria-controls="account-panel-identities"
          disabled
          title="外部身份将在下一波提供"
        >
          外部身份
          <span className="nav-badge soft" style={{ marginLeft: 6 }}>
            后续
          </span>
        </button>
      </div>
      <div id="account-panel-tokens" role="tabpanel" aria-labelledby="account-tab-tokens" hidden />
      <div
        id="account-panel-identities"
        role="tabpanel"
        aria-labelledby="account-tab-identities"
        hidden
      />

      <div
        id="account-panel-credentials"
        role="tabpanel"
        aria-labelledby="account-tab-credentials"
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

      <p className="help" style={{ marginTop: 12 }}>
        Passkey 操作需要安全上下文（HTTPS 或 localhost）与兼容浏览器；TOTP 使用验证器 App。个人 API
        Token 与外部身份将在下一波提供。
      </p>
    </section>
  )
}
