# River Vinyl

Reading a Grand Canyon cross-section like a record groove and turning it into sound.

- `index.html` is the latest 3D page (groove mode). Open it in a browser and press play.
- `index-tone-single-dot.html` is the tone version: one dot travels rim to rim, with pitch following elevation (110–880 Hz) and the sound panning from the South Rim (left) to the North Rim (right).
- `index-earlier.html` is the first version.
- The `.wav` files are pre-rendered audio for each version.

Data: a USGS elevation profile from Mather Point (36.0616, -112.1079) to Bright Angel Point (36.1935, -112.0487), plus AWS terrain tiles. The river's low point is 740 m and the North Rim end is 2,477 m.

## Song mode (`index-song.html`)
Three rim-to-rim sections, Hermits Rest–Point Sublime, Mather–Bright Angel and Desert View–Cape Royal, play as verses. A "Musical" slider goes from 0 (the raw terrain tone) to 1 (minor pentatonic notes on an 84 BPM beat with a drone). The key comes from the river elevation, and the note density and texture come from the real slope and wall roughness. `canyon_song.wav` is a render at Musical 0.6. Build scripts are in `src/`.

## River needle mode (`index-river.html`)
Follows the Colorado River for 48 km, from Hance Rapid to Serpentine Rapid, like a stereo needle in a groove. The left channel reads the river-left canyon wall and the right channel reads the river-right wall. Pitch comes from wall height, brightness from steepness and grain from roughness. Rapids play as thumps. Data comes from the USGS NHD river line, AWS terrain tiles and GNIS rapid names. `canyon_river.wav` is a render at Musical 0.6. Scripts are in `src/river/`.

### Layout
The page opens on **Strata Orchestra**. The main panel holds:
- **Style**: recorded-instrument presets (Orchestra, Canyon, EDM, Country, Pop).
- **Instrument pickers**: one per band (Band 4 rim, Band 3, Band 2, Band 1 river), plus Rapids (accents) and Beat. Editing a picker turns the preset into "Custom orchestra".
- **Volume**, with Play/Pause and the scrub bar along the bottom. Press **H** or click the Controls button to hide the panel.
- **Explorations** (collapsed): the original synth styles, Canyon/EDM/Country/Pop (original) and Strata (synth), along with Strata's Band 2 and Band 3 voice options. The "Back to the orchestra" button brings you back.
- **Advanced** (collapsed): Musical, Speed, Reverb, Vertical exaggeration, Point size, Glow, Grain, the Orbit/Contours/Labels/Loop switches, and the mapping notes.

### Instrument picker (all real recordings, VSCO 2 CE, CC0)
Every band only lists instruments that have recordings within about 3 semitones across that band's register. New instruments are loudness-matched to the band's default section.
| Band | Register | Choices |
|---|---|---|
| 1 river / Inner Gorge (0–300 m) | 41–82 Hz | **double bass + tuba**, double bass arco, upright bass pizzicato, tuba, trombone, bassoon, harp, upright piano |
| 2 Tonto / Muav (300–650 m) | 110–220 Hz | **cellos arco/pizz**, cello arco, cello pizzicato, double bass arco, bass pizzicato, French horn, trombone, bassoon, harp, piano |
| 3 Redwall / Supai (650–1000 m) | 262–523 Hz | **violas + horn**, viola section, viola pizzicato, trumpet, clarinet, oboe, flute, solo violin (fiddle), violin pizzicato, harp, piano |
| 4 rim (1000 m+) | 659–1319 Hz | **violins / flute**, violin section, solo violin, violin pizzicato, flute, oboe, clarinet, trumpet, harp, piano |
| Rapids | (24 accents) | **timpani + bass drum + cymbal swells**, timpani with rolls, concert bass drum, large hand drum, kick + snare |
| Beat | 84 BPM | **none**, four on the floor, train beat, backbeat |

The groove samples (kick, snare, shaker, tambourine) come from the "VSCO 1 Percussion" folder of VSCO 2 CE. VSCO 2 CE has no guitar, banjo or harmonica, so the Country preset uses harp, solo violin and oboe in their place. Bells were left out on purpose.

### Style presets (recorded instruments)
| Preset | Band 1 | Band 2 | Band 3 | Band 4 | Rapids | Beat |
|---|---|---|---|---|---|---|
| Orchestra (default) | double bass + tuba | cellos arco/pizz | violas + horn | violins / flute | timpani + bass drum + cymbal | none |
| Canyon | double bass arco | harp | clarinet | oboe | large hand drum + cymbal | none |
| EDM | upright bass pizz | cello pizz | violin pizz | violin section | kick + snare + cymbal | four on the floor |
| Country | upright bass pizz | harp | solo violin (fiddle) | oboe | kick + snare + cymbal | train beat |
| Pop | upright bass pizz | upright piano | viola section | upright piano | kick + snare + cymbal | backbeat |

- Every preset keeps the note plan and the 24 rapid accents. `src/river/verify_presets.json` measures the difference from the default at 0 s and 0 Hz.
- Each beat runs on the note plan's own 84 BPM grid. The original synth EDM, Country and Pop used 124, 100 and 110 BPM, and they are still available under Explorations.
- Renders: `canyon_river_orch_canyon.wav`, `canyon_river_orch_edm.wav`, `canyon_river_orch_country.wav` and `canyon_river_orch_pop.wav`. The original synth renders `canyon_river_edm.wav`, `canyon_river_country.wav` and `canyon_river_pop.wav` are unchanged.

### Fast start
- The orchestra renders in blocks: the first 3 s, then 4 s at a time between UI frames.
- Playback starts once the first block exists, and later blocks are scheduled back to back on the audio clock at exact sample boundaries. When the render finishes it becomes one looping buffer with a gapless hand-off.
- Finished renders are cached per instrument configuration (the last 5), so switching back to one is instant.
- The first block is pre-rendered while the page loads. In headless Chrome a click right at page load gave sound in about 1.3 s; after load it took about 0.3 s, down from roughly 25 s before.
- The dry mix is sample-identical to a one-shot render. The hall reverb uses block (overlap-add) convolution, which differs from the one-shot FFT by at most 6e-8, or 1 LSB in fewer than 100 of the 6.6 M 16-bit samples (`src/river/verify_chunks.json`).
- The Node one-shot render is bit-identical to the previous engine, so `canyon_river_orchestra.wav` and `canyon_orch_band1-4.wav` re-render byte-for-byte.
- Everything runs on the main thread (no workers), so it works over file:// and in Safari.

### Styles
The rule for every style is that it never moves a note or rapid accent the terrain placed. Styles only change the instruments, the groove and the scale colour.
- **Canyon (original)**: 84 BPM, minor pentatonic, synth voices.
- **EDM** (124 BPM, natural minor), **Country** (100 BPM, major pentatonic), **Pop** (110 BPM, major). These were checked to have 0 s and 0 cent differences from the terrain note plan, with the 24 accents identical.
- **Strata**: each wall's height above the river is split into four bands that stand in for rock layers (approximate, not real geology). 0–300 m is Inner Gorge schist (drone), 300–650 m is Tonto/Muav (pluck, or recorded cello pizzicato), 650–1000 m is Redwall/Supai (brass pad, bowed strings, soft mallet, recorded cello section or French horn), and 1000 m+ is Coconino/Kaibab rim (bell).

### Strata Orchestra (default)
Same four bands and same note plan as Strata, played by recorded orchestra sections:
| Band | Height above river | Section |
|---|---|---|
| 1 | 0–300 m | double bass + tuba |
| 2 | 300–650 m | cellos: pizzicato on steep wall, arco on gentle wall |
| 3 | 650–1000 m | violas + French horn |
| 4 | 1000 m+ | violins fading to flute |
- Rapids are timpani or bass drum hits, with a cymbal swell on the two biggest drops.
- Wall roughness brings in recorded string tremolo.
- The room is a real concert-hall impulse response, so the algorithmic Reverb slider doesn't apply to this style.
- Renders: `canyon_river_orchestra.wav` (full mix) and `canyon_orch_band1-4.wav` (band solos).

### Presets recreate the original synth styles (recorded samples)
Country, Pop, EDM and Canyon now rebuild the original `riverstyles.js` / `riversynth.js` arrangements with VSCO samples (`src/river/riverarr.js`). Melody onsets come from the terrain at the 84 BPM reference and are nudged to the style grid, exactly as before. Drums, bass and chords run at the style tempo (EDM 124, Country 100, Pop 110, Canyon 84). Every terrain note and accent sits at the same time as in the original (0 s difference, 24/24 accents). Layer gains were fitted to the original WAVs.

| Preset | Instruments | Onset match vs original (previous) | Octave-profile diff dB (previous) |
|---|---|---|---|
| Canyon | gliding strings, harp notes, cabasa bursts, tremolo texture, bass/strings drone | 0.84 (0.35) | 4.7 (6.5) |
| EDM | filtered pizz lead, kick, cabasa hat, off-beat bass pizz, sidechained pad, crash risers | 0.96 (0.84) | 3.0 (4.4) |
| Pop | piano lead and stabs, kick/snare backbeat, cabasa 8ths, bass pizz, strings pad | 0.89 (0.30) | 3.3 (6.5) |
| Country | harp + pizz lead, snare-tap/cabasa train beat, root-fifth bass, harp strums | 0.62 (0.39) | 7.7 (7.0) |

Known gap: Country is darker than the original synth (centroid 230 vs 550 Hz).

### River selector: Upper Mississippi (Driftless)
Use the **River** menu, or `?river=mississippi`. It covers 48 km from Trempealeau to La Crosse and the Root River mouth, built with the same pipeline (NHD flowline, 3DEP terrain, ±6 km cross-sections, GNIS bluffs and towns). Accents are Locks & Dams 6 and 7 (USACE positions; 2.03 m pool steps measured from the terrain) and the Trempealeau, Black and Root river mouths. Render: `mississippi_river_orchestra.wav`.

**Audibility:** pitch uses true heights (0–1,200 m maps to 110–880 Hz). The bluffs are only 0–150 m tall, so all 36 notes land in the lowest band and the result is mostly a drone. Suggested fix: an optional river-relative mode (e.g. 0–40, 40–90, 90–140, 140+ m bands) or a log pitch span. True heights stay the default.

## Credits
- Instrument samples: Versilian Studios, **VSCO 2 Community Edition** (https://github.com/sgossner/VSCO-2-CE), CC0 1.0.
- Concert-hall impulse response: Jack Lyons Concert Hall, University of York, from OpenAIR, the Open Acoustic Impulse Response Library (https://www.openair.hosted.york.ac.uk/), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: decoded to stereo, resampled, trimmed.
- See `src/river/SAMPLES_LICENSE.md` for the exact files used. The picker and preset instruments are built by `src/river/build_samples_orch2.py` into `samples_orch2.json`.
- Terrain and river data: USGS NHD, USGS GNIS, USGS 3DEP via AWS terrain tiles, USGS EPQS.
