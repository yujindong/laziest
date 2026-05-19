# @laziest/logger

Small logger for browser and Node.js libraries and applications.

## Install

```sh
pnpm add @laziest/logger
```

## Quick Start

```ts
import { consoleTransport, createLogger } from '@laziest/logger'

const logger = createLogger({
  name: 'app',
  level: 'debug',
  transports: [consoleTransport({ format: 'pretty' })],
})

logger.info('App started', { port: 3000 })
logger.child('loader').debug('Loaded resource', { url: '/hero.png' })
```

## Formats

### Pretty

```txt
[12:30:21.123] INFO   app:loader  Loaded resource
url=/hero.png
```

### Compact

```txt
12:30:21.123 info app:loader Loaded resource url=/hero.png
```

### JSON

```json
{"time":"2026-05-19T04:30:21.123Z","level":"info","name":"app","scope":["loader"],"message":"Loaded resource","context":{"url":"/hero.png"}}
```

## Application Setup

Use an explicit level and a console transport for local development.

```ts
const logger = createLogger({
  name: 'app',
  level: 'debug',
  transports: [consoleTransport({ format: 'pretty' })],
})
```

## Library Defaults

The logger defaults to `silent`, so libraries can accept user-provided logger options without writing to the console by default.

```ts
const logger = createLogger({
  name: 'my-library',
  transports: [consoleTransport()],
})

logger.info('Hidden until level is enabled')
```

## Multiple Transports

```ts
import { consoleTransport, createLogger, memoryTransport } from '@laziest/logger'

const records = []
const logger = createLogger({
  level: 'info',
  transports: [
    consoleTransport({ format: 'compact' }),
    memoryTransport(records),
  ],
})
```

## Child Loggers

```ts
const logger = createLogger({
  name: 'app',
  level: 'info',
  transports: [consoleTransport({ format: 'compact' })],
})

const loaderLogger = logger.child('loader')

loaderLogger.info('Loaded resource', { url: '/hero.png' })
```

## Errors

Prefer logging errors as context:

```ts
logger.error('Request failed', { err })
```
