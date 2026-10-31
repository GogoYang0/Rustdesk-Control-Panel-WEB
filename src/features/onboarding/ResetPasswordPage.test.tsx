import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ResetPasswordPage from './ResetPasswordPage'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(status = 200) {
  const requests: { url: string; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body ?? '') })
    if (status !== 200) return json({ code: 'conflict', message: 'invalid' }, status)
    return json({ code: 'ok', message: 'ok' })
  })
  render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
  return { requests }
}

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('ResetPasswordPage', () => {
  it('rejects a missing token', async () => {
    setup()
    expect(await screen.findByText(/重置链接不完整或无效/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '去登录' })).toBeTruthy()
  })

  it('validates the confirmation locally without a request', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abcdefghijklmnop')
    const { requests } = setup()
    const password = await screen.findByLabelText('新密码')
    fireEvent.change(password, { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'password124' } })
    fireEvent.click(screen.getByRole('button', { name: '设置新密码' }))
    expect(await screen.findByText('两次输入的密码不一致')).toBeTruthy()
    expect(requests).toHaveLength(0)
    expect(window.location.hash).toBe('')
  })

  it('submits the token and shows the login entry', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abcdefghijklmnop')
    const { requests } = setup()
    fireEvent.change(await screen.findByLabelText('新密码'), {
      target: { value: 'new-password' },
    })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: '设置新密码' }))
    expect(await screen.findByText(/密码已重置/)).toBeTruthy()
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/api/v1/auth/password/reset')
    expect(JSON.parse(requests[0].body)).toEqual({
      token: 'abcdefghijklmnop',
      new_password: 'new-password',
    })
    expect(screen.getByRole('link', { name: '去登录' })).toBeTruthy()
  })

  it('drops the form when the link is already used', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abcdefghijklmnop')
    setup(409)
    fireEvent.change(await screen.findByLabelText('新密码'), {
      target: { value: 'new-password' },
    })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-password' } })
    fireEvent.click(screen.getByRole('button', { name: '设置新密码' }))
    expect(await screen.findByText(/重置链接无效或已使用/)).toBeTruthy()
    await waitFor(() => expect(screen.queryByLabelText('新密码')).toBeNull())
    expect(screen.getByRole('link', { name: '去登录' })).toBeTruthy()
  })
})
