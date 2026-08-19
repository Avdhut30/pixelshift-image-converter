# PixelShift Universal Image Converter

A private, browser-based image workspace for HEIC/HEIF, JPG, PNG, WebP, GIF, BMP, AVIF, and SVG images. Convert formats, compress to 25–200 KB, or remove backgrounds and replace them with transparent, white, red, blue, green, black, or a custom color. It supports mixed batches, individual files, folder selection, and recursive folder drops.

## Run locally

```bash
npm install
npm run dev
```

The development command starts both the Vite app and the authentication API. Open the Vite URL shown in the terminal. Accounts are stored locally in `server/data/users.json`, which is excluded from Git.

Conversion happens entirely in the browser using native image codecs first and `heic-to`/libheif as the HEIC fallback; selected images are never uploaded. Animated inputs are exported as a single frame.

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
