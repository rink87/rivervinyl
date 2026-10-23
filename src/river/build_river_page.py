import pathlib, json
H = pathlib.Path(__file__).resolve().parent
t = (H / 'template.html').read_text()
t = t.replace('/*DATA*/', '\nconst RIVER_MS=' + json.dumps(json.load(open(H.parent / 'mississippi' / 'river_ms.json')), separators=(',', ':')) + ';\nconst SAMPLES_ORCH2=' + json.dumps(json.load(open(H / 'samples_orch2.json')), separators=(',', ':')) + ';\nconst SAMPLES_ORCH=' + json.dumps(json.load(open(H / 'samples_orch.json')), separators=(',', ':')) + ';\nconst SAMPLES_MP3=' + json.dumps(json.load(open(H / 'samples.json')), separators=(',', ':')) + ';\nconst RIVER=' + json.dumps(json.load(open(H / 'river.json')), separators=(',', ':')) + ';\n', 1)
t = t.replace('/*SYNTH*/', '\n' + (H / 'riversynth.js').read_text() + '\n' + (H / 'riverstyles.js').read_text() + '\n' + (H / 'riverstrata.js').read_text() + '\n' + (H / 'riverorch.js').read_text() + '\n' + (H / 'riverarr.js').read_text(), 1).replace('/*MAIN*/', '\n' + (H / 'river_main.js').read_text(), 1)
(H.parent.parent / 'index-river.html').write_text(t); print('ok', len(t))
