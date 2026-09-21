import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

// the world beneath the mod, registered before the first call on $: a session, a command table,
// a store that remembers writes, and a screen that accepts invalidations
const world = (on: On, stored: Record<string, unknown> = {}) => {
  const registered: string[] = []
  const played: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on)
  // a loop resolves only when its signal aborts, so the mock never resolves: the mod treats a
  // pending play as "still playing" and must not start a second one
  on('audio.play', ($, e) => {
    played.push(e.clip.asset ?? e.clip.url ?? 'bytes')
    return new Promise<never>(() => {})
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return { registered, stored, played }
}

const typed = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }

describe('register', () => {
  test('session start registers /lofi', async ($, on) => {
    const { registered } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    expect(registered).toEqual(['lofi'])
  })

  test('/lofi off, next and a named scene are remembered in the store', async ($, on) => {
    const { stored } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

    const off = await $.command.run({ command: 'lofi', args: 'off', ...typed })
    expect(off.text).toContain('off')
    expect(stored.enabled).toBe(false)

    const next = await $.command.run({ command: 'lofi', args: 'next', ...typed })
    expect(next.text).toContain('scene snow')
    expect(stored.scene).toBe('snow')

    const cube = await $.command.run({ command: 'lofi', args: 'cube', ...typed })
    expect(cube.text).toContain('scene cube')
    expect(stored.scene).toBe('cube')
  })

  test('music is off until /lofi music on, then plays at turn start', async ($, on) => {
    const { stored, played } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.start({ turnId: 't1', text: 'go' })
    expect(played).toEqual([])
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 10, isAborted: false })

    const on1 = await $.command.run({ command: 'lofi', args: 'music on', ...typed })
    expect(on1.text).toContain('music on')
    expect(stored.music).toBe(true)
    await $.turn.start({ turnId: 't2', text: 'go' })
    expect(played).toEqual(['audio/night.mp3'])
    await $.turn.complete({ turnId: 't2', reason: 'answer', answer: '', durationMs: 10, isAborted: false })
  })

  test('/lofi always is remembered and shows in the state line', async ($, on) => {
    const { stored } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const on1 = await $.command.run({ command: 'lofi', args: 'always', ...typed })
    expect(on1.text).toContain('keeps running between turns')
    expect(stored.always).toBe(true)
    const help = await $.command.run({ command: 'lofi', args: 'help', ...typed })
    expect(help.text).toContain('· always on')
    const off = await $.command.run({ command: 'lofi', args: 'always off', ...typed })
    expect(off.text).toContain('always off')
    expect(stored.always).toBe(false)
  })

  test('in always mode the music starts at once and survives the end of a turn', async ($, on) => {
    const { played } = world(on, { music: true })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run({ command: 'lofi', args: 'always', ...typed })
    expect(played).toEqual(['audio/night.mp3'])
    await $.turn.start({ turnId: 't1', text: 'go' })
    await $.turn.complete({ turnId: 't1', reason: 'answer', answer: '', durationMs: 10, isAborted: false })
    await $.turn.start({ turnId: 't2', text: 'go' })
    // one loop the whole time: no second start
    expect(played).toHaveLength(1)
  })

  test('/lofi music <track> switches the loop on the air and is remembered', async ($, on) => {
    const { stored, played } = world(on, { music: true, always: true })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    // always on with music: the lofi scene's own track starts at once
    expect(played).toEqual(['audio/night.mp3'])
    const warm = await $.command.run({ command: 'lofi', args: 'music warm', ...typed })
    expect(warm.text).toContain('music warm')
    expect(stored.track).toBe('warm')
    expect(played).toEqual(['audio/night.mp3', 'audio/warm.mp3'])
    const next = await $.command.run({ command: 'lofi', args: 'music next', ...typed })
    expect(next.text).toContain('music deep')
    expect(played[played.length - 1]).toBe('audio/deep.mp3')
    // back to auto: the aquarium asks for deep, so nothing restarts; the campfire asks for rain
    await $.command.run({ command: 'lofi', args: 'music auto', ...typed })
    await $.command.run({ command: 'lofi', args: 'aquarium', ...typed })
    expect(played[played.length - 1]).toBe('audio/deep.mp3')
    await $.command.run({ command: 'lofi', args: 'campfire', ...typed })
    expect(played[played.length - 1]).toBe('audio/rain.mp3')
  })

  test('bare /lofi turns it on and keeps it on between turns', async ($, on) => {
    const { stored } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const r = await $.command.run({ command: 'lofi', args: '', ...typed })
    expect(r.text).toContain('keeps running between turns')
    expect(stored.always).toBe(true)
    expect(stored.enabled).toBe(true)
  })

  test('/lofi help prints the help', async ($, on) => {
    world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const help = await $.command.run({ command: 'lofi', args: 'help', ...typed })
    expect(help.text).toContain('/lofi music on')
    expect(help.text).toContain('scene night')
  })

  test('a saved scene is restored at session start', async ($, on) => {
    world(on, { scene: 'matrix' })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const on2 = await $.command.run({ command: 'lofi', args: 'on', ...typed })
    expect(on2.text).toContain('scene matrix')
  })
})
