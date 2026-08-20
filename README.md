# PixelShift Universal Image Converter

A private, browser-based image workspace for HEIC/HEIF, JPG, PNG, WebP, GIF, BMP, AVIF, and SVG images. Convert formats, batch-resize images, compress to 25–200 KB, or remove backgrounds and replace them with transparent, white, red, blue, green, black, or a custom color. It supports mixed batches, individual files, folder selection, recursive folder drops, and one-click ZIP downloads.

## Run locally

```bash
npm install
npm run dev
```

The development command starts both the Vite app and the authentication API. Open the Vite URL shown in the terminal. Accounts are stored locally in `server/data/users.json`, which is excluded from Git.

## Google Sign-In

Create an OAuth 2.0 client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with application type **Web application**. Add your local URL (for example, `http://localhost:5173`) and production HTTPS URL as **Authorized JavaScript origins**, then set the same client ID in `.env`:

```env
GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

No Google client secret is required for this button flow. The browser sends Google's signed ID token to the PixelShift API, which verifies it with `google-auth-library` before creating the normal secure session cookie. Restart the development server after changing `.env`.

Conversion happens entirely in the browser using native image codecs first and `heic-to`/libheif as the HEIC fallback; selected images are never uploaded. Animated inputs are exported as a single frame.

The resize tool supports maximum-bound resizing with the original aspect ratio, exact dimensions, optional upscaling prevention, and JPG, PNG, or WebP output. Tool preferences are saved locally in the browser for the next visit.

Compression exports optimized WebP files. It searches for the highest quality that fits the selected size, then progressively reduces dimensions only when quality adjustment alone cannot reach the target.

Background removal uses on-device ISNet AI through `@imgly/background-removal`. Users can choose Fast (quantized), HD (FP16), or Ultra (full-precision) quality; Ultra is the default and WebGPU acceleration is used when available. The selected model is downloaded and cached on first use, while images remain local. Transparent results export as PNG and solid-color results as high-quality JPG. This dependency is distributed under the AGPL license—review its license before commercial distribution.

For large folders, use **Convert & save folder** in Chrome or Edge. The app writes each converted file directly to the chosen destination and preserves subfolders, avoiding the memory cost of holding every output for download.

## Authentication and production

Authentication uses bcrypt password hashes and a seven-day JWT stored in an HttpOnly, SameSite cookie. Before deploying, copy `.env.example` to `.env`, set a long random `JWT_SECRET`, build the client, and start the combined server:

```bash
npm run build
npm start
```

The JSON user store is suitable for a local or single-instance deployment. For a horizontally scaled production deployment, replace it with a shared database while keeping the API contract unchanged.

## Deploy to Vercel

The repository includes `vercel.json` and a Vercel Function that serves the authentication API and streams the background-removal model assets. Connect the repository at [vercel.com/new](https://vercel.com/new); Vercel will detect the Vite build settings automatically.

Add these environment variables in **Project Settings → Environment Variables**, then redeploy:

```env
JWT_SECRET=a-long-random-secret
GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

The simplest setup is to connect [Neon Postgres from the Vercel Marketplace](https://vercel.com/marketplace/neon) to the PixelShift project. Confirm that the integration creates `DATABASE_URL` for Production (and Preview when desired).

In the Google Cloud OAuth client, add both `http://localhost:5173` and the production Vercel HTTPS domain as **Authorized JavaScript origins**. A Google client secret is not needed.

Vercel Functions do not provide a persistent writable filesystem, so production email/password accounts use Postgres through `DATABASE_URL`. The required `pixelshift_users` table is created automatically on the first registration request. Google authentication remains stateless and local development falls back to `server/data/users.json` when no database URL is configured.
