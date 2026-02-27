# Operations and Runbook

## 1) Local Development

From `tingyun sipping tool/`:

```bash
npm install
python3 -m pip install -r ../backend/requirements.txt
npm run dev:local
```

Default ports:

- Next: `3000`
- FastAPI: `8014`

Override backend port:

```bash
FASTAPI_PORT=8010 FASTAPI_BASE_URL=http://127.0.0.1:8010 npm run dev:local
```

## 2) Backend-Only Smoke Test

```bash
npm run test:backend:smoke
```

Confirms:

- backend start/health
- at least one conversion path

## 3) Web and Desktop Tests

Web smoke:

```bash
npm run test:web:smoke
```

Web E2E:

```bash
npm run test:web:e2e
```

Desktop pass:

```bash
npm run test:desktop:full
```

## 4) Electron Development

```bash
npm run electron:dev
```

What it starts:

- Next dev server
- FastAPI backend
- Electron shell

## 5) Packaging

Build desktop artifacts:

```bash
npm run electron:dist
```

Output folder:

- `dist-electron/`

Typical artifacts:

- `Tingyun Snipping Tool-<version>-arm64.dmg`
- `Tingyun Snipping Tool-<version>-arm64-mac.zip`

## 6) Logs and Debugging

Desktop log path:

- `~/Library/Application Support/my-v0-project/logs/desktop-app.log`

What to inspect first:

1. `renderer: Conversion failed` entries
2. `next-route:*` entries from API proxy
3. backend startup health entries
4. screen capture permission entries (`get-screen-sources failed`, permission status)

## 7) Common Failure Modes

### `HTTP 413` on Vercel

Cause: serverless body size limit.  
Fix: run model backend separately and set `FASTAPI_BASE_URL`, or use Electron/local mode for large PDFs.

### `Cannot read properties of undefined (...)`

Cause: malformed request/response shape in proxy path.  
Fix: check `requestId` in UI error and match `next-route` logs in desktop log.

### Screen capture shows 0 sources on macOS

Cause: Screen Recording permission not granted for app binary.  
Fix: grant permission in macOS Privacy settings, then restart app.

## 8) Release Checklist

1. `npm run build`
2. `npm run test:backend:smoke`
3. `npm run test:web:smoke`
4. `npm run test:desktop:full` (or at least `npm run electron:dist`)
5. verify artifacts in `dist-electron/`
6. commit with clear message
7. push `main`

