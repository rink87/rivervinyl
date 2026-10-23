# Recorded samples used by the Strata style (band 3 'cello'/'horn', band 2 'pizz')
Source: Versilian Studios, VSCO 2 Community Edition — https://github.com/sgossner/VSCO-2-CE
License: CC0 1.0 Universal (public-domain dedication; no attribution required, credited anyway).
Files used (trimmed from onset, crossfade-looped sustains, mono 32 kHz MP3 80 kbps, embedded as base64):
- Strings/Cello Section/susvib/susvib_{C3,E3,G3,B3}_v1_1.wav (measured 261.5 / 328.9 / 392.2 / 493.6 Hz)
- Brass/F Horn/sus/MOHorn_sus_C3_v2_1.wav (261.6 Hz), MOHorn_sus_D4_v1_1.wav (589.2 Hz)
- Strings/Cello Section/pizzT/pizzT_{B1,D2,F2,A2}_v2_RR1.wav (123.9 / 146.5 / 174.7 / 219.6 Hz)
Note: VSCO note names are one octave below scientific pitch (its 'C3' = middle C).

# Strata Orchestra style (samples_orch.json, built by build_samples_orch.py)
## Instruments — Versilian Studios VSCO 2 Community Edition, CC0 1.0 (https://github.com/sgossner/VSCO-2-CE)
Mono 32 kHz MP3 64 kbps, trimmed from onset, sustains crossfade-looped 1.0–3.0 s. Pitches measured (name-derived where tremolo defeats detection).
- Band 1 double bass: Strings/Solo Contrabass/SusVib/BKCtbss_SusVib_{F#0,A#0,D1,F#1}_v3_rr1.wav (46.3/58.3/73.4/92.5 Hz)
  tremolo: Strings/Solo Contrabass/Trem/BKCtbss_Trem_{E0,G0,C1,E1}_v2_rr1.wav (41.2/49.0/65.4/82.4 Hz nominal)
  tuba doubling: Brass/Tuba/sus/Tuba3_sus_F0_v1_rr1_Mid.wav, Tuba3_sus_A#0_v2_rr1_Mid.wav, Tuba3_sus_D#1_v2_rr1_Mid.wav (42.9/58.3/77.8 Hz)
  (VSCO 2 CE has no contrabass SECTION and no contrabassoon; solo contrabass + tuba are used)
- Band 2 cello section: Strings/Cello Section/susvib/susvib_{G1,B1,D2,F2,A2}_v1_1.wav; trem/trem_{G1,B1,D2,F2,A2}_v1_1.wav;
  pizzT/pizzT_{G1,B1,D2,F2,A2}_v2_RR{1,2}.wav (round-robin) — 98–220 Hz
- Band 3 viola section: Strings/Viola Section/susvib/ViolaEns_susvib_{B2,D3,F3,A3,C4}_v1_1.wav; trem/Violas_trem_{B2,D3,F3,A3,C4}_v1_rr1.wav (247–523 Hz)
  French horn: Brass/F Horn/sus/MOHorn_sus_A2_v1_1.wav, MOHorn_sus_C3_v2_1.wav, MOHorn_sus_D4_v1_1.wav (219/262/589 Hz)
- Band 4 violin section: Strings/Violin Section/susVib/VlnEns_susVib_{E4,G4,B4,D5}_v1.wav; Trem/VlnEns_Trem_{E4,G4,B4,D5}_v1.wav (659–1178 Hz)
  flute: Woodwinds/Flute/susNV/LDFlute_susNV_{E4,A4,C5,E5}_v1_1.wav (659/880/1047/1319 Hz)
- Accents: Percussion/Timpani/Timpani1_Hit_v3_rr{1,2}_Sum.wav; Percussion/BDrumNewhit_v5_rr{1,2}_Sum.wav; Percussion/susCymb1-cresc-Short_v1.wav (swell)
## Room — OpenAIR, Audio Lab, University of York, CC BY 4.0 (attribution required)
- Jack Lyons Concert Hall, University of York: rir_jack_lyons_lp2_96k.wav (source centre of orchestra, receiver seat D22, 10 m)
  https://webfiles.york.ac.uk/OPENAIR/IRs/jack-lyons-concert-hall-university-york/ · https://www.openair.hosted.york.ac.uk/
  Modified: B-format decoded to stereo (L = W + Y, R = W − Y), resampled to 32 kHz, trimmed to 2.4 s with a 0.6 s fade, MP3 96 kbps.
  Credit line: "Concert-hall impulse response: Jack Lyons Concert Hall, University of York, from OpenAIR, the Open Acoustic Impulse
  Response Library (https://www.openair.hosted.york.ac.uk/), licensed CC BY 4.0."
