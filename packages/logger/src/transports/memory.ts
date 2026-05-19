import type { LogRecord, LogTransport } from '../types'

export function memoryTransport(records: Readonly<LogRecord>[] = []): LogTransport {
  return (record) => {
    records.push(record)
  }
}
