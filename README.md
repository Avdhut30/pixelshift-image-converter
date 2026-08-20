<div align="center">

# PixelShift

### Your complete image workspace—fast, private, and built for the browser.

Convert formats, resize batches, compress images to a target size, and remove backgrounds with on-device AI. No image uploads, no desktop software, and no watermarks.

[**Launch PixelShift →**](https://pixelshift-image-converter.vercel.app)

<br />

[![Live on Vercel](https://img.shields.io/badge/Live_on_Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://pixelshift-image-converter.vercel.app)
![React 18](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite 6](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Local processing](https://img.shields.io/badge/Images-Processed_locally-166B4F?style=for-the-badge&logo=shield&logoColor=white)

</div>

---

## Live website

PixelShift is deployed on Vercel with HTTPS:

### [https://pixelshift-image-converter.vercel.app](https://pixelshift-image-converter.vercel.app)

Use the stable URL above rather than a generated Vercel Preview URL.

## Why PixelShift?

PixelShift brings the image tasks people use every day into one focused workspace. Images are processed inside the browser whenever possible, keeping personal photos and project assets on the user's device.

- **One workspace, four tools** — convert, resize, compress, and remove backgrounds.
- **Private by design** — selected images are not uploaded to the application server.
- **Batch friendly** — mix file types, import folders, preserve subfolders, and export ZIP archives.
- **Modern authentication** — continue with Google or create an email/password account.
- **Install-free** — works directly in a modern desktop or mobile browser.
- **No watermarks** — downloaded results belong to the user.

## Features

| Tool | What it does | Output |
| --- | --- | --- |
| **Convert** | Converts mixed image batches with configurable quality | JPG, PNG, WebP |
| **Resize** | Uses maximum bounds or exact dimensions, preserves aspect ratio, and can prevent upscaling | JPG, PNG, WebP |
| **Compress** | Searches for the best WebP quality and progressively reduces dimensions to reach 25–200 KB | Optimized WebP |
| **Remove background** | Runs BEN2 Studio AI or ISNet locally, with automatic fallback plus transparent and solid-color replacements | PNG or JPG |

Additional workflow features include:

- Individual file selection, folder selection, and recursive folder drag-and-drop
- Parallel batch processing with adjustable concurrency
- One-click downloads and multi-file ZIP export
- Direct folder output through the File System Access API in supported browsers
- Locally saved tool preferences
- Native browser codecs with a libheif fallback for HEIC/HEIF files
- **Studio AI** background removal with a 1024×1024 BEN2 model for finer subject edges
- WebGPU acceleration and automatic Ultra fallback on unsupported devices

## Supported formats

| Format | Input | Conversion output | Notes |
| --- | :---: | :---: | --- |
| HEIC / HEIF | ✓ | — | Decoded with native support or the `heic-to` fallback |
| JPG / JPEG | ✓ | ✓ | Recommended for photographs and solid backgrounds |
| PNG | ✓ | ✓ | Supports lossless and transparent output |
| WebP | ✓ | ✓ | Used for target-size compression |
| GIF | ✓ | — | Animated inputs export their first frame |
| BMP | ✓ | — | Input support depends on browser decoding |
| AVIF | ✓ | — | Input support depends on browser decoding |
| SVG | ✓ | — | Rasterized before export |

## Privacy and architecture

```mermaid
flowchart LR
    User[User's browser] --> UI[React + Vite workspace]
    UI --> Local[Canvas, codecs, and on-device AI]
    Local --> Download[Local file or ZIP download]
    UI --> Auth[Vercel authentication API]
    Auth --> Google[Google Identity Services]
    Auth --> Neon[(Neon Postgres)]
```

Image bytes are handled by browser APIs and on-device background-removal models. The application server handles authentication requests, not the selected image files. The pinned BEN2 Studio model is downloaded directly from Hugging Face and cached by the browser; ISNet fallback assets are streamed through the Vercel Function.

## Authentication

PixelShift supports two production sign-in methods:

1. **Google Sign-In** — the browser receives a Google ID token, and the server verifies its audience and signature with `google-auth-library`.
2. **Email and password** — accounts are stored in Neon Postgres with bcrypt password hashes.

Successful authentication creates a seven-day JWT session in an HttpOnly, Secure, SameSite cookie. Authentication endpoints are rate-limited, and database queries use parameterized templates.

Local development uses `server/data/users.json` when `DATABASE_URL` is not configured. That file is excluded from Git.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, Lucide React |
| Image conversion | Canvas API, native browser codecs, `heic-to` |
| Background removal | BEN2, `@imgly/background-removal`, ONNX Runtime Web, WebGPU |
| ZIP export | JSZip |
| API | Express 5 on a Vercel Function |
| Authentication | Google Identity Services, bcrypt, JWT |
| Database | Neon serverless Postgres |
| Hosting | Vercel |

## Getting started locally

### Prerequisites

- Node.js 20 or newer
- npm
- A modern browser such as Chrome, Edge, Firefox, or Safari

### Installation

```bash
git clone https://github.com/Avdhut30/pixelshift-image-converter.git
cd pixelshift-image-converter
npm install
```

Create a `.env` file from `.env.example` and set the values you need:

```env
JWT_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=replace-with-your-web-client-id.apps.googleusercontent.com
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
NODE_ENV=development
PORT=8787
HOST=127.0.0.1
```

`GOOGLE_CLIENT_ID` and `DATABASE_URL` are optional for basic local development. Without `DATABASE_URL`, manual accounts use the ignored local JSON store.

Start the frontend and API together:

```bash
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173`.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Vite and the authentication API in watch mode |
| `npm run dev:web` | Starts only the Vite frontend |
| `npm run dev:api` | Starts only the Express API |
| `npm run build` | Creates the production Vite bundle in `dist/` |
| `npm start` | Serves the built frontend and API with Express |
| `npm run preview` | Builds and starts the combined production server |

## Environment variables

| Variable | Required | Purpose |
| --- | :---: | --- |
| `JWT_SECRET` | Production | Signs secure user sessions; use a long random value |
| `GOOGLE_CLIENT_ID` | For Google login | OAuth 2.0 Web Client ID from Google Cloud |
| `DATABASE_URL` | For production password login | Postgres connection string; provisioned automatically by the Neon Vercel integration |
| `NODE_ENV` | Recommended | Use `production` in deployed environments |
| `PORT` | No | Express port; defaults to `8787` |
| `HOST` | No | Express host; defaults to `127.0.0.1` |

Never commit `.env` files or database credentials.

## Google OAuth setup

1. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 client with application type **Web application**.
3. Add these **Authorized JavaScript origins**:

   ```text
   http://localhost:5173
   https://pixelshift-image-converter.vercel.app
   ```

4. Set the generated client ID as `GOOGLE_CLIENT_ID`.

A Google client secret and redirect URI are not required for the Google Identity Services button flow used by PixelShift.

## Deploying to Vercel

The repository includes [`vercel.json`](./vercel.json), which configures the Vite build, SPA fallback, API rewrites, serverless function resources, and required browser headers.

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Add `JWT_SECRET` and `GOOGLE_CLIENT_ID` in **Project Settings → Environment Variables**.
3. Connect [Neon Postgres](https://vercel.com/marketplace/neon) from the Vercel Marketplace. The integration supplies `DATABASE_URL`.
4. Enable the variables for Production and any Preview environments that need authentication.
5. Deploy or redeploy the project.

The `pixelshift_users` table is created automatically on the first email registration request.

## Project structure

```text
pixelshift-image-converter/
├── api/
│   └── index.js             # Vercel Function entry point
├── server/
│   └── index.js             # Express API, auth, database, and AI asset proxy
├── src/
│   ├── converter-frame.js   # Isolated HEIC fallback worker frame
│   ├── main.jsx             # React application and image workflows
│   └── styles.css           # Responsive product UI
├── converter-frame.html     # Hidden HEIC decoding frame
├── index.html               # Vite entry document and metadata
├── vercel.json              # Vercel build, function, rewrite, and header config
└── vite.config.js           # Vite development and proxy configuration
```

## Browser notes

- Chrome and Edge provide the fullest folder workflow, including direct folder output.
- Other modern browsers support file selection, conversion, and regular downloads.
- Studio AI uses WebGPU through ONNX Runtime Web. If WebGPU or BEN2 is unavailable, PixelShift automatically switches to the Ultra ISNet engine.
- The first background-removal run downloads a model of approximately 44–209 MB depending on the chosen quality. It is cached for later use.

## Security notes

- Passwords are hashed with bcrypt and are never stored as plain text.
- Session tokens are stored in HttpOnly cookies and signed with `JWT_SECRET`.
- Google ID tokens are verified on the server for the configured OAuth audience.
- Helmet security headers and authentication rate limits are enabled.
- Postgres queries use the Neon driver's parameterized template API.
- Production password authentication is shown only when a database connection exists.

## Contributing

Contributions and constructive feedback are welcome.

1. Fork the repository.
2. Create a focused feature branch.
3. Make and test your changes.
4. Open a pull request describing the change and its impact.

For bugs, include the browser, operating system, input format, and steps needed to reproduce the problem. Do not attach private images to public issues.

## License and third-party software

This repository does not currently include a project-wide license. Add an appropriate license before inviting redistribution or reuse.

Studio AI uses the MIT-licensed [BEN2 ONNX model](https://huggingface.co/onnx-community/BEN2-ONNX). The fallback is powered by `@imgly/background-removal`, which is distributed under the AGPL. Review its license and the licenses of all dependencies before commercial distribution.

---

<div align="center">

Built by [Avdhut30](https://github.com/Avdhut30) · [Open the live app](https://pixelshift-image-converter.vercel.app)

</div>
