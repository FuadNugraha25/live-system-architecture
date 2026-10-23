const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => entities[c])

// Inline code span for narration; escapes user-supplied values.
export const code = (value) => `<code>${esc(value)}</code>`
