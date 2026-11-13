#!/usr/bin/env python3
"""Read the day's front-page stories aloud with Kokoro and save them as MP3s.

Runs on GitHub Actions after each desk edition (.github/workflows/voice-stories.yml).

For every story the desk ranked onto today's front page (frontRank on the latest
frontRankOn day) that has no recording yet, it writes audio/<cc>/<slug>.mp3 and lists
it in data/audio.json, which the Listen button reads (story-kit.js). Recordings older
than --keep-days are removed, so the published site carries about a week of audio.

The text is the headline, the summary line and the paragraphs, the same words the
device voice reads. Before it is spoken:
  - currency amounts are written out ("N$41.6 billion" -> "41.6 billion Namibian
    dollars"), because a symbol such as N$ or KSh is read as letters;
  - names listed in data/pronounce.json get their phonemes, using Kokoro's
    [word](/phonemes/) syntax. Add a name there when the voice says it wrong.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE_RATE = 24000

# Prefix forms: symbol or code, then the amount. Longest and least ambiguous first.
NUM = r'(\d[\d,]*(?:\.\d+)?)'
SCALE = r'(?:\s?(trillion|billion|million|thousand|bn|mn|m|k)\b)?'
CURRENCIES = [
    (r'N\$', 'Namibian dollars'),
    (r'L\$', 'Liberian dollars'),
    (r'US\$', 'US dollars'),
    (r'(?:KSh|Kshs|Ksh|KES)\.?', 'Kenyan shillings'),
    (r'(?:USh|Ushs|UGX)\.?', 'Ugandan shillings'),
    (r'(?:TSh|Tsh|TZS)\.?', 'Tanzanian shillings'),
    (r'(?:Shs|Sh)\.?', 'shillings'),
    (r'(?:\u20a6|NGN)', 'naira'),
    (r'(?:GH\u20b5|GH\u00a2|GHS|GHc)', 'cedis'),
    (r'ZAR', 'rand'),
    (r'R', 'rand'),
    (r'(?:ETB|Br)', 'birr'),
    (r'(?:EGP|E\u00a3)', 'Egyptian pounds'),
    (r'(?:MAD|Dh)', 'dirhams'),
    (r'(?:FCFA|CFA|XOF|XAF)', 'CFA francs'),
    (r'(?:ZMW|ZK)', 'kwacha'),
    (r'(?:MWK|MK)', 'Malawian kwacha'),
    (r'(?:RWF|Frw)', 'Rwandan francs'),
    (r'(?:MZN|MT)', 'meticais'),
    (r'(?:AOA|Kz)', 'kwanzas'),
    (r'BWP', 'pula'),
    (r'(?:TND|DT)', 'Tunisian dinars'),
    (r'DZD', 'Algerian dinars'),
    (r'LYD', 'Libyan dinars'),
    (r'SDG', 'Sudanese pounds'),
    (r'SSP', 'South Sudanese pounds'),
    (r'(?:MGA|Ar)', 'ariary'),
    (r'MUR', 'Mauritian rupees'),
    (r'SCR', 'Seychellois rupees'),
    (r'CVE', 'escudos'),
    (r'SOS', 'Somali shillings'),
    (r'(?:BIF|FBu)', 'Burundian francs'),
    (r'CDF', 'Congolese francs'),
    (r'(?:GNF|FG)', 'Guinean francs'),
    (r'SLE', 'leones'),
    (r'ERN', 'nakfa'),
    (r'DJF', 'Djiboutian francs'),
    (r'KMF', 'Comorian francs'),
]
SCALE_WORDS = {'bn': 'billion', 'mn': 'million', 'm': 'million', 'k': 'thousand'}


def say_money(text):
    def spoken(name):
        def fix(m):
            amount = m.group(1)
            scale = m.group(2) or ''
            scale = SCALE_WORDS.get(scale.lower(), scale)
            return ' '.join(x for x in (amount, scale, name) if x)
        return fix

    for prefix, name in CURRENCIES:
        # Not glued to a preceding letter or digit (so "AR15" or "3R" are left alone).
        pattern = r'(?<![A-Za-z0-9])' + prefix + r'\s?' + NUM + SCALE
        text = re.sub(pattern, spoken(name), text)
    # Suffix forms: "5,000 FCFA", "20bn CFA".
    text = re.sub(NUM + SCALE + r'\s?(?:FCFA|CFA)\b(?!\s*francs)',
                  lambda m: ' '.join(x for x in (m.group(1), SCALE_WORDS.get((m.group(2) or '').lower(), m.group(2) or ''), 'CFA francs') if x), text)
    # "$2bn", "2.5bn" outside a currency the list knows.
    text = re.sub(r'(\d)\s?bn\b', r'\1 billion', text)
    text = re.sub(r'(\d)\s?mn\b', r'\1 million', text)
    return text


def load_pronunciations():
    path = os.path.join(ROOT, 'data', 'pronounce.json')
    try:
        with open(path, encoding='utf-8') as f:
            words = json.load(f).get('words') or {}
    except (OSError, ValueError):
        return []
    out = []
    for word, phonemes in words.items():
        word = str(word).strip()
        phonemes = str(phonemes).strip().strip('/')
        if word and phonemes:
            out.append((word, phonemes))
    # Longer names first, so "Aliko Dangote" wins over "Dangote" if both are listed.
    out.sort(key=lambda x: -len(x[0]))
    return out


def say_names(text, pronunciations):
    for word, phonemes in pronunciations:
        pattern = r'(?<![\w\[/])' + re.escape(word) + r'(?![\w\]])'
        text = re.sub(pattern, '[' + word + '](/' + phonemes + '/)', text)
    return text


def load_stories():
    with open(os.path.join(ROOT, 'data', 'briefs.js'), encoding='utf-8') as f:
        src = f.read()
    start = src.index('byCountry: {') + len('byCountry: ')
    end = src.find('}, markets: {', start)
    if end < 0:
        end = src.rindex('} };')
    return json.loads(src[start:end + 1])


def story_parts(story):
    parts = []
    headline = str(story.get('headline') or '').strip()
    if headline:
        parts.append(headline if re.search(r'[.!?]$', headline) else headline + '.')
    dek = str(story.get('dek') or '').strip()
    if dek:
        parts.append(dek)
    paragraphs = story.get('paragraphs')
    if not isinstance(paragraphs, list) or not paragraphs:
        paragraphs = re.split(r'\n\s*\n', str(story.get('body') or ''))
    for p in paragraphs:
        p = re.sub(r'https?://\S+', '', str(p or '')).strip()
        if p:
            parts.append(p)
    return parts


def front_page(by_country):
    rows = []
    for cc, stories in (by_country or {}).items():
        if not re.fullmatch(r'[a-z]{2}', str(cc)):
            continue
        for s in stories or []:
            try:
                rank = int(s.get('frontRank') or 0)
            except (TypeError, ValueError):
                rank = 0
            slug = str(s.get('slug') or '')
            if rank > 0 and s.get('frontRankOn') and re.fullmatch(r'[a-z0-9-]+', slug):
                rows.append((str(s['frontRankOn']), rank, cc, s))
    if not rows:
        return '', []
    latest = max(r[0] for r in rows)
    today = sorted((r for r in rows if r[0] == latest), key=lambda r: r[1])
    return latest, [(cc, s) for _, _, cc, s in today]


def synthesise(pipeline, voice, speed, parts):
    import numpy as np
    pieces = []
    gap = np.zeros(int(SAMPLE_RATE * 0.45), dtype=np.float32)
    for part in parts:
        for result in pipeline(part, voice=voice, speed=speed, split_pattern=r'\n+'):
            audio = getattr(result, 'audio', None)
            if audio is None and isinstance(result, tuple) and len(result) >= 3:
                audio = result[2]
            if audio is None:
                continue
            if hasattr(audio, 'detach'):
                audio = audio.detach().cpu().numpy()
            pieces.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        pieces.append(gap)
    if not pieces:
        return None
    return np.concatenate(pieces)


def encode_mp3(samples, out_path, title):
    import soundfile as sf
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'story.wav')
        sf.write(wav, samples, SAMPLE_RATE)
        # Mono speech at 32 kbps: about 4 KB a second, clear on a phone speaker.
        subprocess.run([
            'ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
            '-ac', '1', '-ar', str(SAMPLE_RATE), '-codec:a', 'libmp3lame', '-b:a', '32k',
            '-metadata', 'title=' + title, '-metadata', 'artist=The African Street Journal',
            out_path,
        ], check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--voice', default='af_heart')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--limit', type=int, default=0, help='voice at most this many new stories (0 = all)')
    ap.add_argument('--keep-days', type=int, default=8)
    args = ap.parse_args()

    manifest_path = os.path.join(ROOT, 'data', 'audio.json')
    try:
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        manifest = {}
    items = manifest.get('items') if isinstance(manifest.get('items'), dict) else {}

    day, picks = front_page(load_stories())
    todo = [(cc, s) for cc, s in picks if cc + '/' + s['slug'] not in items]
    if args.limit > 0:
        todo = todo[:args.limit]
    print('[voice] front page of %s: %d stories, %d to record' % (day or 'unknown', len(picks), len(todo)))

    made = 0
    if todo:
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
        names = load_pronunciations()
        for cc, story in todo:
            key = cc + '/' + story['slug']
            parts = [say_names(say_money(p), names) for p in story_parts(story)]
            try:
                samples = synthesise(pipeline, args.voice, args.speed, parts)
                if samples is None or len(samples) < SAMPLE_RATE:
                    print('[voice] no audio for %s, skipped' % key)
                    continue
                encode_mp3(samples, os.path.join(ROOT, 'audio', cc, story['slug'] + '.mp3'), str(story.get('headline') or ''))
            except Exception as e:  # one bad story must not stop the rest
                print('[voice] %s failed: %s' % (key, e))
                continue
            seconds = int(round(len(samples) / SAMPLE_RATE))
            items[key] = {'s': seconds, 'on': day}
            made += 1
            print('[voice] %s: %d s' % (key, seconds))

    # Sweep: recordings older than --keep-days, and files no longer listed.
    cutoff = (datetime.datetime.utcnow().date() - datetime.timedelta(days=args.keep_days)).isoformat()
    for key in list(items):
        if str(items[key].get('on') or '') < cutoff:
            path = os.path.join(ROOT, 'audio', key + '.mp3')
            if os.path.exists(path):
                os.remove(path)
            del items[key]
    audio_root = os.path.join(ROOT, 'audio')
    if os.path.isdir(audio_root):
        for cc in os.listdir(audio_root):
            folder = os.path.join(audio_root, cc)
            if not os.path.isdir(folder):
                continue
            for name in os.listdir(folder):
                if name.endswith('.mp3') and cc + '/' + name[:-4] not in items:
                    os.remove(os.path.join(folder, name))
            if not os.listdir(folder):
                os.rmdir(folder)

    manifest = {
        '_note': 'Written by scripts/voice-stories.py. items: "cc/slug" -> s (seconds), on (front-page day).',
        'voice': 'kokoro ' + args.voice,
        'base': '/audio/',
        'updated': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
        'items': dict(sorted(items.items())),
    }
    with open(manifest_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('[voice] recorded %d new, %d listed' % (made, len(items)))
    if todo and made == 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
