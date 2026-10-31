import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import VerifyEmailPage from './VerifyEmailPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage(path: string, strict = false) {
  const ui = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/verify-email"
          element={
            <>
              <VerifyEmailPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

afterEach(() => vi.restoreAllMocks())

describe('VerifyEmailPage', () => {
  it('shows the invalid state without a token and sends nothing', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    renderPage('/verify-email')

    expect(screen.getByRole('alert')).toHaveTextContent('链接不完整或无效')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify-email$/)
  })

  it('rejects a short token locally and still removes it from the URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    renderPage('/verify-email?token=short')

    expect(screen.getByRole('alert')).toHaveTextContent('链接不完整或无效')
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify-email$/),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts once under StrictMode, clears the token and keeps other params', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ code: 'ok', message: 'ok' }))
    renderPage('/verify-email?token=abcdefghijklmnop1234&from=mail', true)

    await screen.findByText('邮箱已验证，现在可以登录控制台。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(String(call[0])).toBe('/api/v1/auth/verify-email')
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      token: 'abcdefghijklmnop1234',
    })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify-email\?from=mail$/),
    )
  })

  it('maps a used or expired token to the invalid state without a retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ code: 'conflict', message: 'verification token is not valid' }, 409),
    )
    renderPage('/verify-email?token=abcdefghijklmnop1234')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('已过期或已使用')
    expect(alert).not.toHaveTextContent('verification token is not valid')
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify-email$/)
  })

  it('retries a network failure and succeeds with the same token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(json({ code: 'ok', message: 'ok' }))
    renderPage('/verify-email?token=abcdefghijklmnop1234')

    expect(await screen.findByRole('alert')).toHaveTextContent('网络异常')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await screen.findByText('邮箱已验证，现在可以登录控制台。')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      token: 'abcdefghijklmnop1234',
    })
  })

  it('turns a retry into the invalid state when the token was already consumed', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ code: 'internal', message: 'boom' }, 500))
      .mockResolvedValueOnce(json({ code: 'conflict', message: 'used' }, 409))
    renderPage('/verify-email?token=abcdefghijklmnop1234')

    expect(await screen.findByRole('alert')).toHaveTextContent('服务异常')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText(/已过期或已使用/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })
})
