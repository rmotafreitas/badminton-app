#!/usr/bin/env bash
# Builds every Rally Analysis model into web/public/models (gitignored).
# Requires: curl, unzip, git, python3.12 + uv (or a venv with the packages below).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/web/public/models"
WORK="${RALLY_MODELS_WORKDIR:-$HOME/.cache/rally-models}"
mkdir -p "$OUT" "$WORK"
cd "$WORK"

# ── MMPose / MMDet ONNX exports (Apache-2.0) ────────────────────────────────
MM=https://download.openmmlab.com/mmpose/v1/projects
fetch_zip() { # url → dest name
  local url=$1 dest=$2 zip
  zip="$(basename "$url")"
  [ -f "$zip" ] || curl -fSLO "$url"
  rm -rf "${zip%.zip}" && unzip -q -o "$zip" -d "${zip%.zip}"
  cp "$(find "${zip%.zip}" -name end2end.onnx | head -1)" "$OUT/$dest"
}
fetch_zip "$MM/rtmposev1/onnx_sdk/yolox_tiny_8xb8-300e_humanart-6f3252f9.zip" yolox_tiny_humanart.onnx
fetch_zip "$MM/rtmposev1/onnx_sdk/rtmpose-s_simcc-body7_pt-body7_420e-256x192-acd4a1ef_20230504.zip" rtmpose_s_body7.onnx
fetch_zip "$MM/rtmo/onnx_sdk/rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.zip" rtmo_s_body7.onnx

# ── TrackNetV3 (MIT) — PyTorch checkpoints → ONNX ───────────────────────────
[ -d TrackNetV3 ] || git clone -q --depth 1 https://github.com/qaz812345/TrackNetV3.git
if [ ! -f ckpts/TrackNet_best.pt ]; then
  uv venv -q --python 3.12 .venv-dl && uv pip install -q --python .venv-dl/bin/python gdown
  .venv-dl/bin/gdown -q 1CfzE87a0f6LhBp0kniSl1-89zaLCZ8cA -O TrackNetV3_ckpts.zip
  unzip -q -o TrackNetV3_ckpts.zip
fi
if [ ! -x .venv/bin/python ]; then
  uv venv -q --python 3.12 .venv
  uv pip install -q --python .venv/bin/python --index-url https://download.pytorch.org/whl/cpu torch
  uv pip install -q --python .venv/bin/python onnx onnxruntime
fi
.venv/bin/python "$ROOT/tools/models/export_tracknet.py" TrackNetV3 ckpts "$OUT"

ls -la "$OUT"
