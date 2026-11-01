import type { CSSProperties, ReactNode } from 'react'

export function SkeletonLine({
  width = '100%',
  height = 12,
  className = '',
}: {
  width?: number | string
  height?: number
  className?: string
}) {
  return (
    <span
      className={`skeleton-line${className ? ` ${className}` : ''}`}
      style={{ width, height } as CSSProperties}
    />
  )
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-card" role="status" aria-label="正在加载">
      <SkeletonLine width="38%" height={14} />
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={index} width={index % 2 === 0 ? '100%' : '78%'} height={11} />
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-list" role="status" aria-label="正在加载">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-list-row" key={index}>
          <span className="skeleton-line skeleton-avatar" />
          <span className="skeleton-list-copy">
            <SkeletonLine width={index % 2 === 0 ? '62%' : '48%'} height={12} />
            <SkeletonLine width={index % 2 === 0 ? '38%' : '54%'} height={10} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({
  columns = 5,
  rows = 6,
  widths,
}: {
  columns?: number
  rows?: number
  widths?: string[]
}) {
  const columnWidths = widths ?? Array.from({ length: columns }, () => '100%')
  return (
    <div
      className="skeleton-table"
      role="status"
      aria-label="正在加载"
      style={{ '--cols': columns } as CSSProperties}
    >
      <div className="skeleton-table-row skeleton-table-head">
        {columnWidths.map((width, index) => (
          <SkeletonLine key={index} width={width} height={10} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-table-row" key={row}>
          {columnWidths.map((width, column) => (
            <SkeletonLine
              key={column}
              width={column === 0 ? width : `${Math.max(42, 100 - column * 6)}%`}
              height={11}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function FormLoading({
  active,
  label = '正在加载表单…',
  children,
}: {
  active: boolean
  label?: string
  children?: ReactNode
}) {
  return (
    <div className="form-area" aria-busy={active || undefined}>
      {children}
      {active ? (
        <div className="form-loading" role="status" aria-label={label}>
          <span className="form-spinner" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  )
}
