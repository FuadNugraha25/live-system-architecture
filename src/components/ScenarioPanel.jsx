export default function ScenarioPanel({ flow, values, selectedId, onChange, onScenario, onSubmit }) {
  return (
    <aside className="scenarios">
      <h2>Run a scenario</h2>
      <ul className="scenario-list">
        {flow.scenarios.map((scenario) => (
          <li key={scenario.id}>
            <button type="button" className="scenario" aria-pressed={scenario.id === selectedId} onClick={() => onScenario(scenario)}>
              <span className="scenario-title">{scenario.title}</span>
              <span className="scenario-detail">{scenario.detail}</span>
            </button>
          </li>
        ))}
      </ul>

      <form className="custom" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <h2>Or try your own values</h2>
        {flow.fields.map((field) => (
          <label key={field.id} className="field">
            <span>{field.label}</span>
            {field.type === 'select'
              ? (
                <select value={values[field.id]} onChange={(e) => onChange(field.id, e.target.value)}>
                  {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )
              : (
                <input type="text" autoComplete="off" spellCheck={false} value={values[field.id]} onChange={(e) => onChange(field.id, e.target.value)} />
              )}
          </label>
        ))}
        <button type="submit" className="primary">Run with these values</button>
      </form>
    </aside>
  )
}
