/** Anything AudioBuffer-shaped, or raw samples treated as one channel. */
export type AudioInput = AudioBufferLike | Float32Array | number[]

export interface AudioBufferLike {
  numberOfChannels: number
  sampleRate: number
  length: number
  duration: number
  getChannelData(channel: number): Float32Array
}

/** Absolute sample maximum; asserts against `expected` when given. */
export function peak(input: AudioInput, expected?: number, tol?: number): number
/** sqrt(mean(x²)); asserts against `expected` when given. */
export function rms(input: AudioInput, expected?: number, tol?: number): number
/** Throws if any sample exceeds `floorDb` (default -90 dBFS). Returns peak. */
export function silent(input: AudioInput, floorDb?: number): number
/** Throws if RMS is at/below `floorDb` (default -60 dBFS). Returns rms. */
export function audible(input: AudioInput, floorDb?: number): number
/** Throws on 3+ consecutive samples at/above `limit` (default 1). Returns peak. */
export function unclipped(input: AudioInput, limit?: number): number
/** Worst per-channel sample mean; asserts |mean| <= maxDc when given. */
export function dc(input: AudioInput, maxDc?: number): number
/** Buffer duration in seconds; asserts against `seconds` when given. */
export function duration(buffer: AudioBufferLike, seconds?: number, tol?: number): number
/** Channel count; asserts against `count` when given. */
export function channels(buffer: AudioBufferLike, count?: number): number
/** Sample rate; asserts against `rate` when given. */
export function sampleRate(buffer: AudioBufferLike, rate?: number): number
/** Fundamental via autocorrelation; asserts within `tolCents` of `hz` when given. */
export function frequency(input: AudioInput, sampleRate: number, hz?: number, tolCents?: number): number
/** Sample-wise comparison; throws past `tol`, returns max error. */
export function matches(a: AudioInput, b: AudioInput, tol?: number): number
/** FNV-1a over 16-bit-quantized samples; asserts against `expected` when given. */
export function hash(input: AudioInput, expected?: string): string
