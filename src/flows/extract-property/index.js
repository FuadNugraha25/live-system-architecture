// Mirrors supabase/functions/extract-property/index.ts in Protea: an agent pastes
// a listing, Gemini reads it, and the function decides field by field what the
// Add Listing form may fill in.
import {
  AI_LIMIT_PER_HOUR,
  CANDIDATE_MODELS,
  MAX_PROMPT_LENGTH,
  applyRoomSplits,
  decideFields,
  extractAddressFromText,
  extractKavlingPricePerMeter,
  isBlank,
  parseLines,
} from './rules.js'
import { scenarios } from './scenarios.js'

const MODEL_FAILURES = [
  { status: 503, error: 'The model is overloaded' },
  { status: 429, error: 'Quota exceeded' },
  { status: 500, error: 'Internal error' },
  { status: 503, error: 'Service unavailable' },
]

const REASONS = {
  not_specified: 'AI found nothing',
  not_applicable_for_type: 'not used for this type',
  already_filled: 'reviewer already filled it',
  invalid_value: 'not a valid value',
}

const FIELD_LABELS = {
  property_type: 'Property type',
  transaction_type: 'Transaction',
  sertifikat: 'Certificate',
  price: 'Price',
  lt: 'Land m² (LT)',
  lb: 'Building m² (LB)',
  kt: 'Bedrooms (KT)',
  kt_extra: 'Extra bedrooms',
  km: 'Bathrooms (KM)',
  km_extra: 'Extra bathrooms',
  vendor: 'Vendor',
  address: 'Address',
  fee: 'Fee',
  province: 'Province',
  city: 'City',
  district: 'District',
}

const modelNodeId = (index) => `model-${index}`

export default {
  id: 'extract-property',
  title: 'Fill a listing with AI',
  summary: 'An agent pastes a raw listing into Add Listing. The Edge Function asks Gemini to pull out 14 fields, falls back to other models when one fails, corrects the mistakes models are known to make, then decides field by field what the form may fill in.',
  source: 'supabase/functions/extract-property',
  hub: 'fn',
  client: 'browser',

  nodes: [
    { id: 'browser', kind: 'client', name: 'Add Listing', detail: 'agent’s form', x: 100, y: 250 },
    { id: 'fn', kind: 'hub', name: 'extract-property', x: 420, y: 250 },
    { id: 'auth', kind: 'service', name: 'Supabase Auth', detail: 'checks the session', x: 420, y: 70, label: 'right' },
    { id: 'audit', kind: 'table', name: 'security_audit_log', detail: 'hourly AI limit', x: 270, y: 430, label: 'below' },
    { id: 'ailog', kind: 'table', name: 'ai_extraction_log', detail: 'what the AI did', x: 570, y: 430, label: 'below' },
    ...CANDIDATE_MODELS.map((model, i) => ({
      id: modelNodeId(i),
      kind: 'service',
      name: model,
      detail: i === 0 ? 'tried first' : `fallback ${i}`,
      x: 850,
      y: 45 + i * 115,
      label: 'below',
    })),
  ],
  lines: [
    ['browser', 'fn'], ['fn', 'auth'], ['fn', 'audit'], ['fn', 'ailog'],
    ...CANDIDATE_MODELS.map((_, i) => ['fn', modelNodeId(i)]),
  ],
  checks: [
    { id: 'session', label: 'Logged in' },
    { id: 'length', label: 'Text length' },
    { id: 'limit', label: 'Under AI limit' },
    { id: 'ai', label: 'AI answered' },
  ],

  fields: [
    { id: 'listing', label: 'Listing text the agent pasted', type: 'textarea', rows: 7 },
    { id: 'aiAnswer', label: 'What the AI answers', type: 'textarea', rows: 7 },
    {
      id: 'reviewerType',
      label: 'Property type already on the form',
      type: 'select',
      options: [{ value: '', label: 'Empty' }, ...['Rumah', 'Kavling', 'Apartemen', 'Ruko', 'Gudang'].map((t) => ({ value: t, label: t }))],
    },
    { id: 'reviewerPrice', label: 'Price already on the form', type: 'text' },
    {
      id: 'modelsDown',
      label: 'AI models that fail',
      type: 'select',
      options: ['0', '1', '2', '3', '4'].map((n) => ({ value: n, label: n === '0' ? 'None' : n === '4' ? 'All four' : `First ${n}` })),
    },
  ],
  scenarios,

  createDb() {
    return { audit: [], aiLog: [], decisions: [], run: 0, nextLog: 1 }
  },
  tables: [
    {
      name: 'response',
      note: 'what the form receives, field by field',
      empty: 'Run a scenario to see each field’s fate',
      key: (row) => row.key,
      rows: (db) => db.decisions,
      columns: [
        { label: 'field', value: (r) => FIELD_LABELS[r.field] ?? r.field },
        { label: 'AI said', value: (r) => r.ai },
        { label: 'form gets', value: (r) => r.value },
        { label: 'skipped because', value: (r) => (r.reason ? REASONS[r.reason] : '–') },
      ],
    },
    {
      name: 'ai_extraction_log',
      note: 'latest 5',
      empty: 'No AI calls logged yet',
      key: (row) => row.id,
      rows: (db) => db.aiLog.slice(-5).reverse(),
      columns: [
        { label: 'status', value: (r) => r.status },
        { label: 'model', value: (r) => r.model },
        { label: 'http', value: (r) => r.http_status },
        { label: 'kept', value: (r) => r.kept },
      ],
    },
  ],

  async run(ctx, input) {
    const { db, code } = ctx
    const prompt = (input.listing ?? '').trim()
    const currentFields = { property_type: input.reviewerType, price: input.reviewerPrice }
    const modelsDown = Number(input.modelsDown) || 0
    db.run += 1
    db.decisions = []
    ctx.commit()

    const log = async (row) => {
      await ctx.send('fn', 'ailog', `log ${row.status}`, row.status === 'success' ? 'ok' : 'fault')
      db.aiLog.push({ id: `log-${db.nextLog++}`, ...row })
      ctx.commit()
      await ctx.reply('ailog', 'saved')
    }

    await ctx.say('Add Listing sends the pasted text, plus whatever the agent has already filled in on the form.')
    await ctx.send('browser', 'fn', 'POST extract')

    await ctx.say('Is this a logged-in agent? The function checks the session with Auth.')
    await ctx.send('fn', 'auth', 'getUser(token)')
    await ctx.reply('auth', 'user u-001')
    ctx.check('session', true)

    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      ctx.check('length', false)
      ctx.fault()
      await ctx.say(`The text must be 1 to ${MAX_PROMPT_LENGTH.toLocaleString('en-US')} characters. Even this failure is logged.`)
      await log({ status: 'error', model: CANDIDATE_MODELS[0], http_status: 400, kept: 'full prompt' })
      return ctx.respond(400, { error: 'bad_length' }, 'The form shows the length error.')
    }
    ctx.check('length', true)

    await ctx.say(`How many AI extractions has this agent run in the last hour? The limit is ${AI_LIMIT_PER_HOUR}.`)
    await ctx.send('fn', 'audit', 'count ai.extract, 1 h')
    const used = db.audit.filter((row) => row.actor_id === 'u-001' && row.action === 'ai.extract').length
    await ctx.reply('audit', `${used} used`)
    if (used >= AI_LIMIT_PER_HOUR) {
      ctx.check('limit', false)
      ctx.fault()
      await ctx.say('Limit reached. No AI call is made, which also keeps the Gemini bill in check.')
      await log({ status: 'error', model: CANDIDATE_MODELS[0], http_status: 429, kept: 'full prompt' })
      return ctx.respond(429, { error: 'rate_limited' }, 'The form shows <q>AI request limit reached. Try again later.</q>')
    }
    ctx.check('limit', true)

    // The fallback chain: try each model until one returns text.
    let answeredBy = null
    for (const [i, model] of CANDIDATE_MODELS.entries()) {
      const thinking = model.includes('2.5-flash') ? ` with “thinking” switched off (${code('thinkingBudget: 0')}), which this model needs` : ''
      await ctx.say(`The function sends the listing and the extraction rules to ${code(model)}${thinking}. Temperature 0, so the answer is as predictable as possible.`)
      await ctx.send('fn', modelNodeId(i), 'generateContent')
      if (i < modelsDown) {
        const failure = MODEL_FAILURES[i]
        await ctx.reply(modelNodeId(i), `${failure.status}`, 'fault')
        await ctx.say(`${code(model)} answers ${failure.status}: ${failure.error}. ${i < CANDIDATE_MODELS.length - 1 ? 'The function moves on to the next model.' : 'There are no models left.'}`)
        continue
      }
      await ctx.reply(modelNodeId(i), '14 lines', 'ok')
      answeredBy = model
      break
    }

    if (!answeredBy) {
      ctx.check('ai', false)
      ctx.fault()
      await ctx.say('Every model failed. The error log keeps the full prompt and the last raw response, so the failure can be investigated.')
      await log({ status: 'error', model: CANDIDATE_MODELS[0], http_status: MODEL_FAILURES[3].status, kept: 'prompt + raw response' })
      return ctx.respond(502, { error: 'ai_unavailable' }, 'The form shows <q>AI service is unavailable</q>. The agent fills the fields by hand.')
    }
    ctx.check('ai', true)

    // Post-processing: the safety nets that correct known model mistakes.
    const parsed = parseLines(input.aiAnswer ?? '')
    await ctx.say(`${code(answeredBy)} answered. Each ${code('Label: value')} line is read into a field.`)

    const aiSaid = { ...parsed }
    applyRoomSplits(parsed, prompt)
    for (const kind of ['kt', 'km']) {
      if (parsed[`${kind}_extra`] && aiSaid[kind] !== parsed[kind]) {
        await ctx.say(`The AI said ${code(`${kind.toUpperCase()}: ${aiSaid[kind]}`)}, but the listing text says ${code(`${parsed[kind]}+${parsed[`${kind}_extra`]}`)}. Models keep adding these together, so the function trusts the text: ${parsed[kind]} rooms plus ${parsed[`${kind}_extra`]} extra.`)
      }
    }

    if (!parsed.address || parsed.address.toLowerCase() === 'not specified') {
      const fallback = extractAddressFromText(prompt)
      if (fallback) {
        parsed.address = fallback
        await ctx.say(`The AI found no address. The function searches the vendor-note section itself and finds ${code(fallback)}.`)
      }
    }

    const effectiveType = !isBlank(currentFields.property_type) ? String(currentFields.property_type) : parsed.property_type
    if (!isBlank(currentFields.property_type)) {
      await ctx.say(`The form already says ${code(effectiveType)}, so that type decides which fields apply, not the AI’s ${code(parsed.property_type ?? 'answer')}.`)
    }
    if (effectiveType === 'Kavling') {
      const perMeter = extractKavlingPricePerMeter(prompt)
      const before = parsed.price
      parsed.price = perMeter ?? 'Not specified'
      await ctx.say(perMeter
        ? `Land is always priced per m². The AI gave ${code(before)}; the function finds the per-m² price in the text and uses ${code(Number(perMeter).toLocaleString('en-US'))} instead.`
        : `Land is always priced per m², and this text has no per-m² price. The AI’s ${code(before)} is thrown away rather than saved as the wrong kind of price.`)
    }

    const { applied, skipped } = decideFields(parsed, currentFields, effectiveType)
    db.decisions = []
    for (const [field, value] of Object.entries(applied)) {
      const ai = aiSaid[field] ?? (field.endsWith('_extra') ? 'from the text' : parsed[field])
      db.decisions.push({ key: `${db.run}-${field}`, field, ai, value })
    }
    skipped.forEach((s, i) => db.decisions.push({ key: `${db.run}-skip-${i}`, field: s.field, ai: aiSaid[s.field] ?? s.ai_value, value: null, reason: s.reason }))
    ctx.commit()

    const counts = skipped.reduce((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {})
    const reasonText = Object.entries(counts).map(([reason, n]) => `${n} ${REASONS[reason]}`).join(', ')
    await ctx.say(`Every field is checked in turn: is there a value, does it apply to a ${code(effectiveType ?? 'listing')}, did the agent already fill it, is it an allowed value? ${Object.keys(applied).length} fields are filled in. ${skipped.length} are skipped${reasonText ? `: ${reasonText}` : ''}.`)

    const addressSkips = skipped.filter((s) => s.field === 'address').length
    if (addressSkips > 1) {
      await ctx.say(`Quirk in the real code: ${code('address')} has four label aliases, so a missing address is reported as skipped ${addressSkips} times.`)
    }

    await ctx.say('One audit row counts towards the hourly limit. The success log keeps only what the AI filled and skipped, not the agent’s text.')
    await ctx.send('fn', 'audit', 'insert ai.extract')
    db.audit.push({ id: `a-${db.run}`, actor_id: 'u-001', action: 'ai.extract' })
    await ctx.reply('audit', 'saved')
    await log({ status: 'success', model: answeredBy, http_status: 200, kept: `${Object.keys(applied).length} applied, ${skipped.length} skipped` })

    return ctx.respond(200, { applied, skipped }, `The form fills ${Object.keys(applied).length} empty fields. The agent reviews them before submitting.`)
  },
}
