#!/usr/bin/env python3
"""Generate the lofi loops with ffmpeg. Nothing is sampled: sine chords with a slow
envelope, a bass, pink-noise crackle or rain, a low-pass and a slow wobble. Each track is eight bars
and loops cleanly. Run `python3 audio/generate.py` from the plugin folder; add a name to build one."""
import subprocess, sys, math

# name: (bpm, chords as [root, third, fifth, seventh] in Hz, bass Hz, noise, lowpass Hz, wobble Hz, extra)
TRACKS = {
    # Am7 · Dm7 · Gmaj7 · Cmaj7, the original night loop
    'night': (72, [[220, 261.63, 329.63, 392], [146.83, 174.61, 220, 261.63], [196, 246.94, 293.66, 369.99], [261.63, 329.63, 392, 493.88]], 55, 'pink', 1800, 0.4, None),
    # the same walk under real rain: brown noise, band-passed, with a slow swell
    'rain': (66, [[220, 261.63, 329.63, 392], [174.61, 220, 261.63, 329.63], [196, 246.94, 293.66, 349.23], [164.81, 196, 246.94, 293.66]], 55, 'rain', 1500, 0.3, None),
    # major sevenths, slower, brighter: Cmaj7 · Fmaj7 · Am7 · G6
    'warm': (64, [[261.63, 329.63, 392, 493.88], [174.61, 220, 261.63, 329.63], [220, 261.63, 329.63, 392], [196, 246.94, 293.66, 329.63]], 65.41, 'pink', 2400, 0.25, 'shimmer'),
    # minor and low: Em9 · Cmaj7 · Am7 · Bm7, sub bass, more crackle
    'deep': (58, [[164.81, 196, 246.94, 293.66], [130.81, 164.81, 196, 246.94], [110, 130.81, 164.81, 196], [123.47, 146.83, 185, 220]], 41.2, 'crackle', 1200, 0.5, None),
}

def build(name):
    bpm, chords, bass, noise, lowpass, wobble, extra = TRACKS[name]
    bar = 4 * 60 / bpm
    length = 8 * bar
    inputs, labels = [], []
    for i, (r, t, f, s) in enumerate(chords):
        t0 = i * 2 * bar
        expr = f"(sin(2*PI*{r}*t)+0.7*sin(2*PI*{t}*t)+0.6*sin(2*PI*{f}*t)+0.5*sin(2*PI*{s}*t))*0.18*exp(-1.2*mod(t,{bar}))*between(t,{t0},{t0 + 2 * bar})"
        inputs += ['-f', 'lavfi', '-i', f"aevalsrc='{expr}':d={length}:s=44100"]
    n = len(chords)
    inputs += ['-f', 'lavfi', '-i', f"aevalsrc='0.25*sin(2*PI*{bass}*t*(1+0.5*gte(mod(t,{bar * 2}),{bar})))*exp(-3*mod(t,{bar / 2}))':d={length}:s=44100"]
    if noise == 'rain':
        inputs += ['-f', 'lavfi', '-i', f"anoisesrc=d={length}:c=brown:r=44100:a=0.5"]
        noise_chain = f"[{n + 1}]highpass=f=400,lowpass=f=5000,tremolo=f=0.1:d=0.5,volume=0.9[cr]"
    elif noise == 'crackle':
        inputs += ['-f', 'lavfi', '-i', f"anoisesrc=d={length}:c=pink:r=44100:a=0.04"]
        noise_chain = f"[{n + 1}]highpass=f=2500,lowpass=f=7000,volume=0.7[cr]"
    else:
        inputs += ['-f', 'lavfi', '-i', f"anoisesrc=d={length}:c=pink:r=44100:a=0.02"]
        noise_chain = f"[{n + 1}]highpass=f=2000,lowpass=f=6000,volume=0.6[cr]"
    mix_in = ''.join(f'[{i}]' for i in range(n))
    chain = f"{mix_in}amix=inputs={n}:normalize=0[ch];[ch]lowpass=f={lowpass},tremolo=f={wobble}:d=0.25[chw];[{n}]lowpass=f=300[bs];{noise_chain};"
    if extra == 'shimmer':
        # a soft octave-up echo of the chords, far back
        chain += "[chw]asplit[cha][chb];[chb]asetrate=88200,aresample=44100,atempo=0.5,volume=0.08,aecho=0.6:0.4:300:0.3[sh];[cha][bs][cr][sh]amix=inputs=4:normalize=0"
    else:
        chain += "[chw][bs][cr]amix=inputs=3:normalize=0"
    chain += f",alimiter=limit=0.9,afade=t=in:d=1,afade=t=out:st={length - 1}:d=1[out]"
    out = f"{name}.mp3"
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', chain, '-map', '[out]', '-t', str(length), '-c:a', 'libmp3lame', '-q:a', '5', out]
    subprocess.run(cmd, check=True)
    print('wrote', out, f'{length:.1f}s')

if __name__ == '__main__':
    for name in (sys.argv[1:] or TRACKS):
        build(name)
