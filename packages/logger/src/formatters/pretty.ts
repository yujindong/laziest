import { renderInlineContext } from '../serializers'
import type { FormatterOptions, LogRecord } from '../types'
import { colorLevel, formatLabel, formatTime } from './shared'

export function formatPretty(
  record: Readonly<LogRecord>,
  options: FormatterOptions = {},
): string[] {
  const timestamp = formatTime(record.time, options.timestamp ?? 'time')
  const level = colorLevel(record.level, record.level.toUpperCase().padEnd(5), options.colors)
  const prefix = [timestamp ? `[${timestamp}]` : '', level].filter(Boolean).join(' ')
  const label = formatLabel(record)
  const head = label
    ? `${prefix} ${label}  ${record.message}`
    : [prefix, record.message].filter(Boolean).join('  ')

  if (record.context === undefined || options.context === 'object') {
    return [head]
  }

  const inlineContext = renderInlineContext(record.context)

  return inlineContext ? [head, inlineContext] : [head]
}
