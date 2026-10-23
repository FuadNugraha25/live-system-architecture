import { useRef } from 'react'

function Cell({ value }) {
  if (value === true) return <td><span className="flag flag-yes">yes</span></td>
  if (value === false) return <td><span className="flag flag-no">no</span></td>
  if (value == null || value === '') return <td className="empty-cell">none</td>
  return <td>{value}</td>
}

// One fake table. Rows added since the previous data change flash briefly.
// Keys are compared per data version, not per render, so unrelated
// re-renders don't clear the highlight.
function FakeTable({ spec, db, version }) {
  const rows = spec.rows(db)
  const keys = rows.map(spec.key)
  const seen = useRef({ version: null, keys: null, previous: null })
  if (seen.current.version !== version) {
    seen.current = { version, keys: new Set(keys), previous: seen.current.keys }
  }
  const { previous } = seen.current

  return (
    <figure className="table">
      <figcaption><code>{spec.name}</code> {spec.note}</figcaption>
      <div className="table-scroll">
        <table data-version={version}>
          <thead>
            <tr>{spec.columns.map((c) => <th key={c.label} scope="col">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td className="empty-cell" colSpan={spec.columns.length}>{spec.empty ?? 'No rows yet'}</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={keys[i]} className={previous && !previous.has(keys[i]) ? 'fresh' : undefined}>
                {spec.columns.map((c) => <Cell key={c.label} value={c.value(row, db)} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

export default function DataTables({ specs, db, version, onReset }) {
  return (
    <section className="data">
      <div className="data-head">
        <h2>Fake data</h2>
        <button type="button" className="quiet" onClick={onReset}>Reset data</button>
      </div>
      {specs.map((spec) => <FakeTable key={spec.name} spec={spec} db={db} version={version} />)}
    </section>
  )
}
