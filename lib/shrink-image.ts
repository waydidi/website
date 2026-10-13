// Browser-only: phone photos are often 3–8 MB each, and several in one form can be more than the
// Worker handles in one request. Re-encode them as a JPEG of at most `maxSide` pixels before upload.
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  if (!file.size || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // the server still checks size and type
  }
}

/** Replaces every image file in the form with its shrunk copy. */
export async function shrinkFormImages(form: FormData) {
  for (const [key, value] of [...form.entries()]) {
    if (value instanceof File && value.size) form.set(key, await shrinkImage(value));
  }
}
