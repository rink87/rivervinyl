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
The page opens on **Strata Orchestra** with only the essentials up front: Play/Pause, the scrub bar, and Volume (press **H** or the Controls button to hide the panel).
- **Explorations** (collapsed): the other styles (Canyon original, EDM, Country, Pop, Strata) and Strata's Band 2 and Band 3 voice options. A "Back to Strata Orchestra" button returns to the default.
- **Advanced** (collapsed): Musical, Speed, Reverb, Vertical exaggeration, Point size, Glow, Grain, and the Orbit, Contours, Labels and Loop switches, plus notes on how the mapping works.

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

## Credits
- Instrument samples: Versilian Studios, **VSCO 2 Community Edition** (https://github.com/sgossner/VSCO-2-CE), CC0 1.0.
- Concert-hall impulse response: Jack Lyons Concert Hall, University of York, from OpenAIR, the Open Acoustic Impulse Response Library (https://www.openair.hosted.york.ac.uk/), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: decoded to stereo, resampled, trimmed.
- See `src/river/SAMPLES_LICENSE.md` for the exact files used.
- Terrain and river data: USGS NHD, USGS GNIS, USGS 3DEP via AWS terrain tiles, USGS EPQS.
