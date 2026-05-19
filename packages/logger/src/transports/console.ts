import { formatCompact } from '../formatters/compact'
import { formatJson } from '../formatters/json'
import { formatPretty } from '../formatters/pretty'
import type { ConsoleTransportOptions, LogFormatter, LogTransport } from '../types'

export function consoleTransport(options: ConsoleTransportOptions = {}): LogTransport {
  const writer = options.console ?? console
  const formatter = resolveFormatter(options)

  return (record) => {
    const output = formatter(record)
    const args = Array.isArray(output) ? output : [output]

    writer[record.level](...args)
  }
}

function resolveFormatter(options: ConsoleTransportOptions): LogFormatter {
  if (typeof options.format === 'function') {
    return options.format
  }

  switch (options.format ?? 'pretty') {
    case 'compact':
      return (record) => formatCompact(record, options)
    case 'json':
      return formatJson
    case 'pretty':
      return (record) => formatPretty(record, options)
  }
}
