import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { downscaleImage } from "@/shared/lib/downscale-image";
import { cn } from "@/shared/lib/utils";

/** `undefined` = unchanged, a File = new, `null` = remove. */
export type ImageChoice = File | null | undefined;

interface ImageSlot {
  label: string;
  current: string | null;
  value: ImageChoice;
  onChange: (value: ImageChoice) => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";

/**
 * What to show for one image slot, and a hidden file input to pick a new one. Big photos are shrunk in the browser
 * first (serverless request limits); the server then re-encodes and resizes every upload.
 */
function useImageSlot({ label, current, value, onChange }: ImageSlot) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = value === null ? null : (preview ?? current);
  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      aria-label={label}
      className="sr-only"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onChange(await downscaleImage(file));
      }}
    />
  );
  return { shown, pick: () => input.current?.click(), picker };
}

function RemoveButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "tap-target flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border backdrop-blur",
        className,
      )}
    >
      <X className="size-4" />
    </button>
  );
}

/**
 * The cover with the photo (or logo) on top of it, laid out like the profile header it edits: tap either to change it,
 * the × removes it. Reads well on a 360 px phone and in a desktop dialog alike.
 */
export function CoverAndPhotoField({
  cover,
  photo,
  removeLabel,
  photoShape = "circle",
  fallback,
}: {
  cover: ImageSlot;
  photo: ImageSlot;
  removeLabel: string;
  photoShape?: "circle" | "rounded";
  /** Shown in the photo spot when there is none (initials). */
  fallback?: string;
}) {
  const c = useImageSlot(cover);
  const p = useImageSlot(photo);
  const round = photoShape === "circle" ? "rounded-full" : "rounded-2xl";
  return (
    <div className="pb-12">
      <div className="relative">
        <div className="relative aspect-[3/1] w-full overflow-hidden rounded-xl bg-gradient-to-br from-primary/80 to-primary">
          {c.shown ? (
            <img src={c.shown} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center gap-2 text-sm font-medium text-primary-foreground/90">
              <ImagePlus className="size-5" /> {cover.label}
            </div>
          )}
          <button type="button" className="absolute inset-0" onClick={c.pick} aria-label={cover.label} />
          {c.shown && <RemoveButton label={`${removeLabel}: ${cover.label}`} onClick={() => cover.onChange(null)} className="absolute top-2 right-2" />}
        </div>
        <div className="absolute -bottom-10 left-4">
          <div className={cn("relative size-20 overflow-hidden bg-muted ring-4 ring-background", round)}>
            {p.shown ? (
              <img src={p.shown} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
                {fallback || <ImagePlus className="size-6" />}
              </span>
            )}
            <button type="button" className="absolute inset-0" onClick={p.pick} aria-label={photo.label} />
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
          >
            <Camera className="size-3.5" />
          </span>
          {p.shown && <RemoveButton label={`${removeLabel}: ${photo.label}`} onClick={() => photo.onChange(null)} className="absolute -top-2 -right-9 size-7" />}
        </div>
      </div>
      {c.picker}
      {p.picker}
    </div>
  );
}
