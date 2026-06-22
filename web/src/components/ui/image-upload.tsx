import { useState, useCallback, useRef } from "react";
import Cropper, { type Area } from "react-easy-crop";

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

async function getCroppedFile(
  imageSrc: string,
  cropPixels: Area,
  filename: string,
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  const sx = image.naturalWidth / (image.width || image.naturalWidth);
  const sy = image.naturalHeight / (image.height || image.naturalHeight);

  canvas.width = Math.round(cropPixels.width);
  canvas.height = Math.round(cropPixels.height);

  ctx.drawImage(
    image,
    Math.round(cropPixels.x * sx),
    Math.round(cropPixels.y * sy),
    Math.round(cropPixels.width * sx),
    Math.round(cropPixels.height * sy),
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("toBlob failed"));
        resolve(new File([blob], filename, { type: "image/webp" }));
      },
      "image/webp",
      0.8,
    );
  });
}

interface ImageUploadProps {
  aspect: number;
  label: string;
  currentImage?: string | null;
  onCropped: (file: File | null) => void;
}

export function ImageUpload({ aspect, label, currentImage, onCropped }: ImageUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Only image files are allowed.");
      return;
    }

    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    e.target.value = "";
  };

  const handleCropConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setLoading(true);
    try {
      const file = await getCroppedFile(
        imageSrc,
        croppedAreaPixels,
        `${label.toLowerCase().replace(/\s+/g, "-")}.webp`,
      );
      onCropped(file);
      URL.revokeObjectURL(imageSrc);
      setImageSrc(null);
    } catch (err) {
      console.error("Crop failed", err);
      alert("Failed to crop image. Please try a different image.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
  };

  const handleRemove = () => {
    onCropped(null);
    setImageSrc(null);
  };

  const isSquare = aspect === 1;
  const previewClass = isSquare ? "w-20 h-20 sm:w-24 sm:h-24" : "w-full h-24 sm:h-28 md:h-32";

  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="field-body">
        <div className="field file">
          <div className="flex flex-col sm:flex-row items-start gap-3">
            <div
              className={`relative border-2 border-dashed border-border rounded flex items-center justify-center overflow-hidden bg-muted cursor-pointer hover:border-primary transition-colors shrink-0 ${previewClass}`}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
            >
              {currentImage ? (
                <img
                  src={currentImage}
                  alt={label}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-muted-foreground/70 text-2xl select-none">+</span>
              )}
            </div>

            <div className="flex flex-row sm:flex-col gap-2">
              <label className="upload control cursor-pointer">
                <span
                  className="button small blue"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  <span className="icon"><i className="mdi mdi-upload"></i></span>
                  Upload
                </span>
              </label>
              {currentImage && (
                <button type="button" className="button small red" onClick={handleRemove}>
                  <span className="icon"><i className="mdi mdi-delete"></i></span>
                  Remove
                </button>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      {imageSrc && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-foreground/60"
        >
          <div
            className="bg-card rounded-lg shadow-2xl flex flex-col w-full overflow-hidden"
            style={{ maxWidth: "600px", height: "min(80vh, 560px)" }}
          >
            <div className="px-4 py-3 border-b font-semibold flex-shrink-0 text-sm sm:text-base">
              Crop {label}
            </div>

            <div className="relative flex-1" style={{ minHeight: 0 }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="px-3 sm:px-4 py-2 sm:py-3 border-t flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="button small light" onClick={handleCancel} disabled={loading}>
                  Cancel
                </button>
                <button type="button" className="button small blue" onClick={handleCropConfirm} disabled={loading || !croppedAreaPixels}>
                  {loading ? "Saving..." : "Crop & Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
