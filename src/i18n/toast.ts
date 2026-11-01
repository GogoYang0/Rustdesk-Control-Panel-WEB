import { Toast } from '@douyinfe/semi-ui'

import { translate } from './core'

type ToastMethod = (content: unknown, ...args: unknown[]) => unknown

const METHODS = ['success', 'info', 'warning', 'error'] as const
let installed = false

export function installToastTranslation(): void {
  if (installed) return
  installed = true
  const toast = Toast as unknown as Record<string, ToastMethod>
  for (const method of METHODS) {
    const original = toast[method]
    if (typeof original !== 'function') continue
    toast[method] = (content, ...args) =>
      original.call(toast, typeof content === 'string' ? translate(content) : content, ...args)
  }
}
