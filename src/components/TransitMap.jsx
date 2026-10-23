import { useLayoutEffect, useRef, useState } from 'react'

const LABEL_OFFSET = {
  below: { dx: 0, dy: 40, anchor: 'middle' },
  above: { dx: 0, dy: -46, anchor: 'middle' },
  right: { dx: 30, dy: -4, anchor: 'start' },
  left: { dx: -30, dy: -4, anchor: 'end' },
}

function HubCapsule({ node }) {
  const textRef = useRef(null)
  const [width, setWidth] = useState(160)

  // Size the capsule to its label, again once the web font has loaded.
  useLayoutEffect(() => {
    const fit = () => textRef.current && setWidth(textRef.current.getComputedTextLength() + 40)
    fit()
    document.fonts?.ready.then(fit)
  }, [node.name])

  return (
    <>
      <rect className="marker" x={node.x - width / 2} y={node.y - 20} width={width} height={40} rx={20} />
      <text ref={textRef} className="station-name" x={node.x} y={node.y + 6} textAnchor="middle">{node.name}</text>
    </>
  )
}

function Station({ node, state }) {
  const className = ['station', `station-${node.kind}`, state].filter(Boolean).join(' ')
  if (node.kind === 'hub') {
    return <g className={className}><HubCapsule node={node} /></g>
  }

  const pos = LABEL_OFFSET[node.label ?? 'below']
  return (
    <g className={className}>
      {node.kind === 'table'
        ? <rect className="marker" x={node.x - 15} y={node.y - 15} width={30} height={30} rx={5} />
        : <circle className="marker" cx={node.x} cy={node.y} r={17} />}
      <text className="station-name" x={node.x + pos.dx} y={node.y + pos.dy} textAnchor={pos.anchor}>{node.name}</text>
      {node.detail && (
        <text className="station-detail" x={node.x + pos.dx} y={node.y + pos.dy + 17} textAnchor={pos.anchor}>{node.detail}</text>
      )}
    </g>
  )
}

const onRail = (rail, a, b) => rail && ((rail.from === a && rail.to === b) || (rail.from === b && rail.to === a))

export default function TransitMap({ flow, node, rail, packetLayerRef }) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))

  return (
    <svg className="transit-map" viewBox="0 0 1000 500" role="img" aria-label="Map of the services and tables this request passes through">
      <g>
        {flow.lines.map(([a, b]) => {
          const p = byId.get(a), q = byId.get(b)
          const live = onRail(rail, a, b)
          return (
            <line key={`${a}|${b}`} className={live ? `rail live-${rail.tone}` : 'rail'} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
          )
        })}
      </g>
      <g>
        {flow.nodes.map((n) => (
          <Station key={n.id} node={n} state={node?.id === n.id ? node.state : null} />
        ))}
      </g>
      <g ref={packetLayerRef} />
    </svg>
  )
}
