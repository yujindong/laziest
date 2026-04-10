import type { LogLevel, ResourceLogger } from './types'

const order: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

export function shouldLog(
  current: LogLevel,
  target: Exclude<LogLevel, 'silent'>,
): boolean {
  return order[current] >= order[target]
}

export const consoleResourceLogger: ResourceLogger = console
