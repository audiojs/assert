// @audio/assert — audio assertion helpers for CI.
// Every assertion throws an Error with a precise message on failure and
// returns the measured value on success. No runner integration: it plugs
// into node:test, tape, tap, vitest, jest, mocha as-is.

// --- input normalization -----------------------------------------------
// Accepts anything AudioBuffer-shaped (numberOfChannels, sampleRate, length,
// duration, getChannelData(ch)) or a raw Float32Array / number[], treated
// as a single channel.

function isBufferLike(x) {
  return x != null && typeof x.getChannelData === 'function' && typeof x.numberOfChannels === 'number'
}

function channelsOf(input) {
  if (isBufferLike(input)) {
    let out = []
    for (let c = 0; c < input.numberOfChannels; c++) out.push(input.getChannelData(c))
    return out
  }
  return [input instanceof Float32Array ? input : Float32Array.from(input)]
}

// Pools all channels into one array, channel by channel. Used by measures
// that report a single overall number (peak, rms, hash). Assertions where a
// per-channel location matters (clipping, dc offset, matches) walk channels
// separately instead.
function flatten(input) {
  let chans = channelsOf(input)
  if (chans.length === 1) return chans[0]
  let length = chans.reduce((n, c) => n + c.length, 0)
  let out = new Float32Array(length)
  let offset = 0
  for (let c of chans) { out.set(c, offset); offset += c.length }
  return out
}

// dBFS: 20*log10(|x|) — decibels relative to full scale, where 1.0 is 0 dBFS
// (AES17 / ITU-R BS.1770 convention used throughout digital audio).
function dbfs(x) {
  return 20 * Math.log10(Math.abs(x))
}

function fail(msg) { throw new Error(msg) }

// --- peak / rms ----------------------------------------------------------

export function peak(input) {
  let data = flatten(input)
  let max = 0
  for (let i = 0; i < data.length; i++) { let a = Math.abs(data[i]); if (a > max) max = a }
  return max
}

export function assertPeak(input, expected, tol = 1e-4) {
  let measured = peak(input)
  if (Math.abs(measured - expected) > tol)
    fail(`peak ${measured.toFixed(6)} != expected ${expected} (tol ${tol})`)
  return measured
}

// RMS: sqrt(mean(x^2)), the standard measure of a signal's average power
// (AES17 / IEC 61606). Pooled across channels for a multi-channel buffer —
// pass buffer.getChannelData(ch) directly to measure one channel.
export function rms(input) {
  let data = flatten(input)
  if (!data.length) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / data.length)
}

export function assertRms(input, expected, tol = 1e-4) {
  let measured = rms(input)
  if (Math.abs(measured - expected) > tol)
    fail(`rms ${measured.toFixed(6)} != expected ${expected} (tol ${tol})`)
  return measured
}

// --- silence ---------------------------------------------------------------

// -90 dBFS: below the ~-96 dBFS theoretical noise floor of 16-bit PCM
// (6.02 * 16 + 1.76 dB, Widrow/Kollár quantization-noise formula), with a
// few dB of headroom for dither and render rounding — a standard
// "effectively silent" gate for CI.
export function assertSilent(input, floorDb = -90) {
  let measured = peak(input)
  let measuredDb = dbfs(measured)
  if (measuredDb > floorDb)
    fail(`not silent: peak ${measuredDb.toFixed(1)} dBFS exceeds floor ${floorDb} dBFS`)
  return measured
}

// -60 dBFS: comfortably above the -90 dBFS silence floor and well below
// normal program level (-20..-6 dBFS), so it only trips on buffers with no
// real content — an accidentally muted node or a zeroed graph.
export function assertNotSilent(input, floorDb = -60) {
  let measured = rms(input)
  let measuredDb = dbfs(measured)
  if (measuredDb <= floorDb)
    fail(`silent: rms ${measuredDb.toFixed(1)} dBFS at or below floor ${floorDb} dBFS`)
  return measured
}

// --- clipping ----------------------------------------------------------

// True digital clipping is a flat run at the ceiling, not one sample that
// happens to touch it — a legitimate transient can graze full scale once.
// Three consecutive samples at/above the limit is the common heuristic that
// separates "one real peak sample" from "the waveform is being clamped."
export function assertNoClipping(input, limit = 1) {
  let chans = channelsOf(input)
  const MIN_RUN = 3
  for (let c = 0; c < chans.length; c++) {
    let data = chans[c]
    let run = 0, runStart = -1
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) >= limit) {
        if (run === 0) runStart = i
        run++
        if (run >= MIN_RUN)
          fail(`clipping: channel ${c}, samples ${runStart}-${i} at/above limit ${limit}`)
      } else run = 0
    }
  }
  return peak(input)
}

// --- dc offset ---------------------------------------------------------

// DC offset is the sample mean; audio content should average to ~0. 0.01
// linear (~-40 dBFS as a level, though DC itself carries no spectral
// energy) is tight enough to catch a stuck offset while tolerating render
// and quantization noise. Checked per channel since a captured offset is
// typically a per-channel hardware artifact.
export function assertNoDcOffset(input, maxDc = 0.01) {
  let chans = channelsOf(input)
  let worst = 0
  for (let c = 0; c < chans.length; c++) {
    let data = chans[c]
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]
    let mean = data.length ? sum / data.length : 0
    if (Math.abs(mean) > Math.abs(worst)) worst = mean
    if (Math.abs(mean) > maxDc)
      fail(`dc offset: channel ${c} mean ${mean.toFixed(6)} exceeds ${maxDc}`)
  }
  return worst
}

// --- buffer shape --------------------------------------------------------

export function assertDuration(buffer, seconds, tol = 1e-3) {
  if (!isBufferLike(buffer)) fail('assertDuration expects an AudioBuffer-like object')
  let measured = buffer.duration
  if (Math.abs(measured - seconds) > tol)
    fail(`duration ${measured}s != expected ${seconds}s (tol ${tol})`)
  return measured
}

export function assertChannels(buffer, count) {
  if (!isBufferLike(buffer)) fail('assertChannels expects an AudioBuffer-like object')
  let measured = buffer.numberOfChannels
  if (measured !== count)
    fail(`numberOfChannels ${measured} != expected ${count}`)
  return measured
}

export function assertSampleRate(buffer, rate) {
  if (!isBufferLike(buffer)) fail('assertSampleRate expects an AudioBuffer-like object')
  let measured = buffer.sampleRate
  if (measured !== rate)
    fail(`sampleRate ${measured} != expected ${rate}`)
  return measured
}

// --- pitch ---------------------------------------------------------------

// Autocorrelation, not zero-crossing counting: zero-crossing rate is thrown
// off by harmonics, DC offset, and noise (a harmonic-rich tone can double-
// or half-count crossings). Autocorrelation finds the lag that best
// re-aligns the signal with itself, tracking the true fundamental period
// even in the presence of harmonics — the same principle behind pitch
// trackers like YIN (de Cheveigné & Kawahara, 2002). Operates on channel 0
// for multi-channel input; pass getChannelData(ch) for a specific channel.
export function dominantFrequency(input, sampleRate) {
  if (!sampleRate) fail('dominantFrequency requires a sampleRate')
  let data = channelsOf(input)[0]
  let n = data.length

  // Search range: 27.5 Hz (A0, the lowest standard musical pitch) to
  // 5000 Hz (above typical synthesized test tones), clamped to what the
  // buffer length can resolve.
  let minLag = Math.max(2, Math.floor(sampleRate / 5000))
  let maxLag = Math.min(n - 1, Math.floor(sampleRate / 27.5))
  if (maxLag <= minLag) fail('dominantFrequency: buffer too short for autocorrelation')

  let corrAt = lag => {
    let sum = 0
    for (let i = 0; i + lag < n; i++) sum += data[i] * data[i + lag]
    return sum
  }

  let bestLag = minLag, bestCorr = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = corrAt(lag)
    if (sum > bestCorr) { bestCorr = sum; bestLag = lag }
  }

  // Parabolic interpolation across the best lag and its neighbors sharpens
  // the estimate beyond one-sample lag resolution.
  let y0 = bestLag > minLag ? corrAt(bestLag - 1) : bestCorr
  let y1 = bestCorr
  let y2 = bestLag < maxLag ? corrAt(bestLag + 1) : bestCorr
  let denom = y0 - 2 * y1 + y2
  let shift = denom !== 0 ? 0.5 * (y0 - y2) / denom : 0
  let refinedLag = bestLag + Math.max(-1, Math.min(1, shift))

  return sampleRate / refinedLag
}

// Cents: 1200*log2(f1/f2), the standard logarithmic pitch-difference unit
// (100 cents = 1 semitone, ISO 16:1975). Comparing in cents keeps the
// tolerance musically meaningful across the range — a fixed Hz tolerance is
// strict at 100 Hz and needlessly loose at 5000 Hz. 10 cents is below
// typical human pitch-discrimination threshold (5-25 cents depending on
// listener and register).
export function assertFrequency(input, sampleRate, hz, tolCents = 10) {
  let measured = dominantFrequency(input, sampleRate)
  let cents = 1200 * Math.log2(measured / hz)
  if (Math.abs(cents) > tolCents)
    fail(`frequency ${measured.toFixed(2)} Hz (${cents.toFixed(1)} cents from ${hz} Hz) exceeds tolerance ${tolCents} cents`)
  return measured
}

// --- regression ----------------------------------------------------------

export function assertMatches(a, b, tol = 1e-4) {
  let ca = channelsOf(a), cb = channelsOf(b)
  if (ca.length !== cb.length)
    fail(`channel count mismatch: ${ca.length} != ${cb.length}`)

  let maxError = 0, divergedAt = -1, divergedChannel = -1
  for (let c = 0; c < ca.length; c++) {
    let da = ca[c], db = cb[c]
    if (da.length !== db.length)
      fail(`length mismatch on channel ${c}: ${da.length} != ${db.length}`)
    for (let i = 0; i < da.length; i++) {
      let err = Math.abs(da[i] - db[i])
      if (err > maxError) { maxError = err; divergedAt = i; divergedChannel = c }
    }
  }
  if (maxError > tol)
    fail(`samples diverge at channel ${divergedChannel}, index ${divergedAt}: max error ${maxError.toFixed(6)} exceeds tolerance ${tol}`)
  return maxError
}

// FNV-1a: a fast, dependency-free, well-distributed non-cryptographic hash
// (Fowler/Noll/Vo, 1991) — for spotting regressions, not for security.
// Samples are quantized to 16-bit steps (1/32768) before hashing so that
// inaudible float rounding between engines/platforms (0.49999997 vs 0.5)
// doesn't change the hash: 16 bits matches common PCM bit depth and sits
// far below audible resolution.
const QUANT = 32768 // 2^15, 16-bit signed PCM full-scale steps
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function hash(input) {
  let data = flatten(input)
  let h = FNV_OFFSET
  for (let i = 0; i < data.length; i++) {
    let q = Math.round(data[i] * QUANT)
    h ^= q & 0xff; h = Math.imul(h, FNV_PRIME)
    h ^= (q >> 8) & 0xff; h = Math.imul(h, FNV_PRIME)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function assertHash(input, expected) {
  let measured = hash(input)
  if (measured !== expected)
    fail(`hash ${measured} != expected ${expected}`)
  return measured
}
