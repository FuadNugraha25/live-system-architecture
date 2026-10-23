import { useEffect, useState } from 'react'
import { flows } from './flows/index.js'
import { Player } from './engine/player.js'
import FlowView from './components/FlowView.jsx'

function flowFromHash() {
  const id = window.location.hash.slice(1)
  return flows.find((flow) => flow.id === id) ?? flows[0]
}

export default function App() {
  const [player] = useState(() => new Player())
  const [flow, setFlow] = useState(flowFromHash)

  useEffect(() => {
    const onHashChange = () => setFlow(flowFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.title = `${flow.title}: Protea backend`
  }, [flow])

  return (
    <>
      <header className="masthead">
        <a className="brand" href="#">Protea backend, live</a>
        <nav className="flow-tabs" aria-label="Flows">
          {flows.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="flow-tab" aria-current={f.id === flow.id ? 'page' : undefined}>
              {f.title}
            </a>
          ))}
        </nav>
      </header>
      {/* key: switching flows remounts, so each flow starts with fresh data. */}
      <FlowView key={flow.id} flow={flow} player={player} />
    </>
  )
}
