/**
 * ONNX Runtime Web adapter for the InferenceRuntime port.
 *
 * Two flavours ship in onnxruntime-web and perform differently per device,
 * so both are exposed and the benchmark picks the winner:
 *   - "ort-jsep":   default bundle, JS-implemented WebGPU EP (mature) + WASM
 *   - "ort-webgpu": native WebGPU EP compiled to wasm (newer)
 * Each flavour lazy-loads its own ~28MB wasm, only when first used.
 */
import type {
  ComputeBackend,
  InferenceRuntime,
  InferenceSession,
  SessionOptions,
  Tensor,
} from "./types";

type Ort = typeof import("onnxruntime-web");

type Flavour = "jsep" | "webgpu";

const loaders: Record<Flavour, () => Promise<Ort>> = {
  jsep: async () => {
    const [ort, wasm] = await Promise.all([
      import("onnxruntime-web"),
      import("onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url"),
    ]);
    ort.env.wasm.wasmPaths = { wasm: wasm.default };
    return ort;
  },
  webgpu: async () => {
    const [ort, wasm] = await Promise.all([
      import("onnxruntime-web/webgpu"),
      import("onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url"),
    ]);
    ort.env.wasm.wasmPaths = { wasm: wasm.default };
    return ort as unknown as Ort;
  },
};

const cache = new Map<Flavour, Promise<Ort>>();

/** 64 KiB wasm pages: ORT asks for a 4 GB ceiling; never go below 256 MB. */
const MIN_MAX_PAGES = 4096;

/**
 * ORT's wasm creates `new WebAssembly.Memory({ maximum: 65536 pages, shared: true })`: a 4 GB reservation that
 * iOS Safari often refuses ("RangeError: Out of memory" → "no available backend found"). Wrap the constructor so a
 * refused ceiling is halved until it fits; the models need a few hundred MB. A smaller maximum is still a valid
 * import for the module.
 */
export function withMemoryFallback(Native: typeof WebAssembly.Memory): typeof WebAssembly.Memory {
  function Memory(desc: WebAssembly.MemoryDescriptor) {
    let maximum = desc.maximum;
    for (;;) {
      try {
        return new Native({ ...desc, maximum });
      } catch (e) {
        if (!(e instanceof RangeError) || maximum === undefined || maximum <= Math.max(MIN_MAX_PAGES, desc.initial)) throw e;
        maximum = Math.max(MIN_MAX_PAGES, desc.initial, maximum >> 1);
      }
    }
  }
  Memory.prototype = Native.prototype;
  return Memory as unknown as typeof WebAssembly.Memory;
}

let memoryPatched = false;
function patchWasmMemory() {
  if (memoryPatched || typeof WebAssembly === "undefined") return;
  memoryPatched = true;
  WebAssembly.Memory = withMemoryFallback(WebAssembly.Memory);
}

function loadOrt(flavour: Flavour): Promise<Ort> {
  let p = cache.get(flavour);
  if (!p) {
    patchWasmMemory();
    p = loaders[flavour]().then((ort) => {
      // Threads need cross-origin isolation (SharedArrayBuffer). Without it
      // ORT silently runs single-threaded, so be explicit.
      const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
      const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
      ort.env.wasm.numThreads = isolated ? Math.min(4, Math.max(1, cores - 1)) : 1;
      ort.env.logLevel = "error";
      return ort;
    });
    cache.set(flavour, p);
  }
  return p;
}

export async function hasWebGpu(): Promise<boolean> {
  const gpu = (globalThis.navigator as Navigator | undefined)?.gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

class OrtSession implements InferenceSession {
  private readonly ort: Ort;
  private readonly session: import("onnxruntime-web").InferenceSession;
  readonly backend: ComputeBackend;

  constructor(ort: Ort, session: import("onnxruntime-web").InferenceSession, backend: ComputeBackend) {
    this.ort = ort;
    this.session = session;
    this.backend = backend;
  }

  get inputNames() {
    return this.session.inputNames;
  }

  get outputNames() {
    return this.session.outputNames;
  }

  async run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>> {
    const ortFeeds: Record<string, import("onnxruntime-web").Tensor> = {};
    for (const [name, t] of Object.entries(feeds)) {
      ortFeeds[name] = new this.ort.Tensor(t.dtype, t.data as never, t.dims as number[]);
    }
    const out = await this.session.run(ortFeeds);
    const result: Record<string, Tensor> = {};
    for (const [name, t] of Object.entries(out)) {
      // getData() downloads GPU-resident outputs; a no-op for CPU tensors.
      const data = (await t.getData()) as Tensor["data"];
      result[name] = { dtype: t.type as Tensor["dtype"], dims: t.dims, data };
      t.dispose();
    }
    return result;
  }

  async release() {
    await this.session.release();
  }
}

class OrtRuntime implements InferenceRuntime {
  readonly id: string;
  readonly label: string;
  private readonly flavour: Flavour;

  constructor(id: string, label: string, flavour: Flavour) {
    this.id = id;
    this.label = label;
    this.flavour = flavour;
  }

  async supports(backend: ComputeBackend): Promise<boolean> {
    if (backend === "wasm") return typeof WebAssembly !== "undefined";
    return hasWebGpu();
  }

  async createSession(model: ArrayBuffer, options: SessionOptions): Promise<InferenceSession> {
    const ort = await loadOrt(this.flavour);
    const session = await ort.InferenceSession.create(new Uint8Array(model), {
      // The GPU can still fail to start (lost adapter, no memory): fall back to the CPU rather than fail.
      executionProviders: options.backend === "wasm" ? ["wasm"] : [options.backend, "wasm"],
      graphOptimizationLevel: "all",
    });
    return new OrtSession(ort, session, options.backend);
  }
}

export const ortJsepRuntime: InferenceRuntime = new OrtRuntime(
  "ort-jsep",
  "ONNX Runtime (JSEP WebGPU)",
  "jsep",
);

export const ortWebGpuRuntime: InferenceRuntime = new OrtRuntime(
  "ort-webgpu",
  "ONNX Runtime (native WebGPU)",
  "webgpu",
);

export const runtimes: readonly InferenceRuntime[] = [ortJsepRuntime, ortWebGpuRuntime];
