import { describe, expect, it } from "vitest";
import { withMemoryFallback } from "./ort-runtime";

/** A WebAssembly.Memory that refuses ceilings above `limit` pages, like iOS Safari. */
function nativeWithLimit(limit: number, asked: number[]) {
  function Fake(this: unknown, desc: WebAssembly.MemoryDescriptor) {
    asked.push(desc.maximum ?? -1);
    if ((desc.maximum ?? 0) > limit) throw new RangeError("Out of memory");
    return { desc };
  }
  return Fake as unknown as typeof WebAssembly.Memory;
}

describe("withMemoryFallback", () => {
  it("halves a refused 4 GB ceiling until the browser accepts it", () => {
    const asked: number[] = [];
    const Memory = withMemoryFallback(nativeWithLimit(16384, asked));
    const mem = new Memory({ initial: 256, maximum: 65536, shared: true }) as unknown as { desc: WebAssembly.MemoryDescriptor };
    expect(asked).toEqual([65536, 32768, 16384]);
    expect(mem.desc).toEqual({ initial: 256, maximum: 16384, shared: true });
  });

  it("keeps the requested ceiling when it fits", () => {
    const asked: number[] = [];
    new (withMemoryFallback(nativeWithLimit(65536, asked)))({ initial: 256, maximum: 65536, shared: true });
    expect(asked).toEqual([65536]);
  });

  it("gives up at 256 MB and rethrows", () => {
    const asked: number[] = [];
    const Memory = withMemoryFallback(nativeWithLimit(1000, asked));
    expect(() => new Memory({ initial: 256, maximum: 65536, shared: true })).toThrow(RangeError);
    expect(asked.at(-1)).toBe(4096);
  });

  it("still works with real memories", () => {
    const Memory = withMemoryFallback(WebAssembly.Memory);
    const mem = new Memory({ initial: 1, maximum: 10 });
    expect(mem).toBeInstanceOf(WebAssembly.Memory);
    expect(mem.buffer.byteLength).toBe(65536);
  });
});
