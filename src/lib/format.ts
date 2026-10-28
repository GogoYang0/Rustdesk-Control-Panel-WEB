export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** Human duration between two timestamps; an open session runs until now. */
export function formatDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return '—'
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  if (Number.isNaN(end)) return '—'
  const minutes = Math.max(0, Math.round((end - start) / 60_000))
  if (minutes < 1) return '<1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}
