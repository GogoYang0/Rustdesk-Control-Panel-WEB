import { afterEach, expect, it } from 'vitest'

import { setLanguage } from './core'
import { jsx, jsxs } from './jsx-runtime'

afterEach(() => {
  setLanguage('zh-CN')
})

it('translates children and keeps a readable space around inline elements', () => {
  setLanguage('en')
  const tree = jsxs('div', {
    children: [
      jsx('b', { children: '只读总览。' }),
      '指标口径为全部历史；告警没有处置状态，设备在线数、趋势与报表暂无聚合 API。',
    ],
  }) as { props: { children: unknown[] } }
  const children = tree.props.children
  expect(children[0]).toMatchObject({ props: { children: 'Read-only overview.' } })
  expect(children[1]).toMatch(/^ Metrics/)
})

it('translates whitelisted attributes', () => {
  setLanguage('en')
  const tree = jsxs('input', { placeholder: '搜索设备' }) as {
    props: { placeholder?: string }
  }
  expect(tree.props.placeholder).toBe('Search devices')
})
