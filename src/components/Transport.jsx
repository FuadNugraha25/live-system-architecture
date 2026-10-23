import { useSyncExternalStore } from 'react'

const SPEEDS = [0.5, 1, 2]

export default function Transport({ player, canReplay, onReplay }) {
  useSyncExternalStore((listener) => player.subscribe(listener), () => player.version)

  return (
    <div className="transport">
      <button type="button" aria-pressed={player.paused} onClick={() => (player.paused ? player.resume() : player.pause())}>
        {player.paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onClick={() => player.step()}>Next step</button>
      <button type="button" disabled={!canReplay} onClick={onReplay}>Replay</button>
      <div className="speed" role="group" aria-label="Speed">
        {SPEEDS.map((speed) => (
          <button key={speed} type="button" aria-pressed={player.speed === speed} onClick={() => player.setSpeed(speed)}>
            {speed}×
          </button>
        ))}
      </div>
    </div>
  )
}
