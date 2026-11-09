import { ImagePlus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { downscaleImage } from "@/shared/lib/downscale-image";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/**
 * Pick an image, see it, or remove it. `value`: undefined = unchanged, File = new, null = remove. Big photos are shrunk
 * in the browser first (serverless request limits); the server then re-encodes and resizes every upload.
 */
export function ImageField({
  label,
  current,
  value,
  onChange,
  aspect = "square",
  removeLabel,
}: {
  label: string;
  current: string | null;
  value: File | null | undefined;
  onChange: (value: File | null | undefined) => void;
  aspect?: "square" | "banner";
  removeLabel: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = value === null ? null : (preview ?? current);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={cn(
          "group relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/40",
          aspect === "square" ? "size-28" : "aspect-[3/1] w-full",
        )}
      >
        {shown ? <img src={shown} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
        <button type="button" className="absolute inset-0" onClick={() => input.current?.click()} aria-label={label} />
        {shown && (
          <Button type="button" size="icon" variant="secondary" className="absolute top-1.5 right-1.5 size-7 rounded-full shadow" onClick={() => onChange(null)} aria-label={removeLabel}>
            <X />
          </Button>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onChange(await downscaleImage(file));
        }}
      />
    </div>
  );
}
