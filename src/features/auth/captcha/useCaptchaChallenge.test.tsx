import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCaptchaChallenge } from './useCaptchaChallenge'

const apiMock = vi.hoisted(() => ({ fetchCaptchaChallenge: vi.fn() }))

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return { ...actual, fetchCaptchaChallenge: apiMock.fetchCaptchaChallenge }
})

function StrictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>
}

beforeEach(() => apiMock.fetchCaptchaChallenge.mockReset())
afterEach(() => vi.clearAllMocks())

describe('useCaptchaChallenge', () => {
  it('reports a disabled deployment without a proof', async () => {
    apiMock.fetchCaptchaChallenge.mockResolvedValue({ enabled: false })
    const { result } = renderHook(() => useCaptchaChallenge(true))

    await waitFor(() => expect(result.current.state.kind).toBe('disabled'))
    expect(result.current.proof).toBeNull()
    expect(apiMock.fetchCaptchaChallenge).toHaveBeenCalledTimes(1)
  })

  it('exposes the provider and public params when enabled', async () => {
    apiMock.fetchCaptchaChallenge.mockResolvedValue({
      enabled: true,
      provider: 'altcha',
      challenge: { params: { challenge: 'c1', salt: 's1', signature: 'sig1' } },
    })
    const { result } = renderHook(() => useCaptchaChallenge(true))

    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    expect(result.current.state).toMatchObject({
      provider: 'altcha',
      params: { challenge: 'c1' },
    })
  })

  it('requests the initial challenge once under StrictMode', async () => {
    apiMock.fetchCaptchaChallenge.mockResolvedValue({ enabled: false })
    const { result } = renderHook(() => useCaptchaChallenge(true), { wrapper: StrictWrapper })

    await waitFor(() => expect(result.current.state.kind).toBe('disabled'))
    expect(apiMock.fetchCaptchaChallenge).toHaveBeenCalledTimes(1)
  })

  it('does nothing while inactive', () => {
    const { result } = renderHook(() => useCaptchaChallenge(false))
    expect(result.current.state.kind).toBe('disabled')
    expect(apiMock.fetchCaptchaChallenge).not.toHaveBeenCalled()
  })

  it('ignores an older challenge response that resolves after a newer one', async () => {
    let resolveOld: (value: unknown) => void = () => {}
    apiMock.fetchCaptchaChallenge
      .mockResolvedValueOnce({
        enabled: true,
        provider: 'altcha',
        challenge: { params: { challenge: 'first' } },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      .mockResolvedValueOnce({
        enabled: true,
        provider: 'altcha',
        challenge: { params: { challenge: 'newest' } },
      })

    const { result } = renderHook(() => useCaptchaChallenge(true))
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))

    act(() => {
      void result.current.refresh()
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.state).toMatchObject({ params: { challenge: 'newest' } })

    await act(async () => {
      resolveOld({
        enabled: true,
        provider: 'altcha',
        challenge: { params: { challenge: 'stale' } },
      })
    })
    expect(result.current.state).toMatchObject({ params: { challenge: 'newest' } })
  })

  it('clears the proof on refresh and rejects late callbacks from older generations', async () => {
    apiMock.fetchCaptchaChallenge.mockResolvedValue({
      enabled: true,
      provider: 'altcha',
      challenge: { params: { challenge: 'c1' } },
    })
    const { result } = renderHook(() => useCaptchaChallenge(true))
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    const first = result.current.state.generation

    act(() => result.current.acceptProof(first, { response: { payload: 'p1' } }))
    expect(result.current.proof).toEqual({ response: { payload: 'p1' } })

    apiMock.fetchCaptchaChallenge.mockResolvedValue({
      enabled: true,
      provider: 'altcha',
      challenge: { params: { challenge: 'c2' } },
    })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.proof).toBeNull()
    expect(result.current.state.generation).toBeGreaterThan(first)

    act(() => result.current.acceptProof(first, { response: { payload: 'stale' } }))
    expect(result.current.proof).toBeNull()
    const current = result.current.state.generation
    act(() => result.current.acceptProof(current, { response: { payload: 'p2' } }))
    expect(result.current.proof).toEqual({ response: { payload: 'p2' } })
  })
})
