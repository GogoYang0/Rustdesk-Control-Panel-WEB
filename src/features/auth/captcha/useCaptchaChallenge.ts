import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchCaptchaChallenge, type CaptchaProof } from '../../../lib/api'
import { captchaChallengeError } from '../../../lib/captcha'

export type CaptchaState =
  | { kind: 'loading'; generation: number }
  | { kind: 'disabled'; generation: number }
  | {
      kind: 'ready'
      generation: number
      provider: string
      params: Record<string, unknown>
    }
  | { kind: 'unavailable'; generation: number; message: string }

export interface CaptchaController {
  state: CaptchaState
  proof: CaptchaProof | null
  refresh: () => Promise<void>
  acceptProof: (generation: number, proof: CaptchaProof) => void
  clearProof: () => void
}

export function useCaptchaChallenge(active: boolean): CaptchaController {
  const [state, setState] = useState<CaptchaState>(() => ({
    kind: active ? 'loading' : 'disabled',
    generation: 0,
  }))
  const [proof, setProof] = useState<CaptchaProof | null>(null)
  const generationRef = useRef(0)
  const startedRef = useRef(false)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    const generation = ++generationRef.current
    setProof(null)
    setState({ kind: 'loading', generation })
    try {
      const data = await fetchCaptchaChallenge()
      if (!mountedRef.current || generationRef.current !== generation) return
      if (!data?.enabled) {
        setState({ kind: 'disabled', generation })
        return
      }
      setState({
        kind: 'ready',
        generation,
        provider: data.provider ?? 'unknown',
        params: (data.challenge?.params ?? {}) as Record<string, unknown>,
      })
    } catch (err) {
      if (!mountedRef.current || generationRef.current !== generation) return
      setState({ kind: 'unavailable', generation, message: captchaChallengeError(err) })
    }
  }, [])

  useEffect(() => {
    if (!active || startedRef.current) return
    startedRef.current = true
    void load()
  }, [active, load])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!active) return
    await load()
  }, [active, load])

  const acceptProof = useCallback((generation: number, next: CaptchaProof) => {
    if (generation !== generationRef.current) return
    setProof(next)
  }, [])

  const clearProof = useCallback(() => setProof(null), [])

  return { state, proof, refresh, acceptProof, clearProof }
}
