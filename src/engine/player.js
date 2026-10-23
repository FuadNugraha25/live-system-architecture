// Playback control shared by every flow: speed, pause, step and cancel.
// Each run gets a token; starting a new run invalidates the old token, and the
// old run throws Aborted at its next checkpoint.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class Aborted extends Error {}

export class Player {
  speed = 1
  paused = false
  stepping = false
  // Bumped on every change; the snapshot React's useSyncExternalStore reads.
  version = 0
  #token = 0
  #waiters = []
  #listeners = new Set()

  begin() {
    this.#token += 1
    this.paused = false
    this.stepping = false
    this.#wake()
    this.#emit()
    return this.#token
  }

  cancel() {
    this.#token += 1
    this.#wake()
  }

  isCurrent(token) {
    return token === this.#token
  }

  async checkpoint(token) {
    for (;;) {
      if (token !== this.#token) throw new Aborted()
      if (!this.paused) return
      await new Promise((resolve) => this.#waiters.push(resolve))
    }
  }

  // Pause-aware delay, scaled by speed.
  async wait(token, ms) {
    let left = ms
    while (left > 0) {
      await this.checkpoint(token)
      const slice = Math.min(40, left / this.speed)
      await sleep(slice)
      left -= slice * this.speed
    }
    await this.checkpoint(token)
  }

  // Called after each narrated step; in step mode it pauses there.
  reachedStop() {
    if (!this.stepping) return
    this.stepping = false
    this.paused = true
    this.#emit()
  }

  pause() {
    this.paused = true
    this.#emit()
  }

  resume() {
    this.paused = false
    this.stepping = false
    this.#wake()
    this.#emit()
  }

  step() {
    this.stepping = true
    this.paused = false
    this.#wake()
    this.#emit()
  }

  setSpeed(speed) {
    this.speed = speed
    this.#emit()
  }

  subscribe(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #wake() {
    const waiters = this.#waiters
    this.#waiters = []
    waiters.forEach((resolve) => resolve())
  }

  #emit() {
    this.version += 1
    this.#listeners.forEach((listener) => listener(this))
  }
}
