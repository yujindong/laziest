type Listener = (event: Event) => void

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener): void {
    const bucket = this.listeners.get(type) ?? new Set<Listener>()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  protected dispatch(type: string): void {
    const event = new Event(type)
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

export class FakeFontFace {
  static instances: FakeFontFace[] = []

  readonly family: string
  readonly source: string
  readonly descriptors?: FontFaceDescriptors
  loadCalls = 0

  constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
    this.family = family
    this.source = source
    this.descriptors = descriptors
    FakeFontFace.instances.push(this)
  }

  async load(): Promise<FontFace> {
    this.loadCalls += 1
    return this as unknown as FontFace
  }

  static reset(): void {
    FakeFontFace.instances = []
  }
}

export class FakeImage extends FakeEventTarget {
  static instances: FakeImage[] = []

  src = ''
  alt = ''
  crossOrigin: string | null = null
  decode = async () => undefined

  constructor() {
    super()
    FakeImage.instances.push(this)
  }

  triggerLoad(): void {
    this.dispatch('load')
  }

  triggerError(): void {
    this.dispatch('error')
  }

  static reset(): void {
    FakeImage.instances = []
  }
}

type FakeMediaTagName = 'audio' | 'video'

export class FakeMediaElement extends FakeEventTarget {
  static instances: Array<FakeMediaElement & { tagName: FakeMediaTagName }> = []

  readonly tagName: FakeMediaTagName
  src = ''
  preload = ''
  crossOrigin = ''
  loadCalls = 0
  playCalls = 0

  constructor(tagName: FakeMediaTagName) {
    super()
    this.tagName = tagName
    FakeMediaElement.instances.push(this as FakeMediaElement & { tagName: FakeMediaTagName })
  }

  load(): void {
    this.loadCalls += 1
  }

  play(): Promise<void> {
    this.playCalls += 1
    return Promise.resolve()
  }

  triggerLoadedMetadata(): void {
    this.dispatch('loadedmetadata')
  }

  triggerCanPlayThrough(): void {
    this.dispatch('canplaythrough')
  }

  triggerError(): void {
    this.dispatch('error')
  }

  static reset(): void {
    FakeMediaElement.instances = []
  }
}

export function createImageConstructor(): typeof Image {
  return class FakeImageConstructor extends FakeImage {} as unknown as typeof Image
}

export function createMediaElementFactory(tagName: FakeMediaTagName) {
  return () => new FakeMediaElement(tagName)
}
