/**
 * Warns when this device can't run the models on the GPU (no WebGPU): the
 * WASM fallback works but is roughly 10× slower, so suggest another device.
 * Kept free of onnxruntime imports so pages don't pull the runtime in.
 */
import { useEffect, useState } from "react";
import { useDictionary } from "@/i18n";

let probe: Promise<boolean> | null = null;
function webGpuAvailable(): Promise<boolean> {
  probe ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      return (await gpu.requestAdapter()) !== null;
    } catch {
      return false;
    }
  })();
  return probe;
}

export function GpuNotice({ className = "" }: { className?: string }) {
  const t = useDictionary().rally;
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void webGpuAvailable().then((ok) => alive && setGpu(ok));
    return () => {
      alive = false;
    };
  }, []);
  if (gpu !== false) return null;
  return (
    <p className={`text-xs text-amber-700 dark:text-amber-400 flex gap-1.5 ${className}`}>
      <i aria-hidden className="mdi mdi-speedometer-slow" />
      <span>{t.noGpu}</span>
    </p>
  );
}
