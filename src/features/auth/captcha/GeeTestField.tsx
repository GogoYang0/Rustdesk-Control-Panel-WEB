import { useEffect, useRef, useState } from 'react'

import type { CaptchaProof } from '../../../lib/api'
import { loadExternalScript } from '../../../lib/external-script'

interface GeeTestInstance {
  onReady?: (callback: () => void) => unknown
  onSuccess?: (callback: () => void) => unknown
  onError?: (callback: (error: unknown) => void) => unknown
  onClose?: (callback: () => void) => unknown
  showCaptcha?: () => void
  verify?: () => void
  getValidate?: () => Record<string, string> | null | undefined
  destroy?: () => void
}

declare global {
  interface Window {
    initGeetest4?: (
      options: Record<string, unknown>,
      callback: (captcha: GeeTestInstance) => void,
    ) => void
  }
}

interface Props {
  generation: number
  captchaId: string
  scriptUrl: string
  onProof: (proof: CaptchaProof) => void
  onError: (message: string) => void
}

const PROOF_KEYS = ['lot_number', 'captcha_output', 'pass_token', 'gen_time'] as const

function allowedScript(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'static.geetest.com'
  } catch {
    return false
  }
}

export default function GeeTestField({
  generation,
  captchaId,
  scriptUrl,
  onProof,
  onError,
}: Props) {
  const instanceRef = useRef<GeeTestInstance | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    let active = true
    let initTimer = 0
    let readyTimer = 0

    const fail = (message: string) => {
      if (active) onError(message)
    }

    const initialise = async () => {
      if (!captchaId || !allowedScript(scriptUrl)) {
        fail('验证码参数无效，请联系管理员。')
        return
      }
      try {
        await loadExternalScript(scriptUrl, 10_000, () => typeof window.initGeetest4 === 'function')
        if (!active) return
        const init = window.initGeetest4
        if (typeof init !== 'function') throw new Error('initGeetest4 missing')

        initTimer = window.setTimeout(() => {
          if (active && !instanceRef.current) fail('验证码初始化超时，请重试。')
        }, 10_000)

        init({ captchaId, product: 'bind', language: 'zho' }, (captcha) => {
          window.clearTimeout(initTimer)
          if (!active) {
            captcha.destroy?.()
            return
          }
          instanceRef.current = captcha
          readyTimer = window.setTimeout(() => {
            if (!active) return
            captcha.destroy?.()
            instanceRef.current = null
            fail('验证码初始化超时，请重试。')
          }, 10_000)
          captcha.onReady?.(() => {
            window.clearTimeout(readyTimer)
            if (active) setStatus('ready')
          })
          captcha.onSuccess?.(() => {
            window.clearTimeout(readyTimer)
            if (!active) return
            const result = captcha.getValidate?.()
            const values = result ? PROOF_KEYS.map((key) => [key, result[key]] as const) : []
            if (
              values.length !== PROOF_KEYS.length ||
              values.some(([, value]) => typeof value !== 'string' || value === '')
            ) {
              fail('验证码校验失败，请重试。')
              return
            }
            onProof({ response: Object.fromEntries(values) })
          })
          captcha.onError?.(() => fail('验证码校验失败，请重试。'))
          captcha.onClose?.(() => {
            if (active) setStatus('ready')
          })
        })
      } catch {
        window.clearTimeout(initTimer)
        window.clearTimeout(readyTimer)
        fail('验证码组件加载失败，请重试。')
      }
    }

    void initialise()

    return () => {
      active = false
      window.clearTimeout(initTimer)
      window.clearTimeout(readyTimer)
      instanceRef.current?.destroy?.()
      instanceRef.current = null
    }
  }, [generation])

  if (status === 'loading') {
    return (
      <div className="help" role="status">
        正在加载 GeeTest…
      </div>
    )
  }

  return (
    <button
      className="btn outline sm"
      type="button"
      onClick={() => {
        const instance = instanceRef.current
        if (instance?.showCaptcha) instance.showCaptcha()
        else instance?.verify?.()
      }}
    >
      点击完成安全验证
    </button>
  )
}
