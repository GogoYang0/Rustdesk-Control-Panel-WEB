import { Button } from '@douyinfe/semi-ui'
import { useSelector } from 'react-redux'

import { selectTitle } from './store/appSlice'

export default function App() {
  const title = useSelector(selectTitle)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="text-2xl font-medium">
        <Button theme="solid" type="primary">
          {title}
        </Button>
      </div>
      <p className="text-sm opacity-70">控制平面管理台 · M0 骨架</p>
    </main>
  )
}
