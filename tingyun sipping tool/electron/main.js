const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen, shell, systemPreferences, session } = require("electron")
const path = require("path")
const fs = require("fs")
const http = require("http")
const net = require("net")
const { spawn, spawnSync } = require("child_process")
const isDev = !app.isPackaged

// Keep a global reference of the window object to prevent garbage collection
let mainWindow
let embeddedNextServer = null
let embeddedNextUrl = null
let backendProcess = null
let backendBaseUrl = null
let backendLastError = null
let backendStartupPromise = null

function ensureLogDir() {
  const logDir = path.join(app.getPath("userData"), "logs")
  fs.mkdirSync(logDir, { recursive: true })
  return logDir
}

function getLogPath() {
  return path.join(ensureLogDir(), "desktop-app.log")
}

function writeLog(level, message, meta = {}) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      meta,
    })
    fs.appendFileSync(getLogPath(), `${line}\n`, "utf8")
  } catch (error) {
    console.error("Failed to write log:", error)
  }
}

function stripAnsi(input) {
  return String(input || "").replace(/\x1B\[[0-9;]*m/g, "")
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isBackendHealthy(baseUrl) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const response = await fetch(`${baseUrl}/health`, { method: "GET", signal: controller.signal })
    clearTimeout(timer)
    return response.ok
  } catch (_) {
    return false
  }
}

function isPortInUse(port) {
  const res = spawnSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
  return res.status === 0 && Boolean(res.stdout && res.stdout.trim())
}

function terminatePortListeners(port) {
  const res = spawnSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
  if (res.status !== 0 || !res.stdout) {
    return 0
  }
  const pids = res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number.parseInt(line, 10))
    .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid)

  let killed = 0
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM")
      killed += 1
    } catch (_) {
      // ignore
    }
  }
  return killed
}

async function findAvailablePort(startPort) {
  const maxChecks = 30
  for (let offset = 0; offset < maxChecks; offset += 1) {
    const candidate = startPort + offset
    const free = await new Promise((resolve) => {
      const server = net.createServer()
      server.once("error", () => resolve(false))
      server.once("listening", () => {
        server.close(() => resolve(true))
      })
      server.listen(candidate, "127.0.0.1")
    })
    if (free) {
      return candidate
    }
  }
  return null
}

function resolveBackendRoot() {
  if (isDev) {
    // Repository layout: <root>/tingyun sipping tool/electron/main.js and <root>/backend.
    const devBackend = path.resolve(__dirname, "../../backend")
    return fs.existsSync(devBackend) ? devBackend : null
  }
  const packagedBackend = path.join(process.resourcesPath, "backend")
  return fs.existsSync(packagedBackend) ? packagedBackend : null
}

async function ensureBackendServer() {
  let port = Number(process.env.FASTAPI_PORT || 8014)
  let baseUrl = `http://127.0.0.1:${port}`
  backendBaseUrl = baseUrl
  backendLastError = null

  if (await isBackendHealthy(baseUrl)) {
    writeLog("info", "Backend already healthy", { baseUrl })
    return baseUrl
  }

  if (isPortInUse(port)) {
    const killed = terminatePortListeners(port)
    if (killed > 0) {
      writeLog("warn", "Terminated existing process(es) on backend port", { port, killed })
      await sleep(1200)
    }
  }

  if (isPortInUse(port) && !(await isBackendHealthy(baseUrl))) {
    const fallbackPort = await findAvailablePort(port + 1)
    if (fallbackPort) {
      writeLog("warn", "Primary backend port unavailable, switching to fallback port", {
        fromPort: port,
        toPort: fallbackPort,
      })
      port = fallbackPort
      baseUrl = `http://127.0.0.1:${port}`
      backendBaseUrl = baseUrl
    }
  }

  const backendRoot = resolveBackendRoot()
  if (!backendRoot) {
    const msg = "Backend directory not found. OCR model routes will be unavailable."
    backendLastError = msg
    writeLog("error", msg, { isDev, resourcesPath: process.resourcesPath })
    console.warn(msg)
    return null
  }
  writeLog("info", "Attempting backend startup", { backendRoot, baseUrl, isDev })

  const pythonCandidates = [
    process.env.PYTHON_PATH ? { cmd: process.env.PYTHON_PATH, prefixArgs: [] } : null,
    { cmd: "/opt/homebrew/bin/python3", prefixArgs: [] },
    { cmd: "/usr/local/bin/python3", prefixArgs: [] },
    { cmd: "/usr/bin/arch", prefixArgs: ["-arm64", "/usr/bin/python3"] },
    { cmd: "/usr/bin/python3", prefixArgs: [] },
    { cmd: "python3", prefixArgs: [] },
  ].filter(Boolean)

  for (const candidate of pythonCandidates) {
    try {
      const probeArgs = [...(candidate.prefixArgs || []), "-c", "import fastapi,uvicorn,pydantic; print('ok')"]
      const probe = spawnSync(candidate.cmd, probeArgs, {
        cwd: backendRoot,
        env: {
          ...process.env,
          PATH: `/Users/ritviksharma/Library/Python/3.9/bin:${process.env.PATH || ""}`,
        },
        encoding: "utf8",
        timeout: 3000,
      })
      if (probe.status !== 0) {
        const reason = (probe.stderr || probe.stdout || "dependency probe failed").trim().slice(0, 500)
        writeLog("warn", "Skipping python candidate; required backend deps unavailable", {
          cmd: candidate.cmd,
          reason,
        })
        continue
      }

      const backendArgs = [
        ...(candidate.prefixArgs || []),
        "-m",
        "uvicorn",
        "backend.app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--app-dir",
        path.dirname(backendRoot),
      ]
      backendProcess = spawn(
        candidate.cmd,
        backendArgs,
        {
          cwd: backendRoot,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            PYTHONWARNINGS: process.env.PYTHONWARNINGS || "ignore:urllib3 v2 only supports OpenSSL 1.1.1+",
            PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK || "True",
            PATH: `/Users/ritviksharma/Library/Python/3.9/bin:${process.env.PATH || ""}`,
          },
        },
      )

      backendProcess.stdout.on("data", (chunk) => {
        const text = chunk.toString()
        writeLog("info", "backend stdout", { cmd: candidate.cmd, line: text.trim().slice(0, 500) })
        process.stdout.write(`[backend] ${chunk}`)
      })
      backendProcess.stderr.on("data", (chunk) => {
        const line = stripAnsi(chunk.toString()).trim()
        const lowered = line.toLowerCase()
        const isErrorLike =
          /(traceback|exception|fatal|cannot|unable|failed|error:)/i.test(line) &&
          !/model files already exist/i.test(line)
        const isWarnLike = /\bwarning\b|\bwarn\b/i.test(line)
        const level = isErrorLike ? "error" : isWarnLike ? "warn" : "info"

        if (isErrorLike || isWarnLike) {
          backendLastError = line.slice(0, 500)
        }
        writeLog(level, "backend stderr", { cmd: candidate.cmd, line: line.slice(0, 500) })
        process.stderr.write(`[backend] ${chunk}`)
      })
      backendProcess.on("exit", (code) => {
        writeLog("warn", "Backend process exited", { code, cmd: candidate.cmd })
      })

      const deadline = Date.now() + 30000
      while (Date.now() < deadline) {
        if (await isBackendHealthy(baseUrl)) {
          writeLog("info", "Backend started successfully", { baseUrl, cmd: candidate.cmd })
          return baseUrl
        }
        await sleep(500)
      }

      backendLastError = backendLastError || `Timed out waiting for backend at ${baseUrl}`
      writeLog("error", "Backend startup timed out for candidate", { cmd: candidate.cmd, baseUrl })
      backendProcess.kill("SIGTERM")
      backendProcess = null
    } catch (error) {
      backendLastError = error instanceof Error ? error.message : String(error)
      writeLog("error", "Failed to launch backend candidate", {
        cmd: candidate.cmd,
        error: backendLastError,
      })
      console.error(`Failed to launch backend with ${candidate.cmd}:`, error)
      if (backendProcess) {
        backendProcess.kill("SIGTERM")
        backendProcess = null
      }
    }
  }

  const msg = "Unable to start backend automatically. OCR model routes will fail until backend is running."
  writeLog("error", msg, { baseUrl, backendLastError })
  console.warn(msg)
  return null
}

function kickOffBackendStartup() {
  if (backendStartupPromise) {
    return backendStartupPromise
  }

  // Set an immediate default so renderer/API routes do not point to 8000 while startup is in flight.
  const port = Number(process.env.FASTAPI_PORT || 8014)
  process.env.FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || `http://127.0.0.1:${port}`

  backendStartupPromise = ensureBackendServer()
    .then((url) => {
      if (url) {
        process.env.FASTAPI_BASE_URL = url
      }
      return url
    })
    .catch((error) => {
      writeLog("error", "Background backend startup failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    })

  return backendStartupPromise
}

async function ensureEmbeddedNextServer() {
  if (embeddedNextUrl) {
    return embeddedNextUrl
  }

  const next = require("next")
  const appDir = path.join(__dirname, "..")
  const nextApp = next({ dev: false, dir: appDir })
  const handle = nextApp.getRequestHandler()

  await nextApp.prepare()

  embeddedNextServer = http.createServer((req, res) => handle(req, res))

  await new Promise((resolve, reject) => {
    embeddedNextServer.once("error", reject)
    embeddedNextServer.listen(0, "127.0.0.1", resolve)
  })

  const address = embeddedNextServer.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine embedded Next.js server port")
  }

  embeddedNextUrl = `http://127.0.0.1:${address.port}`
  return embeddedNextUrl
}

async function createWindow() {
  void kickOffBackendStartup()
  writeLog("info", "Creating application window", { backendUrl: process.env.FASTAPI_BASE_URL || null })

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: Math.min(1200, width),
    height: Math.min(800, height),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, "../public/tingyun-logo.png"),
    frame: false, // Frameless window for custom title bar
  })

  // Load the app URL in priority order:
  // 1) explicit ELECTRON_START_URL (dev/e2e),
  // 2) packaged static export if present,
  // 3) packaged embedded Next.js runtime server.
  const packagedIndexPath = path.join(__dirname, "../out/index.html")
  let startUrl = process.env.ELECTRON_START_URL

  if (!startUrl && !isDev) {
    if (fs.existsSync(packagedIndexPath)) {
      startUrl = `file://${packagedIndexPath}`
    } else {
      startUrl = await ensureEmbeddedNextServer()
    }
  }

  if (!startUrl) {
    startUrl = "http://localhost:3000"
  }
  writeLog("info", "Loading renderer URL", { startUrl, isDev })

  mainWindow.loadURL(startUrl)

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    writeLog("error", "Renderer failed to load URL", {
      errorCode,
      errorDescription,
      validatedURL,
    })
  })

  // Open DevTools in development mode
  if (isDev && process.env.ELECTRON_DISABLE_DEVTOOLS !== "1") {
    mainWindow.webContents.openDevTools()
  }

  // Window management
  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

// Create window when Electron is ready
app.whenReady().then(() => {
  process.env.DESKTOP_APP_LOG_PATH = getLogPath()
  writeLog("info", "Electron app ready", { version: app.getVersion() })
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] })
      callback({ video: sources[0], audio: false })
    },
    { useSystemPicker: true },
  )

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  writeLog("info", "All windows closed")
  if (embeddedNextServer) {
    embeddedNextServer.close()
    embeddedNextServer = null
    embeddedNextUrl = null
  }
  if (backendProcess) {
    backendProcess.kill("SIGTERM")
    backendProcess = null
  }
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  writeLog("info", "App quitting")
})

// IPC handlers for window controls
ipcMain.on("minimize-window", () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on("maximize-window", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.on("close-window", () => {
  if (mainWindow) mainWindow.close()
})

ipcMain.on("renderer-log", (_event, payload) => {
  const level = payload?.level || "info"
  const message = payload?.message || ""
  const meta = payload?.meta || {}
  writeLog(level, `renderer: ${message}`, meta)
})

ipcMain.handle("get-diagnostics", async () => {
  const logPath = getLogPath()
  let recentLogs = []
  try {
    if (fs.existsSync(logPath)) {
      const lines = fs
        .readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
      recentLogs = lines.slice(-120)
    }
  } catch (error) {
    writeLog("error", "Failed reading diagnostics logs", { error: String(error) })
  }
  return {
    backendBaseUrl,
    backendHealthy: backendBaseUrl ? await isBackendHealthy(backendBaseUrl) : false,
    backendLastError,
    logPath,
    recentLogs,
  }
})

ipcMain.handle("open-log-directory", () => {
  const logDir = ensureLogDir()
  return shell.openPath(logDir)
})

// File system operations
ipcMain.handle("open-file-dialog", async (event, options) => {
  const forcedFilePath = process.env.E2E_OPEN_FILE_PATH
  if (forcedFilePath && fs.existsSync(forcedFilePath)) {
    const fileName = path.basename(forcedFilePath)
    const fileData = fs.readFileSync(forcedFilePath)
    return {
      path: forcedFilePath,
      name: fileName,
      data: fileData.toString("base64"),
    }
  }

  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    ...options,
  })

  if (filePaths && filePaths.length > 0) {
    const filePath = filePaths[0]
    const fileName = path.basename(filePath)
    const fileData = fs.readFileSync(filePath)

    return {
      path: filePath,
      name: fileName,
      data: fileData.toString("base64"),
    }
  }

  return null
})

ipcMain.handle("save-file", async (event, { content, defaultPath, filters }) => {
  const forcedSaveDir = process.env.E2E_SAVE_DIR
  if (forcedSaveDir) {
    fs.mkdirSync(forcedSaveDir, { recursive: true })
    const targetPath = path.join(forcedSaveDir, defaultPath || "output.txt")
    fs.writeFileSync(targetPath, content)
    return true
  }

  const forcedSavePath = process.env.E2E_SAVE_FILE_PATH
  if (forcedSavePath) {
    fs.writeFileSync(forcedSavePath, content)
    return true
  }

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters,
  })

  if (filePath) {
    fs.writeFileSync(filePath, content)
    return true
  }

  return false
})

// Screen capture functionality
ipcMain.handle("get-screen-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
    })

    const mapped = sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }))
    writeLog("info", "Fetched screen sources", { count: mapped.length })
    return mapped
  } catch (error) {
    writeLog("error", "get-screen-sources failed", { error: String(error) })
    console.error("get-screen-sources failed:", error)
    return []
  }
})

ipcMain.handle("get-screen-access-status", () => {
  if (process.platform !== "darwin") {
    return "granted"
  }
  try {
    return systemPreferences.getMediaAccessStatus("screen")
  } catch (_) {
    return "unknown"
  }
})

ipcMain.handle("open-screen-permission-settings", async () => {
  if (process.platform !== "darwin") {
    return false
  }
  return shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
})

ipcMain.handle("capture-screen", async (event, sourceId) => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 1920, height: 1080 },
    })
    const selectedSource = sources.find((source) => source.id === sourceId)
    return selectedSource ? selectedSource.thumbnail.toDataURL() : null
  } catch (error) {
    writeLog("error", "capture-screen failed", { sourceId, error: String(error) })
    throw error
  }
})

ipcMain.handle("capture-screen-area", async (event, bounds) => {
  try {
    const { x, y, width, height } = bounds
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: width * 2, height: height * 2 }, // Higher resolution for better quality
    })

    if (sources.length === 0) return null

    // Crop directly from nativeImage in main process.
    const screenshot = sources[0].thumbnail
    const cropped = screenshot.crop({
      x: Math.max(0, Math.floor(x * 2)),
      y: Math.max(0, Math.floor(y * 2)),
      width: Math.max(1, Math.floor(width * 2)),
      height: Math.max(1, Math.floor(height * 2)),
    })
    return cropped.toDataURL()
  } catch (error) {
    writeLog("error", "capture-screen-area failed", { bounds, error: String(error) })
    throw error
  }
})
