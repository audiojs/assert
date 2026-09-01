# @audio/assert

Audio assertions for CI. Measure and assert peak, RMS, silence, clipping, DC offset, duration, channels, sample rate, pitch, sample-wise regressions, and content hashes on any `AudioBuffer`-like object or raw `Float32Array`/`number[]` samples.

```
npm install @audio/assert
```

## Use

Every function **measures** — and given an expectation it also **asserts**, throwing an `Error` with a precise message on failure and returning the measured value on success:

```js
import { frequency, silent, unclipped, peak } from '@audio/assert'

frequency(buffer, 44100)          // → 440.01 (measured Hz)
frequency(buffer, 44100, 440)     // → 440.01, or throws "frequency 452.31 Hz (47.9 cents from 440 Hz)..."
silent(tail)                      // → 0.0000012, or throws "not silent: peak -52.1 dBFS..."
unclipped(mix)                    // → 0.98, or throws "clipping: channel 0, samples 812-819..."
peak(render, 0.25, 1e-2)          // → 0.249, or throws
```

## Test runners

A thrown `Error` is a failing test everywhere, so there is no integration layer: the same call works verbatim under `node:test`, `bun:test`, `Deno.test`, [tape](https://github.com/tape-testing/tape), [tap](https://node-tap.org), [ava](https://github.com/avajs/ava), [uvu](https://github.com/lukeed/uvu), mocha, jasmine, jest, and vitest — or in a bare `node script.js` with no runner at all.

```js
// node:test
import test from 'node:test'
import { frequency } from '@audio/assert'

test('oscillator renders 440 Hz', () => {
  frequency(buffer, ctx.sampleRate, 440)
})
```

```js
// tape
import test from 'tape'
import { frequency } from '@audio/assert'

test('oscillator renders 440 Hz', t => {
  t.doesNotThrow(() => frequency(buffer, ctx.sampleRate, 440))
  t.end()
})
```

```js
// ava
import test from 'ava'
import { frequency } from '@audio/assert'

test('oscillator renders 440 Hz', t => {
  t.notThrows(() => frequency(buffer, ctx.sampleRate, 440))
})
```

## CI with `web-audio-api`

[`web-audio-api`](https://github.com/audiojs/web-audio-api)'s `OfflineAudioContext` renders a real Web Audio graph to memory, no speaker or device required — pair it with `@audio/assert` for a full graph-in, assertion-out CI test:

```js
import { OfflineAudioContext } from 'web-audio-api'
import { frequency, peak, unclipped, dc } from '@audio/assert'

let ctx = new OfflineAudioContext(1, 44100, 44100)
let osc = ctx.createOscillator()
osc.frequency.value = 440
osc.connect(ctx.destination)
osc.start()

let buffer = await ctx.startRendering()

frequency(buffer, ctx.sampleRate, 440)
unclipped(buffer)
dc(buffer, 0.01)
peak(buffer, 1, 1e-2)
```

## API

Input is either an `AudioBuffer`-like object (`numberOfChannels`, `sampleRate`, `length`, `duration`, `getChannelData(ch)`) or a raw `Float32Array`/`number[]`, treated as a single channel. Multi-channel measures that report one overall number (`peak`, `rms`, `hash`) pool all channels; measures where a location matters (`unclipped`, `dc`, `matches`) report the specific channel.

#### `peak(input, expected?, tol=1e-4) → number`
Absolute sample maximum.

#### `rms(input, expected?, tol=1e-4) → number`
`sqrt(mean(x²))`, the standard average-power measure (AES17 / IEC 61606).

#### `silent(input, floorDb=-90) → number`
Throws if any sample's peak level exceeds `floorDb`. -90 dBFS sits below 16-bit PCM's ~-96 dBFS theoretical noise floor with headroom for dither/render rounding.

#### `audible(input, floorDb=-60) → number`
Throws if the signal's RMS level is at or below `floorDb` — catches an accidentally muted or zeroed graph. -60 dBFS is well below normal program level (-20..-6 dBFS) but well above the silence floor.

#### `unclipped(input, limit=1) → number`
Throws on **true clipping**: 3+ *consecutive* samples at/above `limit`, not a single sample that legitimately grazes full scale. Reports the channel and sample range; returns the peak.

#### `dc(input, maxDc?) → number`
Worst per-channel sample mean; throws when a channel's `|mean|` exceeds `maxDc` (0.01 is a sensible gate — tight enough to catch a stuck offset, loose enough for render noise).

#### `duration(buffer, seconds?, tol=1e-3)` / `channels(buffer, count?)` / `sampleRate(buffer, rate?)`
Buffer-shape measures (require an `AudioBuffer`-like input); each asserts when the expectation is given.

#### `frequency(input, sampleRate, hz?, tolCents=10) → number`
Fundamental frequency via autocorrelation (with parabolic interpolation for sub-sample precision) — robust to harmonics and DC offset, unlike zero-crossing counting; the same principle as pitch trackers like YIN. Tolerance is in cents (100 cents = 1 semitone) so it stays musically meaningful across the frequency range.

#### `matches(a, b, tol=1e-4) → number`
Sample-wise comparison for golden-audio regression tests. Reports the first diverging channel/index; returns the max error.

#### `hash(input, expected?) → string`
Short deterministic content hash (FNV-1a) over samples quantized to 16-bit steps, so inaudible float noise between engines/platforms doesn't change the hash. Not cryptographic — for regression detection only.

## License

MIT, [ॐ](https://github.com/krishnized/license)
