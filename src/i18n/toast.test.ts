import { Toast } from '@douyinfe/semi-ui'
import { afterEach, expect, it, vi } from 'vitest'

import { setLanguage } from './core'
import { installToastTranslation } from './toast'

const toast = Toast as unknown as Record<string, (content: unknown, ...args: unknown[]) => unknown>

afterEach(() => {
  setLanguage('zh-CN')
  vi.restoreAllMocks()
})

it('translates string toast content', () => {
  const original = toast.success
  const spy = vi.fn()
  toast.success = spy
  installToastTranslation()
  setLanguage('en')
  toast.success('策略已创建')
  expect(spy).toHaveBeenCalledWith('Policy created')
  toast.success = original
})
