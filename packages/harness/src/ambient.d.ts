declare const performance: {
  now(): number
}

declare const process: {
  env: Record<string, string | undefined>
  memoryUsage(): { heapUsed: number }
}

declare const gc: (() => void) | undefined

declare const console: {
  log(msg: string): void
}
