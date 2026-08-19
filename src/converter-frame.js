import { heicTo } from 'heic-to'

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return
  const { id, file, type, quality } = event.data || {}
  if (!id || !file) return
  try {
    const blob = await heicTo({ blob: file, type, quality })
    window.parent.postMessage({ id, ok: true, blob }, window.location.origin)
  } catch (error) {
    window.parent.postMessage({ id, ok: false, error: String(error?.message || error || 'Conversion failed') }, window.location.origin)
  }
})
