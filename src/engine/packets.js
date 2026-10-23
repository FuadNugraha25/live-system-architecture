// Moves a labelled packet between two points inside an SVG layer.
// Kept outside React: it updates a transform every frame.

const NS = 'http://www.w3.org/2000/svg'
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
// Animation frames stop in background tabs; the timer keeps a run moving there.
const nextFrame = () => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(performance.now()), 50)
  requestAnimationFrame((now) => { clearTimeout(timer); resolve(now) })
})
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

function svg(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  parent.appendChild(el)
  return el
}

export async function movePacket({ layer, from, to, label, tone, player, token }) {
  const packet = svg('g', { class: `packet packet-${tone}` }, layer)
  const pill = svg('rect', { rx: 11, height: 22, y: -11 }, packet)
  const text = svg('text', { 'text-anchor': 'middle', y: 4 }, packet)
  text.textContent = label
  const width = text.getComputedTextLength() + 22
  pill.setAttribute('width', width)
  pill.setAttribute('x', -width / 2)

  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const duration = reducedMotion.matches ? 0 : 450 + distance * 1.3
  let progress = 0
  let last = performance.now()
  try {
    do {
      await player.checkpoint(token)
      const now = await nextFrame()
      progress = duration ? Math.min(1, progress + (Math.min(50, now - last) * player.speed) / duration) : 1
      last = now
      const t = ease(progress)
      packet.setAttribute('transform', `translate(${from.x + (to.x - from.x) * t} ${from.y + (to.y - from.y) * t})`)
    } while (progress < 1)
  } finally {
    packet.remove()
  }
}
