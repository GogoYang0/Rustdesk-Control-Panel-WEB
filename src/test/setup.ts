import '@testing-library/jest-dom/vitest'

// jsdom 不实现 canvas 2D 上下文；Semi Design 依赖的 lottie-web 在模块导入期
// 就会调用 getContext('2d') 并写入 fillStyle，因此这里提供最小桩实现。
const createStubContext = () => {
  const target: Record<string, unknown> = {}
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) {
        return obj[prop as string]
      }
      return () => undefined
    },
    set(obj, prop, value) {
      obj[prop as string] = value
      return true
    },
  })
}

HTMLCanvasElement.prototype.getContext = function getContext() {
  return createStubContext()
} as unknown as HTMLCanvasElement['getContext']
