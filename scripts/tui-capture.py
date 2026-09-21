import os, pty, time, select, signal, fcntl, termios, struct, pyte, argparse
ap = argparse.ArgumentParser()
ap.add_argument('--plugin', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--prompt', default='write 250 words about ducks, no headings')
ap.add_argument('--cols', type=int, default=100); ap.add_argument('--rows', type=int, default=32)
ap.add_argument('--warm', type=float, default=7); ap.add_argument('--run', type=float, default=22)
ap.add_argument('--every', type=float, default=1.5); ap.add_argument('--out', default='frames')
ap.add_argument('--pre', default='')  # a command to send before the prompt, e.g. "/lofi next"
ap.add_argument('--cwd', default=None)  # where claude starts; must be a folder you already trust
ap.add_argument('--no-kill', action='store_true')  # after /exit, wait for claude to end on its own
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
env = {k: v for k, v in os.environ.items() if not k.startswith('CLAUDECODE') and k != 'CLAUDE_CODE_ENTRYPOINT'}
env = dict(env, TERM='xterm-256color', COLUMNS=str(a.cols), LINES=str(a.rows), CLAUDE_CODE_ENABLE_FUNCTION_HOOKS='1')
os.chdir(a.cwd or os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
pid, fd = pty.fork()
if pid == 0:
    os.execvpe('claude', ['claude', '--plugin-dir', a.plugin, '--model', 'haiku', '--debug-file', a.out + '/debug.log'], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', a.rows, a.cols, 0, 0))
raw = open(f'{a.out}/raw.bin', 'wb')
screen = pyte.Screen(a.cols, a.rows); stream = pyte.ByteStream(screen)
def pump(until):
    while time.time() < until:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try: data = os.read(fd, 65536)
            except OSError: return False
            if not data: return False
            raw.write(data); raw.flush(); stream.feed(data)
    return True
def snap(name):
    lines = [l.rstrip() for l in screen.display]
    with open(f'{a.out}/{name}.txt', 'w') as f: f.write('\n'.join(lines))
pump(time.time() + a.warm); snap('00-idle')
if a.pre:
    os.write(fd, a.pre.encode() + b'\r'); pump(time.time() + 2); snap('01-pre')
os.write(fd, a.prompt.encode()); pump(time.time() + 0.5); os.write(fd, b'\r')
t0 = time.time(); i = 0
while time.time() - t0 < a.run:
    if not pump(time.time() + a.every): break
    i += 1; snap(f'{i+1:02d}-t{int(time.time()-t0):02d}s')
os.write(fd, b'/exit\r'); pump(time.time() + (6 if a.no_kill else 2))
if not a.no_kill:
    try: os.kill(pid, signal.SIGTERM)
    except Exception: pass
else:
    print('claude exited on its own:', os.waitpid(pid, os.WNOHANG)[0] == pid)
print('frames in', a.out)
