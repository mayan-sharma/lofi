/* @jsx h */
import type { ClientSurface, RenderChildren } from 'claude-code'

// The stage: the band as a pixel canvas (one cell = two pixels, the upper half block in the top
// pixel's colour over the bottom pixel's) with a small demo on it. Never name a local `h` here:
// every JSX tag compiles to a call of `h`.

const SCENES = ['night', 'snow', 'aquarium', 'campfire', 'fire', 'plasma', 'cube', 'matrix'] as const
type Scene = (typeof SCENES)[number]
const CALM = new Set<Scene>(['night', 'snow', 'aquarium', 'campfire'])

type Props =
  | { isWorking?: boolean; scene?: Scene | 'auto'; rows?: number; hits?: number; lastTool?: string; summary?: string; guests?: number; words?: string[]; quiet?: boolean; music?: boolean; idle?: boolean; track?: string; sessionStartedAt?: number; renderedAt?: number }
  | undefined
type Star = [x: number, y: number, z: number]
type Spark = [x: number, y: number, vx: number, vy: number, life: number, hue: number]
type Fish = [x: number, y: number, dir: number, speed: number, kind: number]
type State = {
  frame: number
  bow: number
  working: boolean
  seenHits: number
  flash: number
  energy: number
  lastHit: number
  turnSince: number
  auto: number
  handedAt?: number
  handedFrame?: number
  sceneSince: number
  fire: number[]
  fireW: number
  stars: Star[]
  fish: Fish[]
  drops: number[]
  speeds: number[]
  sparks: Spark[]
}

const TICK_MS = 110
const BOW_FRAMES = 30
const FLASH_FRAMES = 2
const SCENE_FRAMES = 110
// a row is folded past this many styled runs
const MAX_RUNS = 140

const hms = (secs: number) => (secs >= 3600 ? `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
const hsv = (hue: number, s: number, v: number) => {
  const i = Math.floor(hue * 6)
  const f = hue * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]
  return hex(r * 255, g * 255, b * 255)
}
const FIRE = Array.from({ length: 64 }, (_, i) => {
  const t = i / 63
  if (t < 0.25) return hex(t * 4 * 140, 0, 0)
  if (t < 0.55) return hex(140 + ((t - 0.25) / 0.3) * 115, ((t - 0.25) / 0.3) * 120, 0)
  if (t < 0.85) return hex(255, 120 + ((t - 0.55) / 0.3) * 135, ((t - 0.55) / 0.3) * 60)
  return hex(255, 255, 60 + ((t - 0.85) / 0.15) * 195)
})
const RAINBOW = Array.from({ length: 64 }, (_, i) => hsv(i / 64, 0.85, 1))
// the plasma sits a little darker, so white text reads over it
const PLASMA = Array.from({ length: 64 }, (_, i) => hsv(i / 64, 0.9, 0.7))
const GRAYS = Array.from({ length: 8 }, (_, i) => hex(40 + i * 30, 40 + i * 30, 50 + i * 29))
const GREENS = ['#0a2f0a', '#0f4f12', '#15801c', '#22b02c', '#4ae052', '#b6ffb0', '#ffffff']
const BLACK = '#000000'

// a cheap deterministic hash, so a repaint of the same frame draws the same picture
const noise = (x: number, y: number) => {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n = Math.imul(n ^ (n >>> 16), 2246822519)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
}
const glyph = (ch: string) => FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT[ch === '·' ? '.' : ch === '×' ? 'X' : ' ']

const SPRITES: string[][] = [
  ['..#..', '..#..', '.###.', '#.#.#', '..#..', '.#.#.', '#...#'],
  ['#.#.#', '.###.', '..#..', '..#..', '..#..', '.#.#.', '#...#'],
  ['..#..', '..#..', '.###.', '#.#.#', '..#..', '.#.##', '#....'],
  ['#.#.#', '.###.', '..#..', '..#..', '..#..', '..#..', '.#.#.'],
]
const BOW_SPRITE = ['.....', '.....', '#####', '..#..', '..#..', '.#.#.', '#...#']

const textWidth = (s: string) => s.length * 6

class Canvas {
  px: (string | undefined)[]
  constructor(public w: number, public ph: number) {
    this.px = new Array(w * ph).fill(undefined)
  }
  gradient(colours: string[]) {
    for (let y = 0; y < this.ph; y++) this.px.fill(colours[Math.min(colours.length - 1, Math.floor((y / this.ph) * colours.length))], y * this.w, (y + 1) * this.w)
  }
  set(x: number, y: number, c: string) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.w && y < this.ph) this.px[y * this.w + x] = c
  }
  fill(c: string) {
    this.px.fill(c)
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (let i = 0; i < 400; i++) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }
  sprite(rows: string[], x0: number, y0: number, c: string) {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') this.set(x0 + dx, y0 + dy, c)
    })
  }
  text(s: string, x0: number, y0: number, c: string, wave?: (x: number) => number, shadow?: string) {
    let x = x0
    for (const ch of s) {
      const g = glyph(ch)
      const dy = wave ? wave(x) : 0
      if (x > -6 && x < this.w) {
        if (shadow) this.sprite(g, x + 1, y0 + dy + 1, shadow)
        this.sprite(g, x, y0 + dy, c)
      }
      x += 6
    }
  }
  centered(s: string, y0: number, c: string, shadow: string) {
    this.text(s, Math.round((this.w - textWidth(s) + 6) / 2), y0, c, undefined, shadow)
  }
}

// rows of half blocks: one styled span per run of cells sharing both colours, folded pairwise
// until the row fits the node budget
function paintRows(Text: ClientSurface['elements']['Text'], cv: Canvas): RenderChildren[] {
  const out: RenderChildren[] = []
  for (let y = 0; y < cv.ph; y += 2) {
    let runs: [n: number, top: string | undefined, bottom: string | undefined][] = []
    for (let x = 0; x < cv.w; x++) {
      const top = cv.px[y * cv.w + x]
      const bottom = y + 1 < cv.ph ? cv.px[(y + 1) * cv.w + x] : undefined
      const last = runs[runs.length - 1]
      if (last && last[1] === top && last[2] === bottom) last[0]++
      else runs.push([1, top, bottom])
    }
    while (runs.length > MAX_RUNS) {
      const folded: typeof runs = []
      for (let i = 0; i < runs.length; i += 2) {
        const a = runs[i], b = runs[i + 1]
        folded.push(b ? [a[0] + b[0], a[1], a[2]] : a)
      }
      runs = folded
    }
    out.push(
      <Text wrap="truncate-end">
        {runs.map(([n, top, bottom]) =>
          top === undefined && bottom === undefined ? <Text>{' '.repeat(n)}</Text>
          : top === undefined ? <Text color={bottom}>{'▄'.repeat(n)}</Text>
          : bottom === undefined ? <Text color={top}>{'▀'.repeat(n)}</Text>
          : <Text color={top} backgroundColor={bottom}>{'▀'.repeat(n)}</Text>,
        )}
      </Text>,
    )
  }
  return out
}

type World = { s: State; w: number; ph: number; hit: boolean; guests: number; regulars: number; props: Props }

function drawDancers(cv: Canvas, world: World, bowing: boolean) {
  const { s, hit, guests, regulars } = world
  const total = regulars + guests
  for (let i = 0; i < total; i++) {
    const x = Math.round((cv.w / (total + 1)) * (i + 1)) - 2
    const guest = i >= regulars
    const beat = Math.floor((s.frame + i * 2) / 2)
    const rows = bowing ? BOW_SPRITE : hit ? SPRITES[1] : SPRITES[guest ? (beat % 2 ? 3 : 1) : [0, 1, 0, 2][beat % 4]]
    const drift = bowing ? 0 : Math.round(Math.sin((s.frame + i * 5) / 6) * 2)
    cv.sprite(rows, x + drift, cv.ph - 7, guest ? '#5cff6a' : ['#ffffff', '#7ff7ff', '#ff8bff', '#ffe36b'][i % 4])
  }
}

// the heat buffer both fires share: seeded on its bottom row by the scene, cooled upwards here
const fireBuffer = (s: State, w: number, ph: number) => {
  if (s.fire.length !== w * ph || s.fireW !== w) { s.fire = new Array(w * ph).fill(0); s.fireW = w }
  return s.fire
}
function burn(f: number[], w: number, ph: number, top: number, cool: number, frame: number) {
  for (let y = 0; y < top; y++) for (let x = 0; x < w; x++) {
    const below = (y + 1) * w
    const v = (f[below + Math.max(0, x - 1)] + 2 * f[below + x] + f[below + Math.min(w - 1, x + 1)] + (y + 2 < ph ? f[(y + 2) * w + x] : f[below + x])) / 5
    f[y * w + x] = Math.max(0, v - cool * (0.6 + noise(x, frame + y)))
  }
}
// quantised to 16 steps so neighbouring cells share a colour and a row stays a few runs
const ember = (v: number) => FIRE[Math.min(63, Math.floor(v / 4) * 4 + 2)]

function sceneFire(cv: Canvas, world: World, bowing: boolean) {
  const { s, w, ph } = world
  const f = fireBuffer(s, w, ph)
  const heat = bowing ? 0.15 : 0.35 + s.energy * 0.6 + (world.hit ? 0.3 : 0)
  for (let x = 0; x < w; x++) f[(ph - 1) * w + x] = noise(x, s.frame) < heat ? 63 : Math.floor(noise(x + 7, s.frame) * 20)
  // cooling sized to the height so flames rest around half way up and climb with energy
  const reach = bowing ? 0.35 : 0.72 + s.energy * 0.35 + (world.hit ? 0.15 : 0)
  burn(f, w, ph, ph - 1, 63 / (ph * reach), s.frame)
  for (let i = 0; i < w * ph; i++) cv.px[i] = f[i] < 2 ? undefined : ember(f[i])
  drawDancers(cv, world, bowing)
}

function scenePlasma(cv: Canvas, world: World, bowing: boolean) {
  const { s, w, ph } = world
  const t = s.frame / 9
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x / 9 + t) + Math.sin(y / 3.5 - t * 0.8) + Math.sin((x + y * 2) / 11 + t / 2) + Math.sin(Math.hypot(x - w / 2, (y - ph / 2) * 2) / 7 - t)
      const i = Math.floor(((v + 4) / 8) * 63 + s.frame) % 64
      cv.px[y * w + x] = world.hit ? hsv(i / 64, 0.3, 1) : PLASMA[i]
    }
  const text = bowing ? 'TA-DA!' : `CLAUDE IS WORKING${world.props?.lastTool ? ` - ${world.props.lastTool.toUpperCase()}` : ''}${world.props?.summary ? ` - ${world.props.summary.toUpperCase()}` : ''} -  `
  const width = textWidth(text)
  // a gentle wave: long period, small amplitude, so the letters stay whole at this resolution
  const amp = Math.max(0, Math.min(1, (ph - 8) / 3))
  const x0 = bowing ? Math.round((w - width + 6) / 2) : w - ((s.frame * 2) % (width + w))
  cv.text(text, x0, Math.floor((ph - 7) / 2), '#ffffff', x => Math.round(Math.sin(x / 22 + s.frame / 7) * amp), '#000000')
}

function sceneCube(cv: Canvas, world: World, bowing: boolean) {
  const { s, w, ph } = world
  cv.fill(BLACK)
  if (s.stars.length !== 70) s.stars = Array.from({ length: 70 }, (_, i) => [noise(i, 1) * 2 - 1, noise(i, 2) * 2 - 1, noise(i, 3)])
  const warp = 1 + s.energy * 3 + (world.hit ? 4 : 0)
  s.stars.forEach((st, i) => {
    st[2] -= 0.012 * warp
    if (st[2] <= 0.02) { st[0] = noise(i, s.frame) * 2 - 1; st[1] = noise(i + 99, s.frame) * 2 - 1; st[2] = 1 }
    const sx = w / 2 + (st[0] / st[2]) * (w / 2)
    const sy = ph / 2 + (st[1] / st[2]) * (ph / 2)
    cv.set(sx, sy, GRAYS[Math.min(7, Math.floor((1 - st[2]) * 8))])
  })
  const spin = s.frame * (0.06 + s.energy * 0.12)
  const cube = (cx: number, cy: number, size: number, phase: number, colour: string) => {
    const a = spin + phase, b = spin * 0.7 + phase, c = spin * 0.3
    const pts = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => {
      let [px, py, pz] = [x, y, z]
      ;[py, pz] = [py * Math.cos(a) - pz * Math.sin(a), py * Math.sin(a) + pz * Math.cos(a)]
      ;[px, pz] = [px * Math.cos(b) + pz * Math.sin(b), -px * Math.sin(b) + pz * Math.cos(b)]
      ;[px, py] = [px * Math.cos(c) - py * Math.sin(c), px * Math.sin(c) + py * Math.cos(c)]
      const d = 3.2 / (3.2 + pz)
      return [cx + px * d * size * 2, cy + py * d * size]
    })))
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const bits = i ^ j
      if (bits === 1 || bits === 2 || bits === 4) cv.line(pts[i][0], pts[i][1], pts[j][0], pts[j][1], colour)
    }
  }
  const main = bowing ? '#ffd23f' : world.hit ? '#ffffff' : RAINBOW[(s.frame * 2) % 64]
  cube(w / 2, ph / 2 - 0.5, ph / 2.9, 0, main)
  for (let g = 0; g < world.guests; g++) {
    const ang = s.frame / 12 + (g * Math.PI * 2) / Math.max(1, world.guests)
    cube(w / 2 + Math.cos(ang) * w * 0.3, ph / 2 + Math.sin(ang) * ph * 0.3, ph / 7, g + 1, '#5cff6a')
  }
  if (bowing) cv.centered('TA-DA!', Math.floor((ph - 7) / 2), '#ffffff', '#000000')
}

// the rain is text, not pixels: the code Claude wrote this turn, falling
function sceneMatrix(Text: ClientSurface['elements']['Text'], world: World, bowing: boolean, rows: number): RenderChildren[] {
  const { s, w } = world
  const cols = w
  if (s.drops.length !== cols) {
    s.drops = Array.from({ length: cols }, (_, x) => -Math.floor(noise(x, 5) * rows * 3))
    s.speeds = Array.from({ length: cols }, (_, x) => 0.3 + noise(x, 6) * 0.9)
  }
  const speed = bowing ? 0.2 : 1 + s.energy * 1.5
  const source = (world.props?.words?.length ? world.props.words.join(' ') : 'claude is working on it').replace(/\s+/g, ' ')
  const cells: (string | undefined)[][] = Array.from({ length: rows }, () => new Array(cols).fill(undefined))
  const colors: (string | undefined)[][] = Array.from({ length: rows }, () => new Array(cols).fill(undefined))
  for (let x = 0; x < cols; x++) {
    if (noise(x, 7) < 0.55) continue
    s.drops[x] += s.speeds[x] * speed
    const head = Math.floor(s.drops[x])
    if (head - rows > rows * 2) { s.drops[x] = -Math.floor(noise(x, s.frame) * rows); continue }
    const trail = 4 + Math.floor(noise(x, 8) * rows)
    for (let k = 0; k < trail; k++) {
      const y = head - k
      if (y < 0 || y >= rows) continue
      const ch = source[(x * 7 + y + Math.floor(s.drops[x] / 3)) % source.length]
      if (ch === ' ') continue
      cells[y][x] = ch
      colors[y][x] = k === 0 ? (world.hit ? '#ffffff' : GREENS[6]) : GREENS[Math.max(0, 5 - Math.floor((k / trail) * 6))]
    }
  }
  if (bowing) {
    const msg = ' ta-da · claude is done '
    const y = Math.floor(rows / 2), x0 = Math.floor((cols - msg.length) / 2)
    for (let i = 0; i < msg.length; i++) { cells[y][x0 + i] = msg[i]; colors[y][x0 + i] = '#ffd23f' }
  }
  return cells.map((row, y) => {
    const parts: RenderChildren[] = []
    let x = 0
    while (x < cols) {
      if (row[x] === undefined) { let n = 0; while (x + n < cols && row[x + n] === undefined) n++; parts.push(<Text>{' '.repeat(n)}</Text>); x += n; continue }
      const c = colors[y][x]
      let text = ''
      while (x < cols && row[x] !== undefined && colors[y][x] === c) { text += row[x]; x++ }
      parts.push(<Text color={c} bold={c === GREENS[6] || c === '#ffffff'}>{text}</Text>)
    }
    return <Text wrap="truncate-end">{parts}</Text>
  })
}

// the calm one: a night sky over a small skyline, rain, drifting clouds, a moon; a tool call is a
// shooting star, never a flash; the bow lights every window and lets the rain stop
const SKY = ['#070b1c', '#0b1026', '#111536', '#181a44', '#221c4c', '#2b1f52', '#33224f']
const WINTER = ['#050912', '#0a1222', '#101a30', '#16223e', '#1d2a48', '#243252', '#2b3a5c']
function sceneLofi(cv: Canvas, world: World, bowing: boolean, winter = false) {
  const { s, w, ph } = world
  cv.gradient(winter ? WINTER : SKY)
  // stars, a few of them twinkling
  for (let i = 0; i < Math.floor(w / 2.2); i++) {
    const x = Math.floor(noise(i, 11) * w), y = Math.floor(noise(i, 12) * ph * 0.6)
    const tw = noise(i, 13 + (s.frame >> 4))
    cv.set(x, y, tw > 0.85 ? '#ffffff' : tw > 0.5 ? '#9aa3c7' : '#4c5480')
  }
  // a crescent moon
  const mx = Math.floor(w * 0.84), my = 3, r = ph >= 14 ? 2.6 : 1.8
  for (let y = 0; y < ph; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x - mx) / 2, y - my), d2 = Math.hypot((x - mx - 2.2) / 2, y - my + 0.4)
    if (d <= r && d2 > r * 0.95) cv.set(x, y, bowing ? '#fff6cf' : '#f1e3a8')
  }
  // clouds drifting right to left, a shade lighter than the sky
  for (let k = 0; k < 3; k++) {
    const cx = ((w + 30) - ((s.frame * (0.12 + k * 0.05) + k * 37) % (w + 30))) - 15
    const cy = 2 + k * 2, rx = 7 + k * 2, ry = 1.4
    for (let y = 0; y < ph; y++) for (let x = 0; x < w; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) cv.set(x, y, '#1c2146')
    }
  }
  // the skyline: buildings with windows that blink slowly; the bow lights them all
  const ground = ph - 1
  let bx = 0, b = 0
  while (bx < w) {
    const bw = 4 + Math.floor(noise(b, 21) * 6), bh = 3 + Math.floor(noise(b, 22) * Math.max(1, ph * 0.4))
    for (let y = ground - bh; y <= ground; y++) for (let x = bx; x < Math.min(w, bx + bw); x++) cv.set(x, y, '#05060f')
    // snow on the roofs
    if (winter) for (let x = bx; x < Math.min(w, bx + bw); x++) cv.set(x, ground - bh, '#dfe6f5')
    for (let y = ground - bh + 1; y < ground; y += 2) for (let x = bx + 1; x < Math.min(w, bx + bw - 1); x += 2) {
      const lit = bowing || noise(x, y + (s.frame >> 6)) > 0.62
      if (lit) cv.set(x, y, noise(x, y) > 0.5 ? '#ffd37a' : '#ffb85c')
    }
    bx += bw + 1 + Math.floor(noise(b, 23) * 3)
    b++
  }
  const since = s.frame - s.lastHit
  if (winter) {
    // snow, drifting; a tool call is a gust that pushes every flake sideways; it keeps falling for the bow
    const gust = since >= 0 && since < 10 ? Math.round(Math.sin((since / 10) * Math.PI) * 4) : 0
    for (let i = 0; i < Math.floor(w / 1.6); i++) {
      const x = Math.floor(noise(i, 31) * w + Math.sin((s.frame + i * 7) / 9) * 1.5 + gust + w) % w
      const y = Math.floor(s.frame * (0.25 + noise(i, 32) * 0.25) + noise(i, 33) * ph * 3) % (ph + 1)
      cv.set(x, y, noise(i, 34) > 0.5 ? '#ffffff' : '#c9d3ea')
    }
    // snow on the ground line
    for (let x = 0; x < w; x++) if (cv.px[ground * w + x] !== '#05060f') cv.set(x, ground, '#dfe6f5')
  } else if (!bowing) {
    // rain, falling; it stops for the bow
    for (let i = 0; i < Math.floor(w / 2.5); i++) {
      const x = Math.floor(noise(i, 31) * w)
      const y = Math.floor(s.frame * (0.8 + noise(i, 32) * 0.6) + noise(i, 33) * ph * 3) % (ph + 2)
      cv.set(x, y, '#5f74b8')
      cv.set(x, y - 1, '#3f4f8a')
    }
  }
  // a shooting star for a tool call
  if (!winter && since >= 0 && since < 9 && !bowing) {
    const x0 = Math.floor(noise(s.lastHit, 41) * w * 0.7), y0 = Math.floor(noise(s.lastHit, 42) * ph * 0.3)
    for (let k = 0; k < 6; k++) cv.set(x0 + since * 3 - k * 2, y0 + since - Math.floor(k / 2), k === 0 ? '#ffffff' : k < 3 ? '#cfd6ff' : '#6f7cc0')
  }
  if (bowing) cv.centered('DONE', Math.max(0, Math.floor((ph - 7) / 2) - 1), '#e6dcff', '#070b1c')
}

// an aquarium: a lit tank, sand, weeds that sway, fish that cross and turn, bubbles that rise; a
// tool call is a burst of bubbles, a subagent is one more fish, the bow lets everything drift
const WATER = ['#0b3d63', '#0a3659', '#092f50', '#082947', '#07233e', '#061d35', '#05182d']
const FISH_COLORS = ['#ffb347', '#ff6b6b', '#ffd93d', '#6bcbff', '#c77dff']
const FISH: string[][] = [
  ['.##..', '####>', '.##..'],
  ['..#..', '.###>', '..#..'],
]
function sceneAquarium(cv: Canvas, world: World, bowing: boolean) {
  const { s, w, ph, guests } = world
  cv.gradient(WATER)
  // light from above, wavering
  for (let x = 0; x < w; x++) if (noise(x, 51 + (s.frame >> 3)) > 0.86) cv.set(x, 0, '#1a5a86')
  // sand
  for (let x = 0; x < w; x++) { cv.set(x, ph - 1, noise(x, 52) > 0.5 ? '#b8a27a' : '#a8926a'); if (noise(x, 53) > 0.7) cv.set(x, ph - 2, '#8f7a55') }
  // weeds
  for (let k = 0; k < Math.floor(w / 14); k++) {
    const x0 = Math.floor(noise(k, 54) * w), height = 3 + Math.floor(noise(k, 55) * (ph - 5))
    for (let y = ph - 2; y > ph - 2 - height; y--) cv.set(x0 + Math.round(Math.sin((s.frame + y * 2 + k * 5) / 7) * 1.2), y, (ph - 2 - y) % 2 ? '#2f9e5b' : '#227a45')
  }
  // fish: three regulars and one per guest, each with a lane and a speed
  const want = 3 + Math.min(3, guests)
  if (s.fish.length !== want) s.fish = Array.from({ length: want }, (_, i) => [noise(i, 61) * w, 2 + Math.floor(noise(i, 62) * (ph - 6)), noise(i, 63) > 0.5 ? 1 : -1, 0.25 + noise(i, 64) * 0.35, i])
  const slow = bowing ? 0.3 : 1
  s.fish.forEach((f, i) => {
    f[0] += f[2] * f[3] * slow
    if (f[0] > w + 6) { f[2] = -1; f[1] = 2 + Math.floor(noise(i, s.frame) * (ph - 6)) }
    if (f[0] < -6) { f[2] = 1; f[1] = 2 + Math.floor(noise(i, s.frame + 1) * (ph - 6)) }
    const rows = FISH[f[4] % FISH.length].map(r => (f[2] === 1 ? r : r.split('').reverse().join('').replace('>', '<')))
    const colour = i >= 3 ? '#5cff6a' : FISH_COLORS[i % FISH_COLORS.length]
    cv.sprite(rows.map(r => r.replace(/[<>]/g, '#')), Math.round(f[0]), f[1] + Math.round(Math.sin((s.frame + i * 9) / 8)), colour)
  })
  // bubbles: a slow trickle, a burst for a tool call
  const since = s.frame - s.lastHit
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(noise(i, 71) * w), y = ph - 2 - (Math.floor(s.frame * (0.4 + noise(i, 72) * 0.3) + noise(i, 73) * ph * 2) % (ph - 1))
    cv.set(x + Math.round(Math.sin((s.frame + i) / 4)), y, '#9fd8ff')
  }
  if (since >= 0 && since < 12) {
    const bx = Math.floor(noise(s.lastHit, 74) * w)
    for (let i = 0; i < 10; i++) cv.set(bx + Math.round((noise(i, s.lastHit) - 0.5) * 8), ph - 2 - since - Math.floor(noise(i, 75) * 3), i % 2 ? '#dff4ff' : '#9fd8ff')
  }
  if (bowing) cv.centered('DONE', Math.max(0, Math.floor((ph - 7) / 2) - 1), '#e6f4ff', '#05182d')
}

// a campfire: a night with a few stars, two trees, logs and a small fire that breathes; embers
// drift up, more for every tool call; the bow lets it burn down to a glow
function sceneCampfire(cv: Canvas, world: World, bowing: boolean) {
  const { s, w, ph } = world
  cv.fill('#050609')
  for (let i = 0; i < Math.floor(w / 3); i++) {
    const x = Math.floor(noise(i, 81) * w), y = Math.floor(noise(i, 82) * ph * 0.55)
    cv.set(x, y, noise(i, 83 + (s.frame >> 4)) > 0.8 ? '#e9ecff' : '#6b7090')
  }
  // ground and two tree silhouettes
  for (let x = 0; x < w; x++) cv.set(x, ph - 1, '#0d1a10')
  const tree = (cx: number, top: number) => { for (let y = top; y < ph - 1; y++) { const half = Math.floor(((y - top) / (ph - 1 - top)) * 5) + 1; for (let x = cx - half; x <= cx + half; x++) cv.set(x, y, '#10301c') } }
  tree(Math.floor(w * 0.12), 1)
  tree(Math.floor(w * 0.9), 2)
  // the fire: a narrow band of the heat buffer under the middle of the canvas
  const fw = 15, fx = Math.floor(w / 2) - Math.floor(fw / 2)
  const f = fireBuffer(s, fw, ph)
  const heat = bowing ? 0.12 : 0.3 + s.energy * 0.5
  for (let x = 0; x < fw; x++) {
    const edge = 1 - Math.abs(x - fw / 2) / (fw / 2)
    f[(ph - 2) * fw + x] = noise(x, s.frame) < heat * edge ? 63 : Math.floor(noise(x + 7, s.frame) * 18 * edge)
  }
  burn(f, fw, ph, ph - 2, 63 / (ph * (bowing ? 0.25 : 0.45 + s.energy * 0.25)), s.frame)
  for (let y = 0; y < ph - 1; y++) for (let x = 0; x < fw; x++) { const v = f[y * fw + x]; if (v >= 2) cv.set(fx + x, y, ember(v)) }
  // logs
  for (let x = fx + 2; x < fx + fw - 2; x++) cv.set(x, ph - 2, (x % 3) ? '#5a3a1e' : '#3e2814')
  cv.set(fx + 4, ph - 3, '#5a3a1e'); cv.set(fx + fw - 5, ph - 3, '#5a3a1e')
  // embers: a few rise and fade; a tool call throws a handful more
  const since = s.frame - s.lastHit
  const count = 4 + (since >= 0 && since < 14 ? 8 : 0) + Math.floor(s.energy * 4)
  for (let i = 0; i < count; i++) {
    const age = (s.frame + Math.floor(noise(i, 91) * 40)) % 40
    const x = fx + Math.floor(fw / 2) + Math.round((noise(i, 92) - 0.5) * 6 + Math.sin((age + i) / 3) * 1.5)
    const y = ph - 3 - Math.floor(age * 0.35 * (0.6 + noise(i, 93)))
    if (y > 0) cv.set(x, y, age < 10 ? '#ffb347' : age < 25 ? '#ff7a3d' : '#7a2e12')
  }
  // a faint glow on the ground either side
  for (let x = fx - 6; x < fx + fw + 6; x++) if (x >= 0 && x < w && (x < fx || x >= fx + fw)) cv.set(x, ph - 1, '#1a1a10')
  if (bowing) cv.centered('DONE', 1, '#ffd9a8', '#050609')
}

const MARKS: Record<Scene, [mark: string, accent: string]> = {
  night: ['☾', '#f1e3a8'], snow: ['❄', '#dfe6f5'], aquarium: ['≈', '#9fd8ff'], campfire: ['✶', '#ffb347'],
  fire: ['♨', '#ff7a3d'], plasma: ['◉', '#ffffff'], cube: ['◇', '#5cff6a'], matrix: ['⌗', '#4ae052'],
}

function fireworks(cv: Canvas, s: State) {
  if (s.bow === BOW_FRAMES || (s.bow % 8 === 0 && s.bow > 6)) {
    const cx = noise(s.bow, 1) * cv.w, cy = noise(s.bow, 2) * cv.ph * 0.6, hue = noise(s.bow, 3)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, sp = 0.8 + noise(i, s.bow) * 1.2
      s.sparks.push([cx, cy, Math.cos(a) * sp * 2, Math.sin(a) * sp, 14, hue])
    }
  }
  s.sparks = s.sparks.filter(p => p[4] > 0)
  for (const p of s.sparks) {
    p[0] += p[2]; p[1] += p[3]; p[3] += 0.12; p[4]--
    cv.set(p[0], p[1], hsv(p[5], 0.6, Math.min(1, p[4] / 8)))
  }
}

export default function Stage(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.setState({
      frame: 0, bow: 0, working: props?.isWorking ?? true, seenHits: props?.hits ?? 0, flash: 0, energy: 0, lastHit: -100, turnSince: 0,
      auto: 0, sceneSince: 0,
      fire: [], fireW: 0, stars: [], fish: [], drops: [], speeds: [], sparks: [],
    })
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (!s) return
      if (s.bow === 1) surface.post({ done: true })
      const frame = s.frame + 1
      const auto = frame - s.sceneSince > SCENE_FRAMES && s.bow === 0 ? (s.auto + 1) % SCENES.length : s.auto
      surface.setState({
        ...s, frame, auto, sceneSince: auto === s.auto ? s.sceneSince : frame,
        bow: Math.max(0, s.bow - 1), flash: Math.max(0, s.flash - 1), energy: s.energy * 0.96,
      })
    })
    // a click changes the scene: the hooks module advances a pinned one, auto mode advances here
    surface.onPointer(ev => {
      const s = surface.state
      if (!s || ev.type !== 'down') return
      surface.post({ next: true })
      surface.setState({ ...s, auto: (s.auto + 1) % SCENES.length, sceneSince: s.frame })
    })
  }
  const s = surface.state
  if (!s) return <Text dimColor>lofi · warming up</Text>

  const working = props?.isWorking ?? false
  const hits = props?.hits ?? 0
  if (s.working && !working && s.bow === 0) surface.setState({ ...s, working: false, bow: BOW_FRAMES, sparks: [] })
  else if (!s.working && working) surface.setState({ ...s, working: true, bow: 0, seenHits: hits, turnSince: s.frame })
  else if (working && hits !== s.seenHits) surface.setState({ ...s, seenHits: hits, flash: FLASH_FRAMES, energy: Math.min(1, s.energy + 0.35), lastHit: s.frame })

  const bowing = s.bow > 0
  // quiet: no flashes; the lofi scene answers a hit with a shooting star instead
  const hit = s.flash > 0 && !bowing && !props?.quiet
  // an ultra-wide terminal gets no more pixels than this; the runs stay cheap and the scenes stay composed
  const w = Math.min(160, Math.max(20, surface.columns || 80))
  const rows = Math.max(3, (props?.rows ?? 8) - 1)
  const ph = rows * 2
  const regulars = Math.max(1, Math.min(4, Math.floor(w / 28)))
  const guests = Math.min(Math.max(0, props?.guests ?? 0), Math.max(0, Math.min(5, Math.floor(w / 24)) - regulars))
  const scene: Scene = props?.scene && props.scene !== 'auto' ? props.scene : SCENES[s.auto]
  const world: World = { s, w, ph, hit, guests, regulars, props }

  let body: RenderChildren[]
  if (scene === 'matrix') body = sceneMatrix(Text, world, bowing, rows)
  else {
    const cv = new Canvas(w, ph)
    if (scene === 'fire') sceneFire(cv, world, bowing)
    else if (scene === 'plasma') scenePlasma(cv, world, bowing)
    else if (scene === 'night') sceneLofi(cv, world, bowing)
    else if (scene === 'snow') sceneLofi(cv, world, bowing, true)
    else if (scene === 'aquarium') sceneAquarium(cv, world, bowing)
    else if (scene === 'campfire') sceneCampfire(cv, world, bowing)
    else sceneCube(cv, world, bowing)
    if (bowing && !CALM.has(scene)) fireworks(cv, s)
    body = paintRows(Text, cv)
  }

  // the session clock: elapsed when this frame's props were handed over, plus the frames since
  if (props?.renderedAt !== undefined && props.renderedAt !== s.handedAt) surface.setState({ ...s, handedAt: props.renderedAt, handedFrame: s.frame })
  const sessionMs = props?.sessionStartedAt && props.renderedAt ? props.renderedAt - props.sessionStartedAt + (s.frame - (s.handedFrame ?? s.frame)) * TICK_MS : 0
  const sessionClock = hms(Math.floor(sessionMs / 1000))

  // the caption: mark and scene, then state, clocks, what the turn did, the music; hints only while idle
  const [mark, accent] = MARKS[scene]
  const calm = CALM.has(scene)
  const turnClock = hms(Math.floor(((s.frame - s.turnSince) * TICK_MS) / 1000))
  const session = `session ${sessionClock}`
  const tally = `${hits} tool call${hits === 1 ? '' : 's'}`
  const musicNote = props?.music ? `♪ ${props?.track || 'music'}` : ''
  const guestsNote = guests > 0 ? `${guests} subagent${guests > 1 ? 's' : ''}` : ''
  type Seg = { text: string; tone: 'ink' | 'dim' | 'gold' | 'flash' }
  const seg = (text: string, tone: Seg['tone'] = 'dim'): Seg => ({ text, tone })
  const idle = props?.idle === true
  let segs: Seg[]
  if (bowing) segs = calm
    ? [seg('done', 'ink'), seg(turnClock, 'ink'), seg(tally), seg(session)]
    : [seg(`${tally} in ${turnClock}`, 'gold'), seg(session)]
  else if (idle) segs = [seg('idle'), seg(session), seg(musicNote), seg('click for the next scene'), seg('/lofi off')]
  else segs = [seg('working'), seg(turnClock, 'ink'), seg(props?.summary ?? '', calm ? 'dim' : hit ? 'flash' : 'gold'), seg(session), seg(guestsNote), seg(musicNote)]
  const head = bowing && !calm
    ? [<Text color="#ffd23f" bold>{'★ ta-da'}</Text>]
    : [<Text color={accent} bold={!calm}>{mark}</Text>, <Text>{' '}</Text>, <Text color={calm ? undefined : accent} bold={!calm}>{scene}</Text>]
  const rest: RenderChildren[] = []
  for (const { text, tone } of segs) {
    if (!text) continue
    rest.push(<Text dimColor>{' · '}</Text>)
    rest.push(
      tone === 'ink' ? <Text>{text}</Text>
      : tone === 'gold' ? <Text color="#ffd23f">{text}</Text>
      : tone === 'flash' ? <Text color="yellowBright" bold>{text}</Text>
      : <Text dimColor>{text}</Text>,
    )
  }
  const status = <Text wrap="truncate-end">{[...head, ...rest]}</Text>

  return (
    <Box flexDirection="column">
      {body}
      {status}
    </Box>
  )
}
