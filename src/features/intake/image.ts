// Phone photos are 10+ MB; resize on the device before upload (findings: ~1568 px for Gemini,
// 512 px for the student-facing thumbnail).
export async function resizeToJpeg(source: Blob, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode photo'))), 'image/jpeg', quality),
  )
}

export const makeCapture = async (source: Blob) => ({
  photo: await resizeToJpeg(source, 1568, 0.88),
  thumb: await resizeToJpeg(source, 512, 0.8),
})
