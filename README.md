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
