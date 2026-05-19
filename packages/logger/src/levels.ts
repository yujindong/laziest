import type { EnabledLogLevel, LogLevel } from './types'

export const levelOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

export function shouldLog(
  current: LogLevel,
  target: EnabledLogLevel,
): boolean {
  return levelOrder[current] >= levelOrder[target]
}
