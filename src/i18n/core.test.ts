import { afterEach, expect, it } from 'vitest'

import { getLang, setLanguage, translate } from './core'

afterEach(() => {
  setLanguage('zh-CN')
})

it('translates static catalog keys and leaves unknown text alone', () => {
  setLanguage('en')
  expect(translate('设备总数')).toBe('Total devices')
  expect(translate('会议室一体机')).toBe('会议室一体机')
})

it('translates dynamic units, counts and entity labels', () => {
  setLanguage('en')
  expect(translate('剩余 5 分钟')).toBe('5 min remaining')
  expect(translate('2 小时 15 分')).toBe('2 h 15 min')
  expect(translate('设备 #42')).toBe('Device #42')
  expect(translate('共 12 台 · 第 2 / 3 页')).toBe('12 devices · page 2 of 3')
  expect(translate('1 台')).toBe('1 device')
  expect(translate('1 天')).toBe('1 day')
  expect(translate('使用 Keycloak 登录')).toBe('Continue with Keycloak')
})

it('uses Traditional Chinese terminology', () => {
  setLanguage('zh-TW')
  expect(translate('设备总数')).toBe('裝置總數')
  expect(translate('剩余 5 分钟')).toBe('剩餘 5 分鐘')
})

it('persists the chosen language', () => {
  setLanguage('ja')
  expect(getLang()).toBe('ja')
  expect(localStorage.getItem('rdp-panel-lang')).toBe('ja')
  expect(document.documentElement.lang).toBe('ja')
})
