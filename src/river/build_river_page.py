import pathlib, json
H = pathlib.Path(__file__).resolve().parent
t = (H / 'template.html').read_text()
t = t.replace('/*DATA*/', '\nconst RIVER=' + json.dumps(json.load(open(H / 'river.json')), separators=(',', ':')) + ';\n', 1)
t = t.replace('/*SYNTH*/', '\n' + (H / 'riversynth.js').read_text() + '\n' + (H / 'riverstyles.js').read_text(), 1).replace('/*MAIN*/', '\n' + (H / 'river_main.js').read_text(), 1)
(H.parent.parent / 'index-river.html').write_text(t); print('ok', len(t))
