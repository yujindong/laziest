import { safeSerialize } from '../serializers'
import type { LogRecord } from '../types'

export function formatJson(record: Readonly<LogRecord>): string {
  const payload: {
    time: string
    level: LogRecord['level']
    name?: string
    scope: readonly string[]
    message: string
    context?: unknown
  } = {
    time: record.time.toISOString(),
    level: record.level,
    name: record.name,
    scope: record.scope,
    message: record.message,
  }

  if (record.context !== undefined) {
    payload.context = safeSerialize(record.context)
  }

  return JSON.stringify(payload)
}
