# @audio/assert

Audio assertion helpers for CI. Measure and assert peak, RMS, silence, clipping, DC offset, duration, channels, sample rate, pitch, sample-wise regressions, and content hashes on any `AudioBuffer`-like object or raw `Float32Array`/`number[]` samples.

```
npm install @audio/assert
```

## Use

Every assertion **throws an `Error` with a precise message on failure and returns the measured value on success**. There is no runner integration to write — a thrown `Error` is exactly what `node:test`, `tape`, `tap`, `vitest`, `jest`, and `mocha` already expect from a failing assertion, so the same call works verbatim in all of them.

```js
import { assertFrequency, assertSilent, assertNoClipping } from '@audio/assert'

assertFrequency(sine440, 44100, 440)       // → 440.01 (measured Hz) or throws
assertSilent(tailSamples)                  // → 0.0000012 or throws "not silent: ..."
assertNoClipping(rendered)                 // → peak level or throws "clipping: channel 0, samples 812-819 ..."
```

### With `node:test`

```js
import test from 'node:test'
import { assertFrequency } from '@audio/assert'

test('oscillator renders 440 Hz', () => {
  assertFrequency(buffer, ctx.sampleRate, 440)
})
```

### With `tape`

```js
const test = require('tape') // or: import test from 'tape'
import { assertFrequency } from '@audio/assert'

test('oscillator renders 440 Hz', t => {
  t.doesNotThrow(() => assertFrequency(buffer, ctx.sampleRate, 440))
  t.end()
})
```

## CI with `web-audio-api`

[`web-audio-api`](https://github.com/audiojs/web-audio-api)'s `OfflineAudioContext` renders a real Web Audio graph to memory, no speaker or device required — pair it with `@audio/assert` for a full graph-in, assertion-out CI test:

```js
import { OfflineAudioContext } from 'web-audio-api'
import { assertPeak, assertFrequency, assertNoClipping, assertNoDcOffset } from '@audio/assert'

let ctx = new OfflineAudioContext(1, 44100, 44100)
let osc = ctx.createOscillator()
osc.frequency.value = 440
osc.connect(ctx.destination)
osc.start()

let buffer = await ctx.startRendering()

assertFrequency(buffer, ctx.sampleRate, 440)
assertNoClipping(buffer)
assertNoDcOffset(buffer)
assertPeak(buffer, 1, 1e-2)
```

## API

Input is either an `AudioBuffer`-like object (`numberOfChannels`, `sampleRate`, `length`, `duration`, `getChannelData(ch)`) or a raw `Float32Array`/`number[]`, treated as a single channel. Multi-channel measures that report one overall number (`peak`, `rms`, `hash`) pool all channels; measures where a location matters (`assertNoClipping`, `assertNoDcOffset`, `assertMatches`) report the specific channel.

#### `peak(input) → number` / `assertPeak(input, expected, tol=1e-4)`
Absolute sample maximum.

#### `rms(input) → number` / `assertRms(input, expected, tol=1e-4)`
`sqrt(mean(x²))`, the standard average-power measure (AES17 / IEC 61606).

#### `assertSilent(input, floorDb=-90)`
Fails if any sample's peak level exceeds `floorDb`. -90 dBFS sits below 16-bit PCM's ~-96 dBFS theoretical noise floor with headroom for dither/render rounding.

#### `assertNotSilent(input, floorDb=-60)`
Fails if the signal's RMS level is at or below `floorDb` — catches an accidentally muted or zeroed graph. -60 dBFS is well below normal program level (-20..-6 dBFS) but well above the silence floor.

#### `assertNoClipping(input, limit=1)`
Fails on **true clipping**: 3+ *consecutive* samples at/above `limit`, not a single sample that legitimately grazes full scale. Reports the channel and sample range.

#### `assertNoDcOffset(input, maxDc=0.01)`
Fails if any channel's sample mean exceeds `maxDc`.

#### `assertDuration(buffer, seconds, tol=1e-3)` / `assertChannels(buffer, count)` / `assertSampleRate(buffer, rate)`
Buffer-shape checks (require an `AudioBuffer`-like input).

#### `dominantFrequency(input, sampleRate) → Hz` / `assertFrequency(input, sampleRate, hz, tolCents=10)`
Fundamental frequency via autocorrelation (with parabolic interpolation for sub-sample precision) — robust to harmonics and DC offset, unlike zero-crossing counting. Same principle as pitch trackers like YIN. Tolerance is in cents (100 cents = 1 semitone) so it stays musically meaningful across the frequency range.

#### `assertMatches(a, b, tol=1e-4)`
Sample-wise comparison for golden-audio regression tests. Reports the first diverging channel/index and the max error found.

#### `hash(input) → string` / `assertHash(input, expected)`
Short deterministic content hash (FNV-1a) over samples quantized to 16-bit steps, so inaudible float noise between engines/platforms doesn't change the hash. Not cryptographic — for regression detection only.

## License

MIT
