import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router'

import { requestCount, subscribeRequests } from '../lib/progress'

const ROUTE_HOLD_MS = 280
const SHOW_DELAY_MS = 120
const HIDE_DELAY_MS = 240

export default function TopProgress() {
  const location = useLocation()
  const requests = useSyncExternalStore(subscribeRequests, requestCount, requestCount)
  const [routeBusy, setRouteBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(0)
  const visibleRef = useRef(false)

  useEffect(() => {
    setRouteBusy(true)
    const timer = window.setTimeout(() => setRouteBusy(false), ROUTE_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  const busy = routeBusy || requests > 0

  useEffect(() => {
    let showTimer = 0
    let hideTimer = 0
    let tick = 0
    if (busy) {
      showTimer = window.setTimeout(() => {
        visibleRef.current = true
        setVisible(true)
        setValue((current) => (current >= 100 ? 8 : current))
      }, SHOW_DELAY_MS)
      tick = window.setInterval(() => {
        setValue((current) => (current >= 90 ? 90 : current + Math.max(1, (90 - current) * 0.06)))
      }, 160)
    } else if (visibleRef.current) {
      setValue(100)
      hideTimer = window.setTimeout(() => {
        visibleRef.current = false
        setVisible(false)
        setValue(0)
      }, HIDE_DELAY_MS)
    }
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
      window.clearInterval(tick)
    }
  }, [busy])

  return (
    <div className={`top-progress${visible ? ' on' : ''}`} aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.max(value, 6) / 100})` }} />
    </div>
  )
}
