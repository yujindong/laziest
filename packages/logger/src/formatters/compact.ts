import { renderInlineContext } from '../serializers'
import type { FormatterOptions, LogRecord } from '../types'
import { formatLabel, formatTime } from './shared'

export function formatCompact(
  record: Readonly<LogRecord>,
  options: FormatterOptions = {},
): string {
  const parts = [
    formatTime(record.time, options.timestamp ?? 'time'),
    record.level,
    formatLabel(record),
    record.message,
  ]

  if (record.context !== undefined && options.context !== 'object') {
    parts.push(renderInlineContext(record.context))
  }

  return parts.filter(Boolean).join(' ')
}
