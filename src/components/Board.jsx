import Signals from './Signals.jsx'
import Transport from './Transport.jsx'
import TransitMap from './TransitMap.jsx'

export default function Board({ flow, player, sim, canReplay, onReplay }) {
  return (
    <section className="board" aria-label="Request map">
      <div className="board-bar">
        <Signals checks={flow.checks} states={sim.checks} />
        <Transport player={player} canReplay={canReplay} onReplay={onReplay} />
      </div>
      <TransitMap flow={flow} node={sim.node} rail={sim.rail} packetLayerRef={sim.packetLayerRef} />
      <p className="legend">
        <span className="legend-item">
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" /></svg>Service
        </span>
        <span className="legend-item">
          <svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2" /></svg>Database table
        </span>
      </p>
    </section>
  )
}
