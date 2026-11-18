// Browser side of the treadmill reader: a photo file → pixels → reading, plus a small crop of the display
// to send as evidence. Everything happens on the phone; only the crop (the lit numbers and a margin, never the
// rest of the room) is ever sent, and only when the pupil presses Send.
import { readTreadmill, type TreadmillReading } from '../../engine/treadmill/read';

/** Longest side the reader works on: plenty for the digits, quick on an older phone. */
const READ_MAX = 1400;
/** Evidence crop: wide enough for the coach to check the digits, small enough for one database record. */
const CROP_MAX = 520;
const CROP_BYTES = 140_000;

export interface PhotoResult {
  reading: TreadmillReading;
  /** JPEG of the display only, when one was found. */
  crop?: Uint8Array;
  /** Object URL to show: the crop, or the whole photo scaled down when no display was found. */
  previewUrl: string;
}

async function bitmapOf(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Phones store photos sideways with an orientation flag: apply it.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const toBlob = (c: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality));

export async function readPhoto(file: Blob): Promise<PhotoResult> {
  const bmp = await bitmapOf(file);
  const bw = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const bh = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const scale = Math.min(1, READ_MAX / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  const work = canvas(w, h);
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  if ('close' in bmp) bmp.close();
  const px = ctx.getImageData(0, 0, w, h);
  const reading = readTreadmill({ width: w, height: h, data: px.data, channels: 4 });

  const box = reading.displayBox ?? { x: 0, y: 0, w, h };
  const s = Math.min(1, CROP_MAX / box.w);
  const out = canvas(Math.round(box.w * s), Math.round(box.h * s));
  out.getContext('2d')!.drawImage(work, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  let blob: Blob | null = null;
  for (const q of [0.75, 0.6, 0.45]) {
    blob = await toBlob(out, q);
    if (blob && blob.size <= CROP_BYTES) break;
  }
  const previewUrl = blob ? URL.createObjectURL(blob) : '';
  const crop = reading.displayBox && blob && blob.size <= CROP_BYTES ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  return { reading, crop, previewUrl };
}
