// Runs one flow's scenarios and exposes everything the page renders.
// A flow only talks to the page through the `ctx` object built here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Aborted } from './player.js'
import { code } from './html.js'
import { movePacket } from './packets.js'

const STEP_PAUSE_MS = 650

const idle = { steps: [], outcome: null, checks: {}, node: null, rail: null }

export function useSimulation(flow, player) {
  const dbRef = useRef(null)
  if (dbRef.current === null) dbRef.current = flow.createDb()
  const packetLayerRef = useRef(null)
  const [view, setView] = useState(idle)
  const [dbVersion, setDbVersion] = useState(0)
  const [running, setRunning] = useState(false)

  const nodes = useMemo(() => new Map(flow.nodes.map((node) => [node.id, node])), [flow])
  const patch = (changes) => setView((current) => ({ ...current, ...changes }))
  const commit = () => setDbVersion((v) => v + 1)

  // Stop any run still going when the flow is unmounted.
  useEffect(() => () => player.cancel(), [player])

  const makeContext = useCallback((token) => {
    const send = async (from, to, label, tone = 'request') => {
      patch({ rail: { from, to, tone } })
      try {
        await movePacket({ layer: packetLayerRef.current, from: nodes.get(from), to: nodes.get(to), label, tone, player, token })
      } finally {
        if (player.isCurrent(token)) patch({ rail: null })
      }
      patch({ node: { id: to, state: 'active' } })
    }

    return {
      db: dbRef.current,
      code,
      send,
      reply: (from, label, tone = 'reply') => send(from, flow.hub, label, tone),
      say: async (html) => {
        await player.checkpoint(token)
        setView((current) => ({ ...current, steps: [...current.steps, html] }))
        player.reachedStop()
        await player.wait(token, STEP_PAUSE_MS)
      },
      pause: (ms) => player.wait(token, ms),
      fault: () => patch({ node: { id: flow.hub, state: 'fault' } }),
      check: (id, passed) => setView((current) => ({ ...current, checks: { ...current.checks, [id]: passed ? 'pass' : 'fail' } })),
      commit,
      respond: async (status, body, text) => {
        const ok = status >= 200 && status < 300
        await send(flow.hub, flow.client, `${status} ${ok ? 'OK' : body.error}`, ok ? 'ok' : 'fault')
        patch({ node: { id: flow.client, state: ok ? 'ok' : 'fault' }, outcome: { status, text, ok } })
      },
    }
  }, [flow, nodes, player])

  const run = useCallback(async (input, scenario) => {
    const token = player.begin()
    setView({ ...idle, node: { id: flow.client, state: 'active' } })
    const cleanup = scenario?.setup?.(dbRef.current)
    commit()
    setRunning(true)
    try {
      await flow.run(makeContext(token), input)
    } catch (error) {
      if (!(error instanceof Aborted)) throw error
    } finally {
      cleanup?.()
      if (player.isCurrent(token)) {
        commit()
        setRunning(false)
      }
    }
  }, [flow, makeContext, player])

  const resetData = useCallback(() => {
    player.cancel()
    dbRef.current = flow.createDb()
    packetLayerRef.current?.replaceChildren()
    setView(idle)
    setRunning(false)
    commit()
  }, [flow, player])

  return { ...view, db: dbRef.current, dbVersion, running, run, resetData, packetLayerRef }
}
