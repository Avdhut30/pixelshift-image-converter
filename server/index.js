import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { neon } from '@neondatabase/serverless'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = join(root, 'server', 'data')
const usersFile = join(dataDirectory, 'users.json')
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const isProduction = process.env.NODE_ENV === 'production'
const isVercel = Boolean(process.env.VERCEL)
const jwtSecret = process.env.JWT_SECRET || 'pixelshift-local-development-secret-change-me'
const googleClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim()
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null
const databaseUrl = String(process.env.DATABASE_URL || '').trim()
const sql = databaseUrl ? neon(databaseUrl) : null
const aiAssetBase = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/'

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production')
}

if (!isVercel) {
  await mkdir(dataDirectory, { recursive: true })
  if (!existsSync(usersFile)) await writeFile(usersFile, '[]\n', 'utf8')
}

const readUsers = async () => JSON.parse(await readFile(usersFile, 'utf8'))
const saveUsers = async (users) => {
  const temporaryFile = `${usersFile}.tmp`
  await writeFile(temporaryFile, `${JSON.stringify(users, null, 2)}\n`, 'utf8')
  await rename(temporaryFile, usersFile)
}
let databaseSetup
const ensureDatabase = async () => {
  if (!sql) throw new Error('DATABASE_URL is not configured')
  databaseSetup ||= sql`
      CREATE TABLE IF NOT EXISTS pixelshift_users (
        id UUID PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        email VARCHAR(120) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.catch((error) => { databaseSetup = null; throw error })
  await databaseSetup
}
const databaseUser = (row) => ({ id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, provider: 'password' })
const publicUser = ({ id, name, email }) => ({ id, name, email })
const createToken = (user) => jwt.sign({ sub: user.id, name: user.name, email: user.email, provider: user.provider || 'password' }, jwtSecret, { expiresIn: '7d', issuer: 'pixelshift' })
const setSession = (response, user) => response.cookie('pixelshift_session', createToken(user), {
  httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
})
const authenticate = (request, response, next) => {
  try {
    const payload = jwt.verify(request.cookies.pixelshift_session, jwtSecret, { issuer: 'pixelshift' })
    if (!payload.sub || !payload.email || !payload.name) throw new Error('Invalid session')
    request.user = { id: payload.sub, name: payload.name, email: payload.email }
    next()
  } catch { response.status(401).json({ error: 'Your session has expired. Please sign in again.' }) }
}

const app = express()
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, crossOriginEmbedderPolicy: false }))
app.use(express.json({ limit: '20kb' }))
app.use(cookieParser())
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes.' } })

app.use('/ai-assets', async (request, response, next) => {
  try {
    const assetPath = request.path.replace(/^\/+/, '') || 'resources.json'
    if (!/^[a-zA-Z0-9._/-]+$/.test(assetPath) || assetPath.includes('..')) return response.status(400).end()
    const upstream = await fetch(new URL(assetPath, aiAssetBase), { signal: AbortSignal.timeout(120000) })
    if (!upstream.ok) return response.status(upstream.status).end()
    response.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
    response.set('Cache-Control', 'public, max-age=31536000, immutable')
    response.set('Cross-Origin-Resource-Policy', 'same-origin')
    if (!upstream.body) return response.status(502).end()
    Readable.fromWeb(upstream.body).on('error', next).pipe(response)
  } catch (error) {
    if (error.name === 'TimeoutError') return response.status(504).json({ error: 'AI model download timed out.' })
    next(error)
  }
})

app.post('/api/auth/register', authLimiter, async (request, response) => {
  const name = String(request.body.name || '').trim().replace(/\s+/g, ' ')
  const email = String(request.body.email || '').trim().toLowerCase()
  const password = String(request.body.password || '')
  if (name.length < 2 || name.length > 60) return response.status(400).json({ error: 'Enter your full name.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return response.status(400).json({ error: 'Enter a valid email address.' })
  if (password.length < 8 || password.length > 72) return response.status(400).json({ error: 'Password must be between 8 and 72 characters.' })
  if (sql) {
    try {
      await ensureDatabase()
      const existing = await sql`SELECT id FROM pixelshift_users WHERE email = ${email} LIMIT 1`
      if (existing.length) return response.status(409).json({ error: 'An account with this email already exists.' })
      const passwordHash = await bcrypt.hash(password, 12)
      const rows = await sql`
        INSERT INTO pixelshift_users (id, name, email, password_hash)
        VALUES (${crypto.randomUUID()}, ${name}, ${email}, ${passwordHash})
        RETURNING id, name, email, password_hash
      `
      const user = databaseUser(rows[0])
      return setSession(response, user).status(201).json({ user: publicUser(user) })
    } catch (error) {
      if (error.code === '23505') return response.status(409).json({ error: 'An account with this email already exists.' })
      throw error
    }
  }
  if (isVercel) return response.status(503).json({ error: 'Email sign-in is waiting for the production database connection.' })
  const users = await readUsers()
  if (users.some((user) => user.email === email)) return response.status(409).json({ error: 'An account with this email already exists.' })
  const user = { id: crypto.randomUUID(), name, email, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() }
  users.push(user)
  await saveUsers(users)
  return setSession(response, user).status(201).json({ user: publicUser(user) })
})

app.post('/api/auth/login', authLimiter, async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase()
  const password = String(request.body.password || '')
  if (sql) {
    await ensureDatabase()
    const rows = await sql`SELECT id, name, email, password_hash FROM pixelshift_users WHERE email = ${email} LIMIT 1`
    const user = rows[0] ? databaseUser(rows[0]) : null
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return response.status(401).json({ error: 'Email or password is incorrect.' })
    return setSession(response, user).json({ user: publicUser(user) })
  }
  if (isVercel) return response.status(503).json({ error: 'Email sign-in is waiting for the production database connection.' })
  const user = (await readUsers()).find((entry) => entry.email === email)
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return response.status(401).json({ error: 'Email or password is incorrect.' })
  return setSession(response, user).json({ user: publicUser(user) })
})

app.get('/api/auth/config', (_request, response) => response.json({ googleClientId, passwordAuthEnabled: Boolean(sql) || !isVercel }))
app.post('/api/auth/google', authLimiter, async (request, response) => {
  if (!googleClient) return response.status(503).json({ error: 'Google Sign-In has not been configured yet.' })
  const credential = String(request.body.credential || '')
  if (!credential || credential.length > 10000) return response.status(400).json({ error: 'Google did not return a valid credential.' })
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email || payload.email_verified !== true) return response.status(401).json({ error: 'Google could not verify this email address.' })
    let user = { id: `google:${payload.sub}`, googleSubject: payload.sub, provider: 'google', name: String(payload.name || payload.email.split('@')[0]).slice(0, 60), email: payload.email.toLowerCase() }
    if (!isVercel) {
      const users = await readUsers()
      const existing = users.find((entry) => entry.googleSubject === payload.sub)
      if (!existing && users.some((entry) => entry.email === user.email)) return response.status(409).json({ error: 'This email already has a password account. Sign in with your password.' })
      if (existing) { existing.name = user.name; existing.email = user.email; user = existing }
      else users.push({ ...user, createdAt: new Date().toISOString() })
      await saveUsers(users)
    }
    setSession(response, user).json({ user: publicUser(user) })
  } catch {
    response.status(401).json({ error: 'Google Sign-In could not be verified. Please try again.' })
  }
})

app.get('/api/auth/me', authenticate, (request, response) => response.json({ user: publicUser(request.user) }))
app.post('/api/auth/logout', (_request, response) => response.clearCookie('pixelshift_session', { path: '/', sameSite: 'strict', secure: isProduction }).status(204).end())
app.get('/api/health', (_request, response) => response.json({ ok: true }))

app.use(express.static(join(root, 'dist')))
app.use((request, response, next) => request.method === 'GET' && !request.path.startsWith('/api/')
  ? response.sendFile(join(root, 'dist', 'index.html')) : next())
app.use((error, _request, response, _next) => { console.error(error); response.status(500).json({ error: 'Something went wrong. Please try again.' }) })
if (!isVercel) app.listen(port, host, () => console.log(`PixelShift server running at http://${host}:${port}`))

export default app
