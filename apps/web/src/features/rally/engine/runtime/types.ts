/**
 * Inference runtime port.
 *
 * The analysis engine only talks to these interfaces; concrete adapters
 * (ONNX Runtime Web today) live next to this file. Swapping runtimes — or
 * running the same model through two runtimes to compare them — never touches
 * model pre/post-processing code.
 */

export type ComputeBackend = "webgpu" | "wasm";

export type TensorDType = "float32" | "float16" | "int64" | "int32" | "uint8";

export interface Tensor {
  readonly dtype: TensorDType;
  readonly dims: readonly number[];
  readonly data: Float32Array | Uint16Array | BigInt64Array | Int32Array | Uint8Array;
}

export interface InferenceSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  /** Backend actually used (an adapter may fall back, e.g. webgpu → wasm). */
  readonly backend: ComputeBackend;
  run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  release(): Promise<void>;
}

export interface SessionOptions {
  backend: ComputeBackend;
  /** Prefer fp16 kernels where the adapter supports it. */
  preferFp16?: boolean;
}

export interface InferenceRuntime {
  /** Stable id, e.g. "ort-jsep" or "ort-webgpu". Used in benchmark reports. */
  readonly id: string;
  readonly label: string;
  supports(backend: ComputeBackend): Promise<boolean>;
  createSession(model: ArrayBuffer, options: SessionOptions): Promise<InferenceSession>;
}

export function tensor(
  dtype: TensorDType,
  data: Tensor["data"],
  dims: readonly number[],
): Tensor {
  return { dtype, data, dims };
}
