/**
 * Warns when this device can't run the models on the GPU (no WebGPU): the
 * WASM fallback works but is roughly 10× slower, so suggest another device.
 * Kept free of onnxruntime imports so pages don't pull the runtime in.
 */
import { Gauge } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { useDictionary } from "@/shared/i18n";

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
    <p className={cn("flex gap-1.5 text-xs text-amber-700 dark:text-amber-400", className)}>
      <Gauge className="size-3.5 shrink-0" aria-hidden />
      <span>{t.noGpu}</span>
    </p>
  );
}
