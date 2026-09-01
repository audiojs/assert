// Self-test, no framework: `node test.js`. Uses the package's own assertions
// against synthesized signals — the same pattern documented in the readme.
import {
  peak, assertPeak, rms, assertRms, assertSilent, assertNotSilent,
  assertNoClipping, assertNoDcOffset, assertDuration, assertChannels,
  assertSampleRate, dominantFrequency, assertFrequency, assertMatches,
  hash, assertHash,
} from './index.js'

let passed = 0, failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`ok - ${name}`)
  } catch (err) {
    failed++
    console.log(`not ok - ${name}`)
    console.log(`  ${err.message}`)
  }
}

function throws(fn, match) {
  try { fn() } catch (err) {
    if (match && !match.test(err.message)) throw new Error(`wrong error: ${err.message}`)
    return err
  }
  throw new Error('expected to throw, did not')
}

function sine(freq, sampleRate, seconds, amp = 1) {
  let n = Math.round(sampleRate * seconds)
  let data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = amp * Math.sin(2 * Math.PI * freq * i / sampleRate)
  return data
}

// Minimal AudioBuffer-like fixture, matching the shape web-audio-api /
// browsers / any ponyfill expose.
function fakeBuffer(channels, sampleRate) {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    duration: channels[0].length / sampleRate,
    getChannelData: ch => channels[ch],
  }
}

// --- peak / rms ------------------------------------------------------------

test('peak: measures absolute max', () => {
  let data = new Float32Array([0.1, -0.5, 0.3, -0.9, 0.2])
  if (Math.abs(peak(data) - 0.9) > 1e-6) throw new Error(`got ${peak(data)}`)
})

test('assertPeak: passes within tolerance', () => {
  let data = new Float32Array([0.1, -0.5, 0.3])
  assertPeak(data, 0.5, 1e-6)
})

test('assertPeak: throws outside tolerance', () => {
  let data = new Float32Array([0.1, -0.5, 0.3])
  throws(() => assertPeak(data, 0.6, 1e-4), /peak/)
})

test('rms: sine amplitude A has rms A/sqrt(2)', () => {
  let data = sine(441, 44100, 1, 1)
  let measured = rms(data)
  let expected = 1 / Math.SQRT2
  if (Math.abs(measured - expected) > 1e-3) throw new Error(`got ${measured}, expected ~${expected}`)
})

test('assertRms: passes for known sine', () => {
  let data = sine(441, 44100, 1, 0.8)
  assertRms(data, 0.8 / Math.SQRT2, 1e-3)
})

test('peak/rms pool across channels of a buffer-like input', () => {
  let quiet = new Float32Array(100).fill(0.1)
  let loud = new Float32Array(100).fill(0.9)
  let buf = fakeBuffer([quiet, loud], 44100)
  if (Math.abs(peak(buf) - 0.9) > 1e-6) throw new Error(`peak got ${peak(buf)}`)
})

// --- silence -----------------------------------------------------------

test('assertSilent: passes for true silence', () => {
  assertSilent(new Float32Array(1000))
})

test('assertSilent: throws for audible content', () => {
  throws(() => assertSilent(sine(441, 44100, 0.1, 0.5)), /not silent/)
})

test('assertNotSilent: passes for a real tone', () => {
  assertNotSilent(sine(441, 44100, 0.1, 0.5))
})

test('assertNotSilent: throws for silence', () => {
  throws(() => assertNotSilent(new Float32Array(1000)), /silent/)
})

// --- clipping ------------------------------------------------------------

test('assertNoClipping: passes for a clean sine', () => {
  assertNoClipping(sine(441, 44100, 0.1, 0.9))
})

test('assertNoClipping: a single sample at the ceiling is not clipping', () => {
  let data = sine(441, 44100, 0.1, 0.999)
  data[10] = 1 // one isolated full-scale sample
  assertNoClipping(data)
})

test('assertNoClipping: throws for a clipped square wave', () => {
  let data = new Float32Array(200)
  for (let i = 0; i < data.length; i++) data[i] = Math.sign(Math.sin(2 * Math.PI * 10 * i / 200)) || 1
  let err = throws(() => assertNoClipping(data), /clipping/)
  if (!/channel 0/.test(err.message)) throw new Error(`missing channel in message: ${err.message}`)
})

test('assertNoClipping: reports the offending channel', () => {
  let clean = sine(441, 44100, 0.05, 0.5)
  let clipped = new Float32Array(300).fill(1)
  let buf = fakeBuffer([clean, clipped], 44100)
  let err = throws(() => assertNoClipping(buf), /clipping/)
  if (!/channel 1/.test(err.message)) throw new Error(`expected channel 1, got: ${err.message}`)
})

// --- dc offset -----------------------------------------------------------

test('assertNoDcOffset: passes for a zero-mean sine', () => {
  assertNoDcOffset(sine(441, 44100, 1, 0.5))
})

test('assertNoDcOffset: throws for an offset signal', () => {
  let data = sine(441, 44100, 1, 0.3)
  for (let i = 0; i < data.length; i++) data[i] += 0.2
  throws(() => assertNoDcOffset(data), /dc offset/)
})

// --- buffer shape ----------------------------------------------------------

test('assertDuration / assertChannels / assertSampleRate', () => {
  let buf = fakeBuffer([new Float32Array(44100)], 44100)
  assertDuration(buf, 1, 1e-6)
  assertChannels(buf, 1)
  assertSampleRate(buf, 44100)
  throws(() => assertDuration(buf, 2, 1e-6), /duration/)
  throws(() => assertChannels(buf, 2), /numberOfChannels/)
  throws(() => assertSampleRate(buf, 48000), /sampleRate/)
})

// --- pitch -----------------------------------------------------------------

test('dominantFrequency: recovers a known sine frequency', () => {
  let sampleRate = 44100
  let data = sine(440, sampleRate, 0.25, 1)
  let measured = dominantFrequency(data, sampleRate)
  if (Math.abs(measured - 440) > 1) throw new Error(`got ${measured} Hz`)
})

test('assertFrequency: passes within cents tolerance', () => {
  let data = sine(880, 44100, 0.25, 1)
  assertFrequency(data, 44100, 880, 10)
})

test('assertFrequency: throws for a wrong pitch', () => {
  let data = sine(880, 44100, 0.25, 1)
  throws(() => assertFrequency(data, 44100, 440, 10), /frequency/)
})

// --- regression --------------------------------------------------------

test('assertMatches: passes for identical buffers', () => {
  let a = sine(441, 44100, 0.1, 0.7)
  let b = Float32Array.from(a)
  assertMatches(a, b)
})

test('assertMatches: throws and reports first divergence', () => {
  let a = sine(441, 44100, 0.1, 0.7)
  let b = Float32Array.from(a)
  b[50] += 0.1
  let err = throws(() => assertMatches(a, b, 1e-4), /diverge/)
  if (!/index 50/.test(err.message)) throw new Error(`expected index 50, got: ${err.message}`)
})

// --- hash --------------------------------------------------------------

test('hash: deterministic for the same content', () => {
  let a = sine(441, 44100, 0.05, 0.6)
  let b = Float32Array.from(a)
  if (hash(a) !== hash(b)) throw new Error('hash differs for identical content')
})

test('hash: stable under sub-quantization float noise', () => {
  let a = sine(441, 44100, 0.05, 0.6)
  let b = Float32Array.from(a).map(x => x + 1e-7) // far below the 1/32768 step
  if (hash(a) !== hash(b)) throw new Error('hash changed under inaudible float noise')
})

test('assertHash: passes for a matching hash, throws otherwise', () => {
  let data = sine(441, 44100, 0.05, 0.6)
  let expected = hash(data)
  assertHash(data, expected)
  throws(() => assertHash(data, 'deadbeef'), /hash/)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
