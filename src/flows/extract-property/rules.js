// The post-processing rules from Protea's extract-property function, ported
// as-is (TypeScript types removed). These run on the AI's 14-line answer.

export const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
]

export const ENUM_VALUES = {
  property_type: ['Rumah', 'Kavling', 'Apartemen', 'Ruko', 'Gudang'],
  transaction_type: ['Jual', 'Sewa'],
  sertifikat: ['SHM', 'HGB', 'PPJB', 'Girik/AJB'],
}

// Maps a response line label to the form field name.
const LINE_TO_FIELD = {
  'property type': 'property_type',
  'transaction type': 'transaction_type',
  'sertifikat': 'sertifikat',
  'price': 'price',
  'lt': 'lt',
  'lb': 'lb',
  'kt': 'kt',
  'km': 'km',
  'vendor': 'vendor',
  'address': 'address',
  'alamat': 'address',
  'alamat lengkap': 'address',
  'alamat properti': 'address',
  'fee': 'fee',
  'province': 'province',
  'city': 'city',
  'district': 'district',
}

// kt_extra / km_extra have no AI line of their own; they come from a "4+1" split.
// Kept identical to Protea: 'address' appears 4 times here (one per alias in
// LINE_TO_FIELD), so a missing address is reported as skipped 4 times.
export const APPLY_FIELDS = [...Object.values(LINE_TO_FIELD), 'kt_extra', 'km_extra']

// Spec fields the form doesn't show for a given property type.
export const SPEC_NOT_APPLICABLE = {
  Apartemen: ['lt', 'kt', 'kt_extra', 'km_extra'],
  Kavling: ['lb', 'kt', 'km', 'kt_extra', 'km_extra'],
  Ruko: ['kt', 'km', 'kt_extra', 'km_extra'],
  Gudang: ['kt', 'km', 'kt_extra', 'km_extra'],
}

export const MAX_PROMPT_LENGTH = 15_000
export const AI_LIMIT_PER_HOUR = 30

function splitRoomValue(raw) {
  if (!raw) return null
  const m = raw.match(/(\d+)\s*\+\s*(\d+)/)
  return m ? { base: m[1], extra: m[2] } : null
}

function splitRoomFromText(text, kind) {
  const word = kind === 'kt' ? 'tidur' : 'mandi'
  const patterns = [
    new RegExp(`(?:\\b${kind}\\b|kamar\\s*${word})\\s*:?\\s*(\\d+)\\s*\\+\\s*(\\d+)`, 'i'),
    new RegExp(`(\\d+)\\s*\\+\\s*(\\d+)\\s*(?:\\b${kind}\\b|kamar\\s*${word})`, 'i'),
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return { base: m[1], extra: m[2] }
  }
  return null
}

// Splits parsed.kt / parsed.km into base + extra, preferring the raw text.
export function applyRoomSplits(parsed, rawText) {
  for (const kind of ['kt', 'km']) {
    const split = splitRoomFromText(rawText, kind) ?? splitRoomValue(parsed[kind])
    if (!split) continue
    parsed[kind] = split.base
    parsed[`${kind}_extra`] = split.extra
  }
}

export function parseLines(text) {
  const out = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = LINE_TO_FIELD[line.slice(0, idx).trim().toLowerCase()]
    if (!field) continue
    out[field] = line.slice(idx + 1).trim()
  }
  return out
}

export function isBlank(value) {
  const s = String(value ?? '').trim()
  return s === '' || s === '%'
}

// Takes the address only from the vendor-note section, never the description.
export function extractAddressFromText(rawText) {
  if (!rawText) return null
  let targetText = rawText
  const rawNoteMatch = rawText.match(/\[CATATAN VENDOR,\s*ALAMAT,\s*FEE\]\s*([\s\S]+)$/i)
  if (rawNoteMatch && rawNoteMatch[1]) {
    targetText = rawNoteMatch[1]
  } else {
    const noteBlock = rawText.match(/(?:(?:vendor|alamat|fee)\s*:[\s\S]+)/i)
    if (noteBlock) targetText = noteBlock[0]
  }
  const m = targetText.match(/(?:alamat\s*(?:properti|lengkap)?|address)\s*:\s*([^\n\r]+)/i)
  if (m && m[1]?.trim()) {
    const addr = m[1].trim()
    if (addr.toLowerCase() !== 'not specified') return addr
  }
  return null
}

function parseNominalToRupiah(numStr, unitStr) {
  if (!numStr) return null
  const normalizedNum = parseFloat(numStr.replace(/,/g, '.').replace(/[^0-9.]/g, ''))
  if (isNaN(normalizedNum) || normalizedNum <= 0) return null

  const unit = (unitStr || '').toLowerCase().trim()
  if (unit === 'miliar' || unit === 'm' || unit === 'milyar') return Math.round(normalizedNum * 1_000_000_000)
  if (unit === 'juta' || unit === 'jt') return Math.round(normalizedNum * 1_000_000)
  if (unit === 'ribu' || unit === 'rb') return Math.round(normalizedNum * 1_000)

  const rawDigits = numStr.replace(/[^0-9]/g, '')
  if (!rawDigits) return null
  const parsedDigits = parseInt(rawDigits, 10)
  return Number.isFinite(parsedDigits) && parsedDigits >= 10_000 ? parsedDigits : null
}

// Kavling prices are always per m². Returns null when the text has no per-m² price.
export function extractKavlingPricePerMeter(text) {
  if (!text) return null
  const beforeRegex = /(?:harga\s*)?(?:sebesar\s*)?(?:rp\.?\s*)?([\d.,]+)\s*(juta|jt|miliar|m|milyar|ribu|rb)?\s*(?:\/\s*(?:m²|m2|meter(?:2|²)?|m\b)(?:\s*persegi)?|(?:per\s*|per-?)(?:m²|m2|meter(?:2|²)?|m\b)(?:\s*persegi)?|permeter\b|perm2\b)/gi
  const afterRegex = /(?:\/\s*(?:m²|m2|meter(?:2|²)?|m\b)(?:\s*persegi)?|(?:per\s*|per-?)(?:m²|m2|meter(?:2|²)?|m\b)(?:\s*persegi)?|permeter\b|perm2\b)\s*(?:sebesar\s*)?(?:rp\.?\s*)?([\d.,]+)\s*(juta|jt|miliar|m|milyar|ribu|rb)?/gi

  for (const match of text.matchAll(beforeRegex)) {
    const val = parseNominalToRupiah(match[1], match[2])
    if (val && val >= 10_000) return String(val)
  }
  for (const match of text.matchAll(afterRegex)) {
    const val = parseNominalToRupiah(match[1], match[2])
    if (val && val >= 10_000) return String(val)
  }
  return null
}

// Turns the AI's value into what the form field expects.
export function normalise(field, raw) {
  if (field === 'address' || field === 'vendor') {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.toLowerCase() === 'not specified') return null
    return trimmed
  }
  if (field === 'price') {
    const digits = raw.replace(/[^0-9]/g, '')
    if (!digits) return null
    return Number(digits).toLocaleString('en-US')
  }
  if (field === 'fee') {
    if (raw.includes('%')) {
      const cleaned = raw.replace(/%/g, '').replace(/\./g, ',').replace(/[^0-9,]/g, '')
      if (!/\d/.test(cleaned)) return null
      return `${cleaned}%`
    }
    const lower = raw.toLowerCase()
    let digits = raw.replace(/[^0-9]/g, '')
    if (lower.includes('juta') || lower.includes('jt')) {
      const baseNum = parseFloat(raw.replace(/,/g, '.').replace(/[^0-9.]/g, ''))
      if (!isNaN(baseNum) && baseNum > 0) digits = String(Math.round(baseNum * 1_000_000))
    } else if (lower.includes('miliar') || (lower.includes('m') && !lower.includes('km'))) {
      const baseNum = parseFloat(raw.replace(/,/g, '.').replace(/[^0-9.]/g, ''))
      if (!isNaN(baseNum) && baseNum > 0) digits = String(Math.round(baseNum * 1_000_000_000))
    }
    if (digits && Number(digits) > 100) return Number(digits).toLocaleString('en-US')
    const cleaned = raw.replace(/\./g, ',').replace(/[^0-9,]/g, '')
    return /\d/.test(cleaned) ? `${cleaned}%` : null
  }
  if (field === 'lt' || field === 'lb') {
    const summed = raw.includes('+')
      ? raw.split('+').reduce((total, part) => total + (parseInt(part, 10) || 0), 0)
      : parseInt(raw.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(summed) && summed > 0 ? String(summed) : null
  }
  if (field === 'kt' || field === 'km') {
    const base = parseInt(raw.split('+')[0].replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(base) && base > 0 ? String(base) : null
  }
  if (field === 'kt_extra' || field === 'km_extra') {
    const extra = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(extra) && extra > 0 ? String(extra) : null
  }
  if (field === 'province' || field === 'city' || field === 'district') {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.toLowerCase() === 'not specified') return null
    return trimmed.toUpperCase()
  }
  return raw
}

// The per-field decision loop. Returns { applied, skipped } exactly like the function.
export function decideFields(parsed, currentFields, effectiveType) {
  const applied = {}
  const skipped = []
  for (const field of APPLY_FIELDS) {
    const rawValue = parsed[field]
    if (!rawValue || rawValue.toLowerCase() === 'not specified') {
      skipped.push({ field, ai_value: rawValue ?? null, reason: 'not_specified' })
      continue
    }
    if (SPEC_NOT_APPLICABLE[effectiveType]?.includes(field)) {
      skipped.push({ field, ai_value: rawValue, reason: 'not_applicable_for_type' })
      continue
    }
    if (!isBlank(currentFields[field])) {
      skipped.push({ field, ai_value: rawValue, reason: 'already_filled' })
      continue
    }
    if (ENUM_VALUES[field] && !ENUM_VALUES[field].includes(rawValue)) {
      skipped.push({ field, ai_value: rawValue, reason: 'invalid_value' })
      continue
    }
    const value = normalise(field, rawValue)
    if (value === null) {
      skipped.push({ field, ai_value: rawValue, reason: 'invalid_value' })
      continue
    }
    applied[field] = value
  }
  return { applied, skipped }
}
