import { useEffect, useRef } from 'react'

import type { CaptchaProof } from '../../../lib/api'

interface CapWidget extends HTMLElement {
  reset?: () => void
}

interface Props {
  generation: number
  apiEndpoint: string
  onProof: (proof: CaptchaProof) => void
  onError: (message: string) => void
}

function allowedEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    return (
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}

export default function CapField({ generation, apiEndpoint, onProof, onError }: Props) {
  const ref = useRef<CapWidget | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let active = true

    const solve = (event: Event) => {
      if (!active) return
      const token = (event as CustomEvent<{ token?: unknown }>).detail?.token
      if (typeof token === 'string' && token) {
        onProof({ response: { response: token } })
      }
    }
    const error = () => {
      if (active) onError('验证码验证失败，请重试。')
    }

    element.addEventListener('solve', solve)
    element.addEventListener('error', error)

    if (!allowedEndpoint(apiEndpoint)) {
      onError('验证码参数无效，请联系管理员。')
    } else {
      const start = async () => {
        let timer = 0
        try {
          await Promise.race([
            (async () => {
              await import('@cap.js/widget')
              await customElements.whenDefined('cap-widget')
            })(),
            new Promise((_, reject) => {
              timer = window.setTimeout(() => reject(new Error('cap widget timeout')), 10_000)
            }),
          ])
        } catch {
          if (active) onError('验证码组件加载失败，请重试。')
        } finally {
          window.clearTimeout(timer)
        }
      }
      void start()
    }

    return () => {
      active = false
      element.removeEventListener('solve', solve)
      element.removeEventListener('error', error)
      element.reset?.()
    }
  }, [generation])

  return <cap-widget ref={ref} data-cap-api-endpoint={apiEndpoint} />
}
