/* @jsx h */
import type { EngineInterface, Register } from 'claude-code'

// lofi: while a turn runs a scene plays above the prompt (./boards/stage.tsx draws it), a tiny
// dancer joins the spinner, and a generated loop can play. This module decides when the stage is
// mounted, feeds it what Claude is doing, runs the music and remembers the switches.

const SCENES = ['night', 'snow', 'aquarium', 'campfire', 'fire', 'plasma', 'cube', 'matrix'] as const
const TRACKS = ['night', 'rain', 'warm', 'deep'] as const
type Scene = (typeof SCENES)[number] | 'auto'
type Track = (typeof TRACKS)[number]
const isScene = (v: unknown): v is Scene => v === 'auto' || (SCENES as readonly unknown[]).includes(v)
const isTrack = (v: unknown): v is Track | 'auto' => v === 'auto' || (TRACKS as readonly unknown[]).includes(v)
// the loop each scene asks for when the track is on auto
const TRACK_FOR: Record<Exclude<Scene, 'auto'>, Track> = {
  night: 'night', snow: 'warm', aquarium: 'deep', campfire: 'rain', fire: 'night', plasma: 'warm', cube: 'deep', matrix: 'rain',
}

let enabled = true
// stays true through the bow after a turn ends; the board posts { done: true } when it has bowed
let mounted = false
let always = false
let scene: Scene = 'night'
let track: Track | 'auto' = 'auto'
let music = false
let quiet = false
let volume = 0.6
let spinner = true
let beat: { cancel: () => void } | undefined
let beatFrame = 0
let turnRunning = false
let sessionStartedAt = 0
let playing: AbortController | undefined
let onAir: Track | undefined
// what this turn has done so far: the status line, the beat, words for the matrix rain
let hits = 0
let lastTool = ''
let tools: Record<string, number> = {}
let guests = 0
let words: string[] = []

const wanted = (): Track => (track === 'auto' ? TRACK_FOR[scene === 'auto' ? 'night' : scene] : track)
const summary = () =>
  Object.entries(tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(' · ')

// starts the loop the state asks for, replacing whatever is on the air
function play($: EngineInterface) {
  playing?.abort()
  const stop = new AbortController()
  playing = stop
  onAir = wanted()
  $.audio.play({ asset: `audio/${onAir}.mp3` }, { shouldLoop: true, gain: volume, signal: stop.signal })
    .catch(err => $.ui.log(`music could not play: ${err}`))
    .finally(() => {
      if (playing === stop) { playing = undefined; onAir = undefined }
      $.ui.invalidate('ui.render')
    })
}

export const register: Register = (on, options) => {
  music = options.music === true
  spinner = options.spinner !== false
  always = options.always === true
  quiet = options.quiet === true
  volume = typeof options.volume === 'number' ? Math.max(0, Math.min(2, options.volume)) : 0.6
  if (isScene(options.scene)) scene = options.scene
  if (isTrack(options.track)) track = options.track

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    sessionStartedAt = await $.clock.now()
    const [savedMusic, savedAlways, savedTrack, savedEnabled, savedScene, seen] = await Promise.all(
      ['music', 'always', 'track', 'enabled', 'scene', 'seen'].map(key => $.store.get(key).catch(() => undefined)),
    )
    if (typeof savedMusic === 'boolean') music = savedMusic
    if (typeof savedAlways === 'boolean') always = savedAlways
    if (isTrack(savedTrack)) track = savedTrack
    if (savedEnabled === false) enabled = false
    if (isScene(savedScene)) scene = savedScene
    if (always && enabled) {
      mounted = true
      if (music) play($)
    }
    if (seen !== true) {
      await $.store.set('seen', true).catch(() => undefined)
      $.ui.toast('lofi · a demo plays above the prompt while Claude works · /lofi for the scenes, /lofi music on for the lofi loop', { timeoutMs: 8000 })
    }
    await $.command
      .register({
        name: 'lofi',
        description: 'A demo plays above the prompt while Claude works: on, off, next, auto, a scene name, music on|off (lofi)',
        argumentHint: '[on | off | always | next | auto | <scene> | music on|off|next|<track>]',
        immediate: true,
      })
      .catch(err => $.ui.log(`/lofi not registered: ${err}`))
    return r
  })

  on('command.run', { command: 'lofi' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const save = (key: string, value: boolean | string) =>
      $.store.set(key, value).catch(err => $.ui.log(`store write failed: ${err}`))
    let text: string
    if (arg === 'help') {
      text = [
        `${enabled ? 'on' : 'off'} · scene ${scene} · music ${music ? `on (${track === 'auto' ? `auto: ${wanted()}` : track})` : 'off'}${always ? ' · always on' : ''}`,
        '/lofi            start the night and keep it running · /lofi off',
        '/lofi <scene>    pin one: night, snow, aquarium, campfire, fire, plasma, cube, matrix',
        '/lofi auto       cycle the scenes every few seconds (a click on the band skips ahead)',
        '/lofi next       pin the next scene',
        '/lofi music on   a generated lofi loop · /lofi music off',
        '/lofi music <t>  pick the loop: night, rain, warm, deep, auto (by scene) · /lofi music next',
        '/lofi on         only while Claude works · /lofi always brings it back between turns',
        'defaults live in /config under lofi',
      ].join('\n')
    } else if (arg === 'off') {
      enabled = false
      mounted = false
      playing?.abort()
      await save('enabled', false)
      text = 'off · /lofi on brings it back'
    } else if (arg === 'on') {
      enabled = true
      await save('enabled', true)
      text = `on · scene ${scene} · music ${music ? 'on' : 'off'}`
    } else if (arg === '' || arg === 'always' || arg === 'always on' || arg === 'always off') {
      // bare /lofi is the front door: on, and on between turns
      always = arg === 'always' ? !always : arg !== 'always off'
      if (always) enabled = true
      mounted = always
      await save('always', always)
      if (always) await save('enabled', true)
      if (always && music && !playing) play($)
      if (!always) playing?.abort()
      text = always ? `on · scene ${scene} · music ${music ? 'on' : 'off'} · keeps running between turns · /lofi off` : 'always off · runs while Claude works'
    } else if (arg === 'music' || arg === 'music on' || arg === 'music off') {
      music = arg === 'music' ? !music : arg === 'music on'
      await save('music', music)
      if (!music) playing?.abort()
      else if (always && enabled && !playing) play($)
      text = music ? (always ? 'music on · the lofi loop plays all the time' : 'music on · the lofi loop plays while Claude works') : 'music off'
    } else if (arg === 'music list') {
      text = `tracks: ${TRACKS.join(' · ')} · auto (now ${track}${onAir ? `, on air: ${onAir}` : ''})`
    } else if (arg.startsWith('music ')) {
      const want = arg.slice(6).trim()
      if (want === 'next') track = TRACKS[((TRACKS as readonly string[]).indexOf(track) + 1) % TRACKS.length]
      else if (isTrack(want)) track = want
      else return { text: `no track called "${want}" · /lofi music list` }
      music = true
      await save('track', track)
      await save('music', true)
      if (enabled && (always || turnRunning) && (!playing || onAir !== wanted())) play($)
      text = track === 'auto' ? `music auto · ${wanted()} for the ${scene} scene` : `music ${track}`
    } else if (arg === 'next') {
      scene = SCENES[((SCENES as readonly string[]).indexOf(scene) + 1) % SCENES.length]
      await save('scene', scene)
      text = `scene ${scene} · /lofi auto cycles them again`
    } else if (isScene(arg)) {
      scene = arg
      await save('scene', scene)
      if (track === 'auto' && playing && onAir !== wanted()) play($)
      text = scene === 'auto' ? 'scenes cycle every few seconds · click the band to skip ahead' : `scene ${scene}`
    } else return { text: `/lofi on · off · next · auto · ${SCENES.join(' · ')} · music on|off · /lofi help` }
    $.ui.invalidate('ui.render')
    return { text }
  })

  on('turn.start', async ($, e, next) => {
    turnRunning = true
    hits = 0
    lastTool = ''
    tools = {}
    guests = 0
    words = []
    if (spinner && !beat) {
      beat = $.clock.every(180, () => {
        beatFrame++
        $.ui.invalidate('ui.render')
      })
    }
    if (enabled && music && !playing) play($)
    return next(e)
  })

  on('session.detach', async ($, e, next) => {
    playing?.abort()
    beat?.cancel()
    beat = undefined
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    turnRunning = false
    if (!always) playing?.abort()
    beat?.cancel()
    beat = undefined
    $.ui.invalidate('ui.render')
    return r
  })

  // the spinner word is rewritten, not wrapped: the engine repaints it on its own clock and would blank a wrapper
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!spinner || e.surface !== 'terminal') return next(e)
    const frames = e.props.mode === 'tool-use' ? ['\\o/', ' o ', '\\o/', ' o '] : ['o/', '\\o', 'o/', '\\o/']
    return next({ ...e, props: { ...e.props, word: `${frames[beatFrame % frames.length]} ${e.props.word}` } })
  })

  on('tool.call', async ($, e, next) => {
    const main = e.agentId === undefined
    if (main && enabled) {
      hits++
      lastTool = e.tool
      tools[e.tool] = (tools[e.tool] ?? 0) + 1
      if (e.tool === 'Agent') guests++
      const args = e as unknown as Record<string, unknown>
      const text = [args.new_string, args.content, args.command, args.pattern, args.file_path, args.prompt].find(v => typeof v === 'string')
      if (typeof text === 'string') {
        const fresh = text.split(/[^A-Za-z0-9_$.]+/).filter(t => t.length >= 2 && t.length <= 16)
        words = [...new Set([...fresh.slice(-40), ...words])].slice(0, 80)
      }
      $.ui.invalidate('ui.render')
    }
    try {
      return await next(e)
    } finally {
      if (main && enabled && e.tool === 'Agent') {
        guests = Math.max(0, guests - 1)
        $.ui.invalidate('ui.render')
      }
    }
  })

  // the board speaks: clicked (next scene), or its bow is over (clear the band)
  on('ui.message', async ($, e, next) => {
    const data = e.data as { done?: unknown; next?: unknown } | null
    if (data?.next === true && scene !== 'auto') {
      scene = SCENES[(SCENES.indexOf(scene) + 1) % SCENES.length]
      await $.store.set('scene', scene).catch(() => undefined)
      if (track === 'auto' && playing && onAir !== wanted()) play($)
      $.ui.invalidate('ui.render')
    } else if (data?.done === true && !always) {
      mounted = false
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!enabled || e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    if (e.props.isWorking || always) mounted = true
    if (!mounted) return next(e)
    const { Box, Client } = await $.ui.resolve(e)
    const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    // as tall as the band allows, up to 12 rows: pixels above, one status line
    const rows = Math.min(12, Math.max(4, e.props.maxRows - 1))
    return (
      <Box flexDirection="column">
        <Client
          key="lofi:floor"
          module="./boards/stage.tsx"
          width={cols}
          height={rows}
          props={{ isWorking: e.props.isWorking || always, idle: always && !e.props.isWorking, scene, rows, hits, lastTool, summary: summary(), guests, words, quiet, music: music && playing !== undefined, track: onAir ?? '', sessionStartedAt, renderedAt: await $.clock.now() }}
        />
        {await next(e)}
      </Box>
    )
  })
}
