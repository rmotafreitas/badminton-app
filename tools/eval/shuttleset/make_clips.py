"""Cuts labelled ShuttleSet rallies (github.com/wywyWang/CoachAI-Projects, MIT)
out of a downloaded match video and writes truth.json for score.ts.

  cd $DATA && python make_clips.py   (needs m1_long.mp4, m1_set1.csv, homography.csv, opencv, numpy)

VIDEO_START is where the downloaded section starts in the original video."""
import csv, json, subprocess, numpy as np, os
VIDEO_START = 450.0  # m1_long starts at 7:30
FPS = 25.0
TYPE = {"放小球":"net","擋小球":"net","勾球":"net","撲球":"net","殺球":"smash","點扣":"smash","挑球":"lift","防守回挑":"lift",
        "長球":"clear","平球":"drive","小平球":"drive","後場抽平球":"drive","防守回抽":"drive","推球":"drive",
        "切球":"drop","過渡切球":"drop","發短球":"serve","發長球":"serve"}
hom = {r["id"]: r for r in csv.DictReader(open("homography.csv"))}["1"]
corners = [{"x": float(hom["downleft_x"]), "y": float(hom["downleft_y"])}, {"x": float(hom["downright_x"]), "y": float(hom["downright_y"])},
           {"x": float(hom["upright_x"]), "y": float(hom["upright_y"])}, {"x": float(hom["upleft_x"]), "y": float(hom["upleft_y"])}]
# net y: homography from court model (BWF metres) to image
src = np.array([[-3.05,-6.7],[3.05,-6.7],[3.05,6.7],[-3.05,6.7]], np.float32)
dst = np.array([[c["x"], c["y"]] for c in corners], np.float32)
import cv2
H = cv2.getPerspectiveTransform(src, dst)
net = H @ np.array([0, 0, 1.0]); net_y = net[1] / net[2]
rows = list(csv.DictReader(open("m1_set1.csv")))
dur = float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0","m1_long.mp4"]))
rallies = {}
for r in rows: rallies.setdefault(int(r["rally"]), []).append(r)
os.makedirs("clips", exist_ok=True)
manifest = []
for rid, strokes in sorted(rallies.items()):
    ts = [float(s["frame_num"]) / FPS - VIDEO_START for s in strokes]
    a, b = ts[0] - 1.2, ts[-1] + 1.8
    if a < 0 or b > dur: continue
    out = f"clips/r{rid:02d}.mp4"
    subprocess.run(["ffmpeg","-v","error","-y","-ss",f"{a:.3f}","-i","m1_long.mp4","-t",f"{b-a:.3f}","-c:v","libx264","-preset","veryfast","-crf","18","-an",out], check=True)
    shots = []
    for s, t in zip(strokes, ts):
        side = -1 if float(s["player_location_y"] or 0) > net_y else 1
        shots.append({"t": round(t - a, 3), "side": side, "type": TYPE.get(s["type"], "other"), "raw": s["type"]})
    manifest.append({"clip": out, "rally": rid, "shots": shots})
json.dump({"corners": corners, "net_y": net_y, "rallies": manifest}, open("truth.json", "w"), ensure_ascii=False, indent=1)
print(len(manifest), "rallies,", sum(len(m["shots"]) for m in manifest), "shots; net_y", round(net_y))
