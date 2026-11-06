# ShuttleSet benchmark

Real, human-labelled hits from professional singles broadcasts
([ShuttleSet](https://github.com/wywyWang/CoachAI-Projects/tree/main/ShuttleSet),
MIT): hit frame, hitter, 18 shot types (mapped to the app's 8), court corners.
Different from phone footage (elevated broadcast camera, pros), but it is real
ground truth for hit detection, hitter side and shot typing.

1. Download a match section (URL in ShuttleSet `match.csv`), its `setN.csv`
   and `homography.csv` into a data dir; adjust `VIDEO_START` in `make_clips.py`.
2. `python make_clips.py` → `clips/rNN.mp4` + `truth.json`
3. `cd web && DATA=… CHROME=… bun ../tools/eval/shuttleset/run.mjs` (dev server running)
4. `cd web && DATA=… bun ../tools/eval/shuttleset/score.ts --replay`

`--replay` re-runs tracking + events on the saved raw detections, so engine
changes to tracking/events are scored in seconds.

Reference (Fuzhou Open 2019 final, set 1, 12 rallies, 178 hits; Nov 2026):
precision 78 %, recall 60 %, hitter side 89 %, shot type 50 %
(lift 16/19, clear 12/17, net 15/34; ShuttleSet "push" ≈ our lift).
