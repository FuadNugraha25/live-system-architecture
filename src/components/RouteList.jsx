// The "what happens" list: one stop per narrated step, ending in the response.
// Step text comes from the flow files as HTML; user input in it is escaped by ctx.code().
export default function RouteList({ steps, outcome }) {
  const lastIndex = steps.length - 1
  return (
    <section className="route-panel" aria-live="polite">
      <h2>What happens</h2>
      {steps.length === 0 && <p className="route-empty">Pick a scenario to send a request.</p>}
      <ol className="route">
        {steps.map((html, i) => (
          <li
            key={i}
            className={`stop ${i === lastIndex && !outcome ? 'current' : 'passed'}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ))}
        {outcome && (
          <li className={`stop terminus ${outcome.ok ? 'terminus-ok' : 'terminus-fault'}`}>
            <strong className="status">{outcome.status}</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: outcome.text }} />
          </li>
        )}
      </ol>
    </section>
  )
}
