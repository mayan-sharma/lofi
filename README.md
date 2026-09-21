# lofi

A lofi night that plays in Claude Code while you work.

Type `/lofi` and a pixel scene appears in the band above the prompt: a night sky over a small
skyline, rain, drifting clouds, a crescent moon, windows that blink. Its own music plays under it.
It stays up for as long as you leave it on: while Claude works, between turns, all day.

```
☾ night · working · 0:06 · Read ×3 · session 1:42:10 · ♪ night
```

## Install

You need Claude Code 2.1.273 or later and function hooks on (they are early access). Put this in
your shell, or under `env` in `~/.claude/settings.json`:

    CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1

Then:

    claude plugin marketplace add mayan-sharma/lofi
    claude plugin install lofi@lofi

Open a new session and type `/lofi`. That's it. On a build without function hooks the plugin
installs and stays silent.

To run from a clone instead: `claude --plugin-dir ./lofi` for one session, or
`ln -s "$PWD/lofi" ~/.claude/skills/` to load it every session.

## Use

- `/lofi` — turn it on, and keep it on between turns too. `/lofi off` turns it off.
- `/lofi music on` — the loop plays. `/lofi music off` stops it. Off by default.
- `/lofi music night|rain|warm|deep` picks a loop; `/lofi music next` cycles; `/lofi music auto`
  lets the scene choose; `/lofi music list` shows what is on the air.
- `/lofi snow`, `aquarium`, `campfire` — the other calm scenes. `/lofi fire`, `plasma`, `cube`,
  `matrix` — the loud ones. `/lofi next` moves on, `/lofi auto` cycles every few seconds, and a
  click on the band skips ahead.
- `/lofi help` prints all of this with the current state.

Everything you set is remembered across sessions. Defaults live in `/config` under lofi: Music,
Volume, Scene, Track, Quiet (no flashes on tool calls), Spinner dancer, Always on.

## The scenes

The calm four answer a tool call with a small event, never a flash:

- **night** — the lofi night. A tool call is a shooting star; the bow lights every window.
- **snow** — the same town in winter. A tool call is a gust.
- **aquarium** — sand, weeds that sway, fish that cross and turn, bubbles. A tool call is a burst
  of bubbles; a subagent is one more fish.
- **campfire** — stars, two trees, logs and a small fire that breathes. A tool call throws embers.

The loud four make every tool call a beat, and end the turn with fireworks and a `TA-DA!`:

- **fire** — a fire that burns hotter the more tools Claude calls, with pixel stick figures dancing
  on it; a subagent joins as a green guest.
- **plasma** — a plasma with a sine-wave scroller of what Claude is doing.
- **cube** — a starfield that warps with the work, around a rotating wireframe cube.
- **matrix** — a rain of the identifiers Claude wrote or ran this turn.

A tiny dancer keeps the spinner line company the whole time.

## The music

Four loops, all generated, nothing sampled, nothing to license:

| track | feel                                              |
| ----- | ------------------------------------------------- |
| night | Am7 · Dm7 · Gmaj7 · Cmaj7 at 72 bpm, vinyl crackle |
| rain  | the same walk at 66 bpm under real rain           |
| warm  | major sevenths at 64 bpm, brighter, with a shimmer |
| deep  | minor and low at 58 bpm, sub bass                 |

`audio/generate.py` builds them with ffmpeg from sine chords, a bass, noise and a low-pass. Change a
chord list or a tempo and run `cd audio && python3 generate.py` to rebuild. Playback goes through Claude
Code's own player and stops when you leave the session.

## Privacy

The matrix scene draws identifiers taken from the arguments of Claude's tool calls this turn. They
are drawn on your screen and kept in memory for the turn; nothing is stored or sent anywhere.

## Develop

    claude plugin validate .claude-plugin/plugin.json
    claude plugin test .
    claude -p "/plugin-types" --plugin-dir .   # writes .claude/types for the compiler
    bunx -p typescript tsc -p .

`hooks/register.tsx` owns `/lofi`, the music, the spinner dancer and what the stage is told.
`hooks/boards/stage.tsx` is the surface module: a pixel canvas and the eight scenes, animated on the
drawing thread. Never name a local variable `h` in it (every JSX tag compiles to a call of `h`).

`scripts/tui-capture.py` runs the real TUI in a pseudo-terminal and snapshots the screen every
second, which is how the band is checked without a human at the keyboard:

    python3 -m venv .venv && .venv/bin/pip install pyte
    .venv/bin/python scripts/tui-capture.py --cwd ~ --out /tmp/frames --pre "/lofi" --prompt "reply with exactly: ok"

Facts about the band on Claude Code 2.1.273: hex colours render as true colour, a frame of ~1100
text nodes draws fine, a 32-row terminal gives the band 9 rows. Music is verified on macOS; other
platforms are untested, and a failure to play is logged and never touches the scene.

## Licence

MIT.
