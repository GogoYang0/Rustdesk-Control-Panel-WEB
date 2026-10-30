import { useGetProvidersQuery } from '../../store/api'
import { settingsError } from '../../lib/settings'

function providerRow(label: string, provider: { enabled: boolean; name?: string }) {
  return (
    <tr key={label}>
      <td>
        <b>{label}</b>
        {provider.name ? <div className="help">{provider.name}</div> : null}
      </td>
      <td style={{ textAlign: 'right' }}>
        <span
          className={`tag ${provider.enabled ? 'green' : 'grey'}`}
          data-testid={`provider-${label.toLowerCase()}-status`}
        >
          {provider.enabled ? '已启用' : '未启用'}
        </span>
      </td>
    </tr>
  )
}

export default function ProviderCard() {
  const { data, isLoading, isFetching, error, refetch } = useGetProvidersQuery()
  const loading = isLoading || (isFetching && data === undefined)

  return (
    <div className="card" data-testid="provider-card">
      <div className="card-head">
        <div className="card-title">
          身份提供方
          <span className="hint">部署级配置，只读</span>
        </div>
        <button
          className="btn borderless sm"
          type="button"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          刷新
        </button>
      </div>
      <div className="card-body">
        {error && !data ? (
          <div className="banner danger">
            <div>{settingsError(error, 'providers')}</div>
            <button className="btn tertiary sm" type="button" onClick={() => void refetch()}>
              重试
            </button>
          </div>
        ) : (
          <>
            {error ? (
              <div className="banner warning mb-14">
                <div>{settingsError(error, 'providers')}（当前展示的是上次结果）</div>
              </div>
            ) : null}
            {loading ? (
              <div className="help" role="status">
                正在加载身份提供方…
              </div>
            ) : !data ? (
              <div className="help">身份提供方状态不可用。</div>
            ) : (
              <table className="table" style={{ border: 'none' }}>
                <tbody>
                  {providerRow('OIDC', data.oidc)}
                  {providerRow('LDAP', data.ldap)}
                </tbody>
              </table>
            )}
          </>
        )}
        <div className="help" style={{ marginTop: 10 }}>
          OIDC 与 LDAP 互斥，同一部署只启用一个；客户端密钥只来自环境变量，控制台不读取或回显。
        </div>
      </div>
    </div>
  )
}
