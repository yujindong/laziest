import type { ResourceLoaderRegistry } from '../shared/types'
import { audioLoader, videoLoader } from './media-loader'
import { fontLoader } from './font-loader'
import { imageLoader } from './image-loader'
import { binaryLoader, jsonLoader, lottieLoader, textLoader } from './fetch-loader'

export function createLoaderRegistry(): ResourceLoaderRegistry {
  return {
    image: imageLoader,
    font: fontLoader,
    audio: audioLoader,
    video: videoLoader,
    lottie: lottieLoader,
    json: jsonLoader,
    text: textLoader,
    binary: binaryLoader,
  }
}
