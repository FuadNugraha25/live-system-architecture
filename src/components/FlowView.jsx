import { useState } from 'react'
import { useSimulation } from '../engine/useSimulation.js'
import Board from './Board.jsx'
import ScenarioPanel from './ScenarioPanel.jsx'
import RouteList from './RouteList.jsx'
import DataTables from './DataTables.jsx'

const blankValues = (flow) => Object.fromEntries(flow.fields.map((field) => [field.id, '']))

export default function FlowView({ flow, player }) {
  const sim = useSimulation(flow, player)
  const [values, setValues] = useState(() => ({ ...blankValues(flow), ...flow.scenarios[0].input }))
  const [lastRun, setLastRun] = useState(null)

  function start(input, scenario = null) {
    setLastRun({ input, scenario })
    sim.run(input, scenario)
  }

  function runScenario(scenario) {
    const filled = { ...values, ...scenario.input }
    setValues(filled)
    start({ ...filled, ...scenario.flags }, scenario)
  }

  function resetData() {
    sim.resetData()
    setLastRun(null)
  }

  return (
    <main className="layout">
      <section className="intro">
        <h1>{flow.title}</h1>
        <p className="summary">{flow.summary}</p>
        <p className="source">Simulates <code>{flow.source}</code>. Runs on fake data in your browser.</p>
      </section>

      <Board
        flow={flow}
        player={player}
        sim={sim}
        canReplay={lastRun !== null}
        onReplay={() => lastRun && start(lastRun.input, lastRun.scenario)}
      />

      <ScenarioPanel
        flow={flow}
        values={values}
        selectedId={lastRun?.scenario?.id}
        onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
        onScenario={runScenario}
        onSubmit={() => start(values)}
      />

      <RouteList steps={sim.steps} outcome={sim.outcome} />

      <DataTables specs={flow.tables} db={sim.db} version={sim.dbVersion} onReset={resetData} />
    </main>
  )
}
