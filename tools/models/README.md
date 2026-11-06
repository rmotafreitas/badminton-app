# Rally Analysis models

All models run **in the browser** (ONNX Runtime Web, WebGPU → WASM fallback).
Weights are not committed; `fetch_models.sh` rebuilds them into
`web/public/models/` (gitignored). In production they're served from
`VITE_MODEL_BASE_URL` (CDN / R2).

| File | Task | Source | License |
| --- | --- | --- | --- |
| `yolox_tiny_humanart.onnx` | person detection (416²) | OpenMMLab rtmposev1 onnx_sdk | Apache-2.0 |
| `rtmpose_s_body7.onnx` | top-down pose (256×192) | OpenMMLab RTMPose-s body7 | Apache-2.0 |
| `rtmo_s_body7.onnx` | bottom-up multi-person pose (640²) | OpenMMLab RTMO-s body7 | Apache-2.0 |
| `tracknetv3.onnx` / `_fp16` | shuttle heatmaps, 8 frames + bg median (512×288) | qaz812345/TrackNetV3 | MIT |
| `inpaintnet.onnx` | trajectory gap filling (16 steps) | qaz812345/TrackNetV3 | MIT |

```bash
tools/models/fetch_models.sh   # needs curl, unzip, git, uv
```

The benchmark page at `/lab` measures these on a real device.
