import { lazy, Suspense, useCallback, useEffect, useState } from 'react'

import type { CaptchaProof } from '../../../lib/api'
import { captchaProviderLabel } from '../../../lib/captcha'
import type { CaptchaState } from './useCaptchaChallenge'

// Altcha ships the widget/worker runtime; captcha-disabled deployments should
// not pay for it in the initial bundle.
const AltchaField = lazy(() => import('./AltchaField'))

interface Props {
  state: CaptchaState
  proof: CaptchaProof | null
  onProof: (generation: number, proof: CaptchaProof) => void
  onExpired: () => void
  onRetry: () => void
}

export default function CaptchaField({ state, proof, onProof, onExpired, onRetry }: Props) {
  const [providerError, setProviderError] = useState('')
  const generation = state.generation

  useEffect(() => {
    setProviderError('')
  }, [generation])

  const accept = useCallback(
    (next: CaptchaProof) => {
      setProviderError('')
      onProof(generation, next)
    },
    [generation, onProof],
  )
  const failed = useCallback((message: string) => setProviderError(message), [])
  const retry = useCallback(() => {
    setProviderError('')
    onRetry()
  }, [onRetry])

  if (state.kind === 'disabled') return null

  if (state.kind === 'loading') {
    return (
      <div
        className="captcha-field"
        data-testid="captcha-field"
        data-captcha-state="loading"
        role="group"
        aria-label="安全验证"
      >
        <div className="help" role="status">
          正在加载安全验证…
        </div>
      </div>
    )
  }

  if (state.kind === 'unavailable') {
    return (
      <div
        className="captcha-field"
        data-testid="captcha-field"
        data-captcha-state="unavailable"
        role="group"
        aria-label="安全验证"
      >
        <div className="banner warning" role="alert">
          <div>
            {state.message}
            <div style={{ marginTop: 8 }}>
              <button className="btn outline sm" type="button" onClick={retry}>
                重试
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state.provider !== 'altcha') {
    return (
      <div
        className="captcha-field"
        data-testid="captcha-field"
        data-captcha-state="unsupported"
        role="group"
        aria-label="安全验证"
      >
        <div className="banner danger" role="alert">
          <div>不支持的验证码提供商（{captchaProviderLabel(state.provider)}），请联系管理员。</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="captcha-field"
      data-testid="captcha-field"
      data-captcha-state={proof ? 'verified' : 'ready'}
      role="group"
      aria-label="安全验证"
    >
      <div className="help" style={{ marginBottom: 8 }}>
        安全验证 · {captchaProviderLabel(state.provider)}
      </div>
      {providerError ? (
        <div className="banner danger" role="alert">
          <div>
            {providerError}
            <div style={{ marginTop: 8 }}>
              <button className="btn outline sm" type="button" onClick={retry}>
                重试
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="help" role="status">
              正在加载安全验证…
            </div>
          }
        >
          <AltchaField
            key={generation}
            generation={generation}
            params={state.params}
            onProof={accept}
            onExpired={onExpired}
            onError={failed}
          />
        </Suspense>
      )}
      {proof ? (
        <div className="help" role="status" data-testid="captcha-verified">
          安全验证已通过
        </div>
      ) : null}
    </div>
  )
}
