import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { heicTo } from 'heic-to'
import JSZip from 'jszip'
import { AlertCircle, Archive, ArrowRight, Bolt, Check, ChevronDown, Download, Eraser, FileImage, FolderDown, FolderOpen, KeyRound, Layers3, LockKeyhole, LogOut, Mail, Maximize2, Minimize2, RefreshCw, ShieldCheck, Sparkles, Trash2, UploadCloud, User, WandSparkles, X, Zap } from 'lucide-react'
import './styles.css'

const FORMATS = {
  jpeg: { label: 'JPG', name: 'JPG / JPEG', mime: 'image/jpeg', ext: 'jpg', note: 'Best for photos' },
  png: { label: 'PNG', name: 'PNG', mime: 'image/png', ext: 'png', note: 'Lossless & transparent' },
  webp: { label: 'WEBP', name: 'WebP', mime: 'image/webp', ext: 'webp', note: 'Smallest web files' },
}
const BACKGROUNDS = [
  { value: 'transparent', label: 'Transparent' }, { value: '#ffffff', label: 'White' },
  { value: '#ef4444', label: 'Red' }, { value: '#2563eb', label: 'Blue' },
  { value: '#16a34a', label: 'Green' }, { value: '#111827', label: 'Black' },
]
const BACKGROUND_MODELS = {
  fast: { model: 'isnet_quint8', label: 'Fast', size: '44 MB' },
  hd: { model: 'isnet_fp16', label: 'HD', size: '88 MB' },
  ultra: { model: 'isnet', label: 'Ultra', size: '176 MB' },
}
const EXTENSIONS = ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg']
const ACCEPT = `${EXTENSIONS.map((ext) => `.${ext}`).join(',')},image/*`
const PREFERENCES_KEY = 'pixelshift-preferences-v1'
const loadPreferences = () => {
  try { return JSON.parse(localStorage.getItem(PREFERENCES_KEY)) || {} }
  catch { return {} }
}
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
const sourceFormat = (file) => (file.name.split('.').pop() || 'image').toUpperCase()
const isSupported = (file) => file.type.startsWith('image/') || EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(`.${ext}`))
const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}
const droppedFiles = async (items) => {
  const walk = async (entry, path = '') => {
    if (entry.isFile) { const file = await new Promise((resolve, reject) => entry.file(resolve, reject)); Object.defineProperty(file, '_relativePath', { value: `${path}${file.name}` }); return [file] }
    if (!entry.isDirectory) return []
    const reader = entry.createReader(), children = []; let batch
    do { batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject)); children.push(...batch) } while (batch.length)
    return (await Promise.all(children.map((child) => walk(child, `${path}${entry.name}/`)))).flat()
  }
  const entries = Array.from(items).map((item) => item.webkitGetAsEntry?.()).filter(Boolean)
  return entries.length ? (await Promise.all(entries.map((entry) => walk(entry)))).flat() : []
}
const nestedDirectory = async (root, path) => {
  let current = root
  for (const folder of (path || '').split('/').filter(Boolean).slice(0, -1)) current = await current.getDirectoryHandle(folder, { create: true })
  return current
}
const nativeConvert = async (file, type, quality) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (type === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height) }
    context.drawImage(bitmap, 0, 0)
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas export failed')), type, quality))
  } finally { bitmap.close() }
}
const convertImage = async (file, type, quality) => {
  try { return await nativeConvert(file, type, quality) }
  catch (error) { if (!/\.(heic|heif)$/i.test(file.name) && !/heic|heif/i.test(file.type)) throw error; return heicTo({ blob: file, type, quality }) }
}
const decodeBitmap = async (file) => {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch (error) {
    if (!/\.(heic|heif)$/i.test(file.name) && !/heic|heif/i.test(file.type)) throw error
    const decoded = await heicTo({ blob: file, type: 'image/png', quality: 1 })
    return createImageBitmap(decoded)
  }
}
const exportCanvas = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(
  (blob) => blob ? resolve(blob) : reject(new Error('Canvas compression failed')), 'image/webp', quality,
))
const compressToTarget = async (file, targetBytes) => {
  const bitmap = await decodeBitmap(file)
  try {
    const initialScale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height))
    let width = Math.max(1, Math.round(bitmap.width * initialScale)), height = Math.max(1, Math.round(bitmap.height * initialScale))
    let smallestBlob = null
    for (let pass = 0; pass < 14; pass += 1) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
      let low = 0.06, high = 0.94, bestForSize = null
      for (let attempt = 0; attempt < 9; attempt += 1) {
        const quality = (low + high) / 2, blob = await exportCanvas(canvas, quality)
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob
        if (blob.size <= targetBytes) { bestForSize = blob; low = quality } else high = quality
      }
      if (bestForSize) return { blob: bestForSize, width, height }
      const lowestQuality = await exportCanvas(canvas, 0.04)
      if (lowestQuality.size <= targetBytes) return { blob: lowestQuality, width, height }
      if (width === 1 && height === 1) break
      const scale = Math.min(0.86, Math.sqrt(targetBytes / lowestQuality.size) * 0.9)
      width = Math.max(1, Math.floor(width * scale)); height = Math.max(1, Math.floor(height * scale))
    }
    return { blob: smallestBlob, width, height }
  } finally { bitmap.close() }
}
const resizeImage = async (file, requestedWidth, requestedHeight, preserveAspect, preventUpscale, type, quality) => {
  const bitmap = await decodeBitmap(file)
  try {
    let width = Math.min(8192, Math.max(1, Math.round(requestedWidth))), height = Math.min(8192, Math.max(1, Math.round(requestedHeight)))
    if (preserveAspect) {
      const scale = Math.min(width / bitmap.width, height / bitmap.height, preventUpscale ? 1 : Number.POSITIVE_INFINITY)
      width = Math.max(1, Math.round(bitmap.width * scale)); height = Math.max(1, Math.round(bitmap.height * scale))
    } else if (preventUpscale) {
      width = Math.min(width, bitmap.width); height = Math.min(height, bitmap.height)
    }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    if (type === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height) }
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Canvas resize failed')), type, quality))
    return { blob, width, height }
  } finally { bitmap.close() }
}
const removeImageBackground = async (file, background, qualityMode, onProgress) => {
  let source = file
  if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)) source = await heicTo({ blob: file, type: 'image/png', quality: 1 })
  const { removeBackground } = await import('@imgly/background-removal')
  const quality = BACKGROUND_MODELS[qualityMode] || BACKGROUND_MODELS.ultra
  const transparent = await removeBackground(source, {
    publicPath: `${window.location.origin}/ai-assets/`,
    model: quality.model,
    device: 'gpu',
    proxyToWorker: false,
    output: { format: 'image/png', quality: 1, type: 'foreground' },
    progress: (key, current, total) => {
      if (!total) return
      const percent = Math.min(100, Math.round((current / total) * 100))
      const stage = key.startsWith('compute:') ? 'Refining edges' : key.includes('/models/') ? `Downloading ${quality.label} AI` : 'Loading AI engine'
      onProgress?.(`${stage} · ${percent}%`)
    },
  })
  if (background === 'transparent') return { blob: transparent, extension: 'png', label: `${quality.label} transparent PNG` }
  const bitmap = await createImageBitmap(transparent)
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d'); context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0)
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Background export failed')), 'image/jpeg', 0.94))
    return { blob, extension: 'jpg', label: `${quality.label} ${background.toUpperCase()} background` }
  } finally { bitmap.close() }
}
const friendlyError = (error) => /memory|wasm|libheif/i.test(String(error)) ? 'The decoder ran out of memory. Try this file by itself.' : 'This file may be damaged or use a codec your browser cannot decode.'
const authRequest = async (path, options = {}) => {
  let response
  try {
    response = await fetch(`/api/auth/${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options })
  } catch {
    throw new Error('The sign-in service is offline. Restart the app with “npm run dev” and try again.')
  }
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to complete this request.')
  return data
}
let googleIdentityPromise
const loadGoogleIdentity = () => {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (googleIdentityPromise) return googleIdentityPromise
  googleIdentityPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pixelshift-google]')
    const script = existing || document.createElement('script')
    const loaded = () => window.google?.accounts?.id ? resolve(window.google) : reject(new Error('Google Sign-In could not load.'))
    script.addEventListener('load', loaded, { once: true }); script.addEventListener('error', () => reject(new Error('Google Sign-In could not load.')), { once: true })
    if (!existing) { script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.pixelshiftGoogle = 'true'; document.head.appendChild(script) }
  })
  return googleIdentityPromise
}

function GoogleSignInButton({ clientId, onAuthenticated, onError }) {
  const buttonRef = useRef(null), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!clientId || !buttonRef.current) return undefined
    let cancelled = false
    loadGoogleIdentity().then((google) => {
      if (cancelled || !buttonRef.current) return
      google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: async ({ credential }) => {
          if (!credential) return onError('Google did not return a credential.')
          setBusy(true); onError('')
          try {
            const data = await authRequest('google', { method: 'POST', body: JSON.stringify({ credential }) })
            onAuthenticated(data.user)
          } catch (error) { onError(error.message) }
          finally { setBusy(false) }
        },
      })
      buttonRef.current.replaceChildren()
      google.accounts.id.renderButton(buttonRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'left', width: Math.min(360, buttonRef.current.clientWidth || 360) })
    }).catch((error) => onError(error.message))
    return () => { cancelled = true }
  }, [clientId, onAuthenticated, onError])
  return <div className={`google-sign-in ${busy ? 'busy' : ''}`} aria-busy={busy}><div ref={buttonRef} />{busy && <span><RefreshCw className="spin" size={16} /> Verifying Google account…</span>}</div>
}

function AuthModal({ initialMode = 'login', googleClientId, onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode), [error, setError] = useState(''), [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'
  const submit = async (event) => {
    event.preventDefault(); setError(''); setSubmitting(true)
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const data = await authRequest(isRegister ? 'register' : 'login', { method: 'POST', body: JSON.stringify(values) })
      onAuthenticated(data.user)
    } catch (requestError) { setError(requestError.message) }
    finally { setSubmitting(false) }
  }
  return <div className="auth-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
      <div className="auth-logo"><Layers3 size={22} /></div>
      <div className="auth-heading"><span>PIXELSHIFT ACCOUNT</span><h2 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h2><p>{isRegister ? 'Save your workspace behind a secure sign-in.' : 'Sign in to start converting your images.'}</p></div>
      {googleClientId && <><GoogleSignInButton clientId={googleClientId} onAuthenticated={onAuthenticated} onError={setError} /><div className="auth-divider"><span>or continue with email</span></div></>}
      <div className="auth-tabs"><button className={!isRegister ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button><button className={isRegister ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Create account</button></div>
      <form onSubmit={submit}>
        {isRegister && <label>Full name<div className="auth-input"><User size={17} /><input name="name" autoComplete="name" minLength="2" maxLength="60" placeholder="Your name" required /></div></label>}
        <label>Email address<div className="auth-input"><Mail size={17} /><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div></label>
        <label>Password<div className="auth-input"><KeyRound size={17} /><input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" maxLength="72" placeholder="At least 8 characters" required /></div></label>
        {error && <div className="auth-error"><AlertCircle size={15} /> {error}</div>}
        <button className="auth-submit" disabled={submitting}>{submitting ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />}{submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in securely'}</button>
      </form>
      <small><LockKeyhole size={13} /> Google credentials are verified on the server and sessions use a secure JWT cookie.</small>
    </section>
  </div>
}

function App() {
  const [preferences] = useState(loadPreferences)
  const [files, setFiles] = useState([]), [format, setFormat] = useState(preferences.format || 'jpeg'), [quality, setQuality] = useState(preferences.quality || 90)
  const [tool, setTool] = useState(preferences.tool || 'convert'), [targetKB, setTargetKB] = useState(preferences.targetKB || 50)
  const [background, setBackground] = useState(preferences.background || 'transparent'), [customBackground, setCustomBackground] = useState(preferences.customBackground || '#f4b942')
  const [backgroundQuality, setBackgroundQuality] = useState(preferences.backgroundQuality || 'ultra')
  const [resizeWidth, setResizeWidth] = useState(preferences.resizeWidth || 1920), [resizeHeight, setResizeHeight] = useState(preferences.resizeHeight || 1080)
  const [preserveAspect, setPreserveAspect] = useState(preferences.preserveAspect ?? true), [preventUpscale, setPreventUpscale] = useState(preferences.preventUpscale ?? true)
  const [parallelism, setParallelism] = useState(preferences.parallelism || 3), [dragging, setDragging] = useState(false), [zipping, setZipping] = useState(false)
  const [user, setUser] = useState(null), [googleClientId, setGoogleClientId] = useState(''), [authOpen, setAuthOpen] = useState(false), [authLoading, setAuthLoading] = useState(true)
  const inputRef = useRef(null), folderInputRef = useRef(null), filesRef = useRef([])
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => () => filesRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url)), [])
  useEffect(() => {
    Promise.allSettled([
      authRequest('me').then(({ user: sessionUser }) => setUser(sessionUser)),
      authRequest('config').then(({ googleClientId: configuredClientId }) => setGoogleClientId(configuredClientId || '')),
    ]).finally(() => setAuthLoading(false))
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ format, quality, tool, targetKB, background, customBackground, backgroundQuality, resizeWidth, resizeHeight, preserveAspect, preventUpscale, parallelism })) }
    catch { /* Preferences are optional when browser storage is unavailable. */ }
  }, [format, quality, tool, targetKB, background, customBackground, backgroundQuality, resizeWidth, resizeHeight, preserveAspect, preventUpscale, parallelism])
  useEffect(() => {
    if (!authOpen) return undefined
    const closeOnEscape = (event) => event.key === 'Escape' && setAuthOpen(false)
    document.addEventListener('keydown', closeOnEscape); document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.classList.remove('modal-open') }
  }, [authOpen])
  const requireAuth = (action) => { if (!user) { setAuthOpen(true); return }; action() }
  const logout = async () => { await authRequest('logout', { method: 'POST' }).catch(() => {}); clearFiles(); setUser(null) }
  const addFiles = useCallback((incoming) => {
    // FileList is live and becomes empty as soon as the input is reset, so keep a stable snapshot.
    const selectedFiles = Array.from(incoming || []).filter(isSupported)
    if (!selectedFiles.length) return
    setFiles((current) => {
      const existing = new Set(current.map((item) => `${item.relativePath}|${item.file.size}|${item.file.lastModified}`))
      const additions = selectedFiles.map((file) => ({ file, relativePath: file.webkitRelativePath || file._relativePath || file.name }))
        .filter(({ file, relativePath }) => !existing.has(`${relativePath}|${file.size}|${file.lastModified}`))
        .map(({ file, relativePath }) => ({ id: uid(), file, relativePath, status: 'ready', url: '', error: '' }))
      return [...current, ...additions]
    })
  }, [])
  const removeFile = (id) => setFiles((current) => { const target = current.find((item) => item.id === id); if (target?.url) URL.revokeObjectURL(target.url); return current.filter((item) => item.id !== id) })
  const clearFiles = () => { files.forEach((item) => item.url && URL.revokeObjectURL(item.url)); setFiles([]) }
  const changeTool = (nextTool) => {
    if (nextTool === tool || converting) return
    setTool(nextTool)
    setFiles((current) => current.map((item) => { if (item.url) URL.revokeObjectURL(item.url); return { ...item, status: 'ready', url: '', error: '', progress: '', outputSize: undefined, outputFormat: undefined } }))
  }
  const convertOne = async (item, outputDirectory) => {
    if (item.url) URL.revokeObjectURL(item.url)
    setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'converting', error: '', progress: tool === 'background' ? 'Loading AI model…' : '' } : entry))
    try {
      const target = FORMATS[format]
      const selectedBackground = background === 'custom' ? customBackground : background
      const removed = tool === 'background' ? await removeImageBackground(item.file, selectedBackground, backgroundQuality, (progress) => setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress } : entry))) : null
      const compressed = tool === 'compress' ? await compressToTarget(item.file, targetKB * 1024) : null
      const resized = tool === 'resize' ? await resizeImage(item.file, resizeWidth, resizeHeight, preserveAspect, preventUpscale, target.mime, format === 'png' ? 1 : quality / 100) : null
      const blob = removed?.blob || compressed?.blob || resized?.blob || await convertImage(item.file, target.mime, format === 'png' ? 1 : quality / 100)
      const outputExtension = removed?.extension || (tool === 'compress' ? 'webp' : target.ext)
      const outputName = `${item.file.name.replace(/\.[^.]+$/, '') || item.file.name}${tool === 'resize' ? '-resized' : ''}.${outputExtension}`
      if (outputDirectory) { const directory = await nestedDirectory(outputDirectory, item.relativePath), handle = await directory.getFileHandle(outputName, { create: true }), writable = await handle.createWritable(); await writable.write(blob); await writable.close() }
      setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'done', progress: '', url: outputDirectory ? '' : URL.createObjectURL(blob), outputName, outputSize: blob.size, outputFormat: removed?.label || (tool === 'compress' ? `WEBP ≤ ${targetKB} KB` : resized ? `${target.label} · ${resized.width}×${resized.height}` : target.label), saved: Boolean(outputDirectory) } : entry))
    } catch (error) {
      console.error(`${tool} failed for ${item.file.name}`, error)
      const technicalMessage = String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 150)
      setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'error', progress: '', error: tool === 'background' ? `Background removal failed${technicalMessage ? `: ${technicalMessage}` : '.'}` : friendlyError(error) } : entry))
    }
  }
  const convertAll = async (saveToFolder = false) => {
    let outputDirectory
    if (saveToFolder) { try { outputDirectory = await window.showDirectoryPicker({ mode: 'readwrite' }) } catch (error) { if (error?.name !== 'AbortError') alert('Folder saving is unavailable here. Use regular conversion instead.'); return } }
    const retryable = files.filter((item) => ['ready', 'error'].includes(item.status)), queue = retryable.length ? retryable : files
    let nextIndex = 0
    const workers = tool === 'background' ? 1 : Math.min(parallelism, queue.length)
    await Promise.all(Array.from({ length: workers }, async () => { while (nextIndex < queue.length) await convertOne(queue[nextIndex++], outputDirectory) }))
  }
  const download = (item) => { const anchor = document.createElement('a'); anchor.href = item.url; anchor.download = item.outputName; anchor.click() }
  const downloadAll = async () => {
    const downloadable = files.filter((item) => item.status === 'done' && item.url)
    if (!downloadable.length || zipping) return
    setZipping(true)
    try {
      const zip = new JSZip()
      await Promise.all(downloadable.map(async (item) => {
        const folders = item.relativePath.replaceAll('\\', '/').split('/').slice(0, -1)
        zip.file([...folders, item.outputName].join('/'), await (await fetch(item.url)).blob())
      }))
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `pixelshift-${tool}-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally { setZipping(false) }
  }
  const completed = files.filter((item) => item.status === 'done').length, failed = files.filter((item) => item.status === 'error').length
  const processed = completed + failed, converting = files.some((item) => item.status === 'converting'), totalSize = files.reduce((sum, item) => sum + item.file.size, 0)

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header id="top"><a className="brand" href="#top"><span className="brand-mark"><Layers3 size={20} /></span><span>Pixel<span>Shift</span></span></a><nav><a href="#converter">Converter</a><a href="#converter" onClick={() => changeTool('resize')}>Resize</a><a href="#converter" onClick={() => changeTool('compress')}>Compress</a><a href="#converter" onClick={() => changeTool('background')}>Background</a></nav>{authLoading ? <div className="auth-skeleton" /> : user ? <div className="account-menu"><span className="avatar">{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>Signed in</small></div><button onClick={logout} title="Sign out"><LogOut size={16} /></button></div> : <button className="sign-in-button" onClick={() => setAuthOpen(true)}><User size={16} /> Sign in</button>}</header>
    <main>
      <section className="hero"><div className="eyebrow"><Sparkles size={14} /> Complete image toolkit</div><h1>Every image task.<br /><em>One simple workspace.</em></h1><p>Convert, resize, compress, or remove backgrounds—fast, private, and beautifully simple.</p><div className="hero-proof"><span><Check size={15} /> Batch resize & ZIP</span><span><Check size={15} /> AI background removal</span><span><Check size={15} /> Private on-device tools</span></div></section>
      <section className="converter-card" id="converter">
        <div className="tool-tabs"><button className={tool === 'convert' ? 'active' : ''} onClick={() => changeTool('convert')}><RefreshCw size={16} /><span><strong>Convert</strong><small>Change image format</small></span></button><button className={tool === 'resize' ? 'active' : ''} onClick={() => changeTool('resize')}><Maximize2 size={16} /><span><strong>Resize</strong><small>Set exact dimensions</small></span><b>NEW</b></button><button className={tool === 'compress' ? 'active' : ''} onClick={() => changeTool('compress')}><Minimize2 size={16} /><span><strong>Compress</strong><small>Shrink to 50 KB</small></span></button><button className={tool === 'background' ? 'active' : ''} onClick={() => changeTool('background')}><Eraser size={16} /><span><strong>Background</strong><small>Transparent or color</small></span></button></div>
        {!user && !authLoading && <button className="auth-required" onClick={() => setAuthOpen(true)}><LockKeyhole size={16} /><span><strong>Sign in to use the image tools</strong><small>Your images still stay entirely on this device.</small></span><ArrowRight size={17} /></button>}
        <div className="converter-titlebar"><div><span className="step-number">1</span><div><strong>Add images to {tool === 'background' ? 'edit' : tool}</strong><small>{tool === 'background' ? 'People and products work best' : tool === 'compress' ? 'Large images work best' : tool === 'resize' ? 'Resize a mixed batch in one pass' : 'Mix different formats in one batch'}</small></div></div><span className="local-badge"><ShieldCheck size={14} /> Processed locally</span></div>
        <div className={`dropzone ${dragging ? 'dragging' : ''} ${!user ? 'locked' : ''}`} onDragOver={(event) => { event.preventDefault(); user && setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={async (event) => { event.preventDefault(); setDragging(false); if (!user) return setAuthOpen(true); const traversed = await droppedFiles(event.dataTransfer.items); addFiles(traversed.length ? traversed : event.dataTransfer.files) }} onClick={() => requireAuth(() => inputRef.current?.click())} role="button" tabIndex="0" onKeyDown={(event) => ['Enter', ' '].includes(event.key) && requireAuth(() => inputRef.current?.click())}>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} /><input ref={folderInputRef} type="file" accept={ACCEPT} webkitdirectory="" directory="" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
          <div className="upload-icon">{user ? <UploadCloud size={29} /> : <LockKeyhole size={26} />}</div><h2>{user ? 'Drop images or folders here' : 'Sign in to start converting'}</h2><p>{user ? 'or choose files from your device' : 'Fast, private conversion with your secure account'}</p><div className="picker-actions"><button onClick={(event) => { event.stopPropagation(); requireAuth(() => inputRef.current?.click()) }}><FileImage size={16} /> Choose files</button><button onClick={(event) => { event.stopPropagation(); requireAuth(() => folderInputRef.current?.click()) }}><FolderOpen size={16} /> Choose folder</button></div><small>HEIC · JPG · PNG · WEBP · GIF · BMP · AVIF · SVG</small>
        </div>
        {files.length > 0 && <div className="file-panel">
          {failed > 0 && !converting && <div className="error-banner"><AlertCircle size={17} /><span><strong>{failed} image(s) couldn’t be processed.</strong> Check the file and try again.</span></div>}
          <div className="file-panel-head"><div><strong>{files.length} image(s) · {formatBytes(totalSize)}</strong><span>{completed ? ` · ${completed} finished` : ''}</span></div><div className="panel-actions">{completed > 1 && files.some((item) => item.url) && <button className="zip-button" disabled={zipping} onClick={downloadAll}>{zipping ? <RefreshCw size={14} className="spin" /> : <Archive size={14} />} {zipping ? 'Creating ZIP' : 'Download ZIP'}</button>}<label className="speed-control"><Bolt size={14} /><span>{tool === 'background' ? 'AI mode' : 'Speed'}</span><select value={tool === 'background' ? 1 : parallelism} disabled={converting || tool === 'background'} onChange={(event) => setParallelism(Number(event.target.value))}>{tool === 'background' && <option value="1">Safe · 1×</option>}<option value="2">Balanced · 2×</option><option value="3">Fast · 3×</option><option value="4">Turbo · 4×</option></select></label><button className="text-button" onClick={clearFiles}><Trash2 size={14} /> Clear all</button></div></div>
          <div className="file-list">{files.map((item) => <div className="file-row" key={item.id}><div className="file-thumb"><FileImage size={20} /><span>{sourceFormat(item.file)}</span></div><div className="file-info"><strong title={item.relativePath}>{item.relativePath}</strong><span>{item.progress || formatBytes(item.file.size)}{item.status === 'done' && ` → ${item.outputFormat} · ${formatBytes(item.outputSize)}`}</span>{item.error && <span className="error-text">{item.error}</span>}</div><div className={`status status-${item.status}`}>{item.status === 'converting' && <><RefreshCw size={14} className="spin" /> {tool === 'background' ? 'Removing' : tool === 'compress' ? 'Compressing' : tool === 'resize' ? 'Resizing' : 'Converting'}</>}{item.status === 'done' && <><Check size={14} /> {item.saved ? 'Saved' : 'Ready'}</>}{item.status === 'error' && 'Failed'}</div>{item.status === 'done' && item.url ? <button className="icon-button download" onClick={() => download(item)} aria-label={`Download ${item.outputName}`}><Download size={17} /></button> : item.saved ? <span className="saved-check"><Check size={17} /></span> : <button className="icon-button" onClick={() => removeFile(item.id)} aria-label={`Remove ${item.file.name}`}><X size={17} /></button>}</div>)}</div>
        </div>}
        <div className={`controls ${tool === 'resize' ? 'resize-controls' : tool !== 'convert' ? 'compress-controls' : ''}`}>
          {tool === 'convert' ? <><div className="control-block"><label htmlFor="format"><span className="step-number small">2</span> Convert to</label><div className="select-wrap"><select id="format" value={format} onChange={(event) => setFormat(event.target.value)}>{Object.entries(FORMATS).map(([value, option]) => <option key={value} value={value}>{option.name} — {option.note}</option>)}</select><ChevronDown size={16} /></div></div><div className={`control-block quality ${format === 'png' ? 'disabled' : ''}`}><div className="label-row"><label htmlFor="quality">Quality</label><output>{quality}%</output></div><input id="quality" type="range" min="50" max="100" value={quality} disabled={format === 'png'} onChange={(event) => setQuality(Number(event.target.value))} /><div className="range-labels"><span>Smaller file</span><span>Best quality</span></div></div></>
            : tool === 'compress' ? <><div className="control-block"><label htmlFor="target-size"><span className="step-number small">2</span> Maximum file size</label><div className="select-wrap"><select id="target-size" value={targetKB} onChange={(event) => setTargetKB(Number(event.target.value))}><option value="25">25 KB — Extra small</option><option value="50">50 KB — Recommended</option><option value="100">100 KB — Better detail</option><option value="200">200 KB — High detail</option></select><ChevronDown size={16} /></div></div><div className="compression-summary"><Minimize2 size={19} /><div><strong>Smart WebP compression</strong><span>Quality is reduced first, dimensions only if needed.</span></div></div></>
              : tool === 'resize' ? <><div className="control-block"><label><span className="step-number small">2</span> {preserveAspect ? 'Maximum dimensions' : 'Exact dimensions'}</label><div className="dimension-fields"><label>W <input aria-label="Resize width" type="number" min="1" max="8192" value={resizeWidth} onChange={(event) => setResizeWidth(Math.min(8192, Math.max(1, Number(event.target.value))))} /></label><span>×</span><label>H <input aria-label="Resize height" type="number" min="1" max="8192" value={resizeHeight} onChange={(event) => setResizeHeight(Math.min(8192, Math.max(1, Number(event.target.value))))} /></label><small>px</small></div></div><div className="control-block"><label htmlFor="resize-format">Output format</label><div className="select-wrap"><select id="resize-format" value={format} onChange={(event) => setFormat(event.target.value)}>{Object.entries(FORMATS).map(([value, option]) => <option key={value} value={value}>{option.name}</option>)}</select><ChevronDown size={16} /></div></div><div className="control-block resize-options"><label>Resize behavior</label><label className="check-option"><input type="checkbox" checked={preserveAspect} onChange={(event) => setPreserveAspect(event.target.checked)} /><span><Check size={12} /></span> Preserve aspect ratio</label><label className="check-option"><input type="checkbox" checked={preventUpscale} onChange={(event) => setPreventUpscale(event.target.checked)} /><span><Check size={12} /></span> Never enlarge images</label></div></>
                : <><div className="control-block background-control"><label><span className="step-number small">2</span> New background</label><div className="color-options">{BACKGROUNDS.map((color) => <button key={color.value} className={`${color.value === 'transparent' ? 'transparent-swatch' : ''} ${background === color.value ? 'selected' : ''}`} style={color.value.startsWith('#') ? { backgroundColor: color.value } : undefined} onClick={() => setBackground(color.value)} title={color.label} aria-label={`${color.label} background`}>{background === color.value && <Check size={13} />}</button>)}<label className={`custom-swatch ${background === 'custom' ? 'selected' : ''}`} title="Custom color"><input type="color" value={customBackground} onChange={(event) => { setCustomBackground(event.target.value); setBackground('custom') }} /><span style={{ backgroundColor: customBackground }} />{background === 'custom' && <Check size={13} />}</label></div></div><div className="control-block ai-quality"><label htmlFor="ai-quality"><Eraser size={14} /> AI quality</label><div className="select-wrap"><select id="ai-quality" value={backgroundQuality} onChange={(event) => setBackgroundQuality(event.target.value)}><option value="ultra">Ultra — Full model · 176 MB</option><option value="hd">HD — Detailed · 88 MB</option><option value="fast">Fast — Lightweight · 44 MB</option></select><ChevronDown size={16} /></div><small>Downloaded once, then cached by Edge.</small></div></>}
          <div className="action-buttons">{'showDirectoryPicker' in window && <button className="folder-save-button" disabled={!files.length || converting} onClick={() => convertAll(true)}><FolderDown size={18} /> Save folder</button>}<button className="convert-button" disabled={!files.length || converting} onClick={() => convertAll(false)}>{converting ? `${processed}/${files.length}` : failed ? `Retry ${failed}` : completed === files.length && completed ? `${tool === 'background' ? 'Remove again' : tool === 'compress' ? 'Compress again' : tool === 'resize' ? 'Resize again' : 'Convert again'}` : tool === 'background' ? 'Remove background' : tool === 'compress' ? `Compress to ${targetKB} KB` : tool === 'resize' ? 'Resize images' : `Convert to ${FORMATS[format].label}`}{converting ? <RefreshCw size={18} className="spin" /> : tool === 'background' ? <Eraser size={18} /> : tool === 'compress' ? <Minimize2 size={18} /> : tool === 'resize' ? <Maximize2 size={18} /> : <ArrowRight size={18} />}</button></div>
        </div>
      </section>
      <section className="format-strip" id="formats"><span>Convert from</span>{['HEIC', 'JPG', 'PNG', 'WEBP', 'GIF', 'BMP', 'AVIF', 'SVG'].map((item) => <b key={item}>{item}</b>)}<ArrowRight size={17} /><strong>JPG · PNG · WEBP</strong></section>
      <section className="trust-row" id="privacy"><article><span><ShieldCheck size={21} /></span><div><strong>Your files stay yours</strong><p>Image processing happens locally and files never leave your device.</p></div></article><article><span><WandSparkles size={21} /></span><div><strong>AI-powered cutouts</strong><p>Remove backgrounds and replace them with transparent or solid color.</p></div></article><article><span><Zap size={21} /></span><div><strong>Built for batches</strong><p>Process mixed files and complete folders in one easy workflow.</p></div></article></section>
    </main>
    <footer><span>PixelShift</span><p>Universal image conversion, right in your browser.</p><small>Private · Fast · Secure</small></footer>
    {authOpen && <AuthModal googleClientId={googleClientId} onClose={() => setAuthOpen(false)} onAuthenticated={(authenticatedUser) => { setUser(authenticatedUser); setAuthOpen(false) }} />}
  </div>
}
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
