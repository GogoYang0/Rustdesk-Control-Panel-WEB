import { useEffect, useRef } from 'react'

import type { CaptchaProof } from '../../../lib/api'

interface AltchaElement extends HTMLElement {
  configure: (config: Record<string, unknown>) => void | Promise<void>
  verify: () => Promise<unknown>
  reset?: () => void
}

interface Props {
  generation: number
  params: Record<string, unknown>
  onProof: (proof: CaptchaProof) => void
  onExpired: () => void
  onError: (message: string) => void
}

export default function AltchaField({ generation, params, onProof, onExpired, onError }: Props) {
  const ref = useRef<AltchaElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let active = true

    const verified = (event: Event) => {
      if (!active) return
      const payload = (event as CustomEvent<{ payload?: unknown }>).detail?.payload
      if (typeof payload === 'string' && payload) {
        onProof({ response: { payload } })
      }
    }
    const expired = () => {
      if (active) onExpired()
    }
    const statechange = (event: Event) => {
      if (!active) return
      const state = (event as CustomEvent<{ state?: string }>).detail?.state
      if (state === 'error') onError('验证码验证失败，请重试。')
    }

    element.addEventListener('verified', verified)
    element.addEventListener('expired', expired)
    element.addEventListener('statechange', statechange)

    if (!window.isSecureContext) {
      onError('验证码需要安全上下文（HTTPS 或 localhost）。')
    } else {
      const start = async () => {
        try {
          // The widget chunk loads in parallel with React rendering; configure
          // only exists once the custom element has been upgraded.
          await import('altcha')
          await import('altcha/i18n/zh-cn')
          let timer = 0
          try {
            await Promise.race([
              customElements.whenDefined('altcha-widget'),
              new Promise((_, reject) => {
                timer = window.setTimeout(() => reject(new Error('altcha widget timeout')), 10000)
              }),
            ])
          } finally {
            window.clearTimeout(timer)
          }
          if (!active) return
          if (typeof element.configure !== 'function') {
            throw new Error('altcha widget unavailable')
          }
          await element.configure({
            challenge: params,
            auto: 'off',
            display: 'standard',
            language: 'zh-cn',
            minDuration: 500,
          })
          if (active) await element.verify()
        } catch {
          if (active) onError('验证码组件加载失败，请重试。')
        }
      }
      void start()
    }

    return () => {
      active = false
      element.removeEventListener('verified', verified)
      element.removeEventListener('expired', expired)
      element.removeEventListener('statechange', statechange)
    }
  }, [generation])

  return <altcha-widget ref={ref} data-testid="altcha-widget" />
}
