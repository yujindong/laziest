import type { EnabledLogLevel, FormatterOptions, LogRecord } from '../types'

const levelColors: Record<EnabledLogLevel, string> = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[32m',
  debug: '\x1b[36m',
  trace: '\x1b[90m',
}

export function formatTime(
  time: Date,
  mode: FormatterOptions['timestamp'] = 'time',
): string {
  if (mode === false) {
    return ''
  }

  const iso = time.toISOString()

  if (mode === 'iso') {
    return iso
  }

  return iso.slice(11, 23)
}

export function formatLabel(record: Readonly<LogRecord>): string {
  const parts = record.name ? [record.name, ...record.scope] : [...record.scope]

  return parts.join(':')
}

export function colorLevel(
  level: EnabledLogLevel,
  value: string,
  colors: FormatterOptions['colors'],
): string {
  if (colors !== true) {
    return value
  }

  return `${levelColors[level]}${value}\x1b[0m`
}
