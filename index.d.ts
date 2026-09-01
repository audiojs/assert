// Type declarations for @audio/assert

/** Anything AudioBuffer-shaped: web-audio-api, browser native, or a ponyfill. */
export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

export type AudioInput = AudioBufferLike | Float32Array | number[];

export function peak(input: AudioInput): number;
export function assertPeak(input: AudioInput, expected: number, tol?: number): number;

export function rms(input: AudioInput): number;
export function assertRms(input: AudioInput, expected: number, tol?: number): number;

export function assertSilent(input: AudioInput, floorDb?: number): number;
export function assertNotSilent(input: AudioInput, floorDb?: number): number;

export function assertNoClipping(input: AudioInput, limit?: number): number;
export function assertNoDcOffset(input: AudioInput, maxDc?: number): number;

export function assertDuration(buffer: AudioBufferLike, seconds: number, tol?: number): number;
export function assertChannels(buffer: AudioBufferLike, count: number): number;
export function assertSampleRate(buffer: AudioBufferLike, rate: number): number;

export function dominantFrequency(input: AudioInput, sampleRate: number): number;
export function assertFrequency(input: AudioInput, sampleRate: number, hz: number, tolCents?: number): number;

export function assertMatches(a: AudioInput, b: AudioInput, tol?: number): number;

export function hash(input: AudioInput): string;
export function assertHash(input: AudioInput, expected: string): string;
