// Phone cameras take 3-8 MB photos; the AI reads a note or worksheet just as well at ~2000px.
// Shrinking on the phone keeps uploads small (and quick on mobile data). If the browser can't
// decode the photo (e.g. some HEIC files) or has no canvas, the original is sent unchanged.

const MAX_SIDE = 2000;
const QUALITY = 0.85;
/** Already small enough: send as is. */
const SMALL_ENOUGH = 1_000_000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read the photo"));
    };
    img.src = url;
  });
}

export async function shrinkPhoto(file: File): Promise<Blob> {
  if (file.size <= SMALL_ENOUGH) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
