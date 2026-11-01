import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { FormLoading, TableSkeleton } from './Skeleton'

it('renders a table skeleton with an accessible status', () => {
  render(<TableSkeleton columns={4} rows={3} />)
  expect(screen.getByRole('status', { name: '正在加载' })).toBeTruthy()
  expect(document.querySelectorAll('.skeleton-table-row')).toHaveLength(4)
})

it('only covers the form area while active', () => {
  const { rerender } = render(
    <FormLoading active>
      <input aria-label="表单字段" />
    </FormLoading>,
  )
  expect(screen.getByLabelText('表单字段')).toBeTruthy()
  expect(screen.getByRole('status', { name: '正在加载表单…' })).toBeTruthy()
  rerender(
    <FormLoading active={false}>
      <input aria-label="表单字段" />
    </FormLoading>,
  )
  expect(screen.queryByRole('status')).toBeNull()
})
