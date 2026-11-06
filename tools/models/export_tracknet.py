"""Export TrackNetV3 + InpaintNet (MIT, github.com/qaz812345/TrackNetV3) to ONNX.

Usage (from tools/models, inside a venv with torch-cpu, onnx, onnxruntime):
    python export_tracknet.py <TrackNetV3 repo dir> <ckpts dir> <out dir>

Produces tracknetv3.onnx (fp32), tracknetv3_fp16.onnx (fp16 weights, fp32 I/O)
and inpaintnet.onnx. See README.md for the full pipeline.
"""
import os
import sys

import onnx
import torch
from onnxruntime.transformers import float16

repo, ckpts, out = sys.argv[1:4]
sys.path.insert(0, repo)
from model import InpaintNet, TrackNet  # noqa: E402

os.makedirs(out, exist_ok=True)


def load(model, name):
    state = torch.load(os.path.join(ckpts, name), map_location="cpu", weights_only=False)
    model.load_state_dict(state["model"])
    return model.eval()


# seq_len=8, bg_mode=concat → 3 (median background) + 8×3 (frames) = 27 channels.
tracknet = load(TrackNet(27, 8), "TrackNet_best.pt")
torch.onnx.export(
    tracknet,
    torch.rand(1, 27, 288, 512),
    os.path.join(out, "tracknetv3.onnx"),
    input_names=["frames"],
    output_names=["heatmaps"],
    opset_version=17,
    dynamo=False,
)

inpaint = load(InpaintNet(), "InpaintNet_best.pt")
torch.onnx.export(
    inpaint,
    (torch.rand(1, 16, 2), torch.rand(1, 16, 1)),
    os.path.join(out, "inpaintnet.onnx"),
    input_names=["coords", "mask"],
    output_names=["coords_out"],
    opset_version=17,
    dynamo=False,
)

fp32 = onnx.load(os.path.join(out, "tracknetv3.onnx"))
onnx.save(
    float16.convert_float_to_float16(fp32, keep_io_types=True),
    os.path.join(out, "tracknetv3_fp16.onnx"),
)
print("exported to", out)
