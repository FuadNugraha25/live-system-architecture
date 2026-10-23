// Signal lights for the checks a request must pass, in order.
export default function Signals({ checks, states }) {
  return (
    <ol className="signals" aria-label="Checks">
      {checks.map(({ id, label }) => (
        <li key={id} className="signal" data-state={states[id] ?? 'waiting'}>{label}</li>
      ))}
    </ol>
  )
}
