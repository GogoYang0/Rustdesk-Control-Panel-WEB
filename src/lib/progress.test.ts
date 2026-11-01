import { afterEach, expect, it, vi } from 'vitest'

import { beginRequest, endRequest, requestCount, subscribeRequests } from './progress'

afterEach(() => {
  // Drain anything the test started so module state does not leak.
  while (requestCount() > 0) endRequest()
})

it('tracks concurrent requests and notifies subscribers', () => {
  const listener = vi.fn()
  const unsubscribe = subscribeRequests(listener)
  beginRequest()
  beginRequest()
  expect(requestCount()).toBe(2)
  endRequest()
  expect(requestCount()).toBe(1)
  endRequest()
  expect(requestCount()).toBe(0)
  expect(listener).toHaveBeenCalledTimes(4)
  unsubscribe()
  beginRequest()
  expect(listener).toHaveBeenCalledTimes(4)
})

it('never drops below zero', () => {
  endRequest()
  expect(requestCount()).toBe(0)
})
