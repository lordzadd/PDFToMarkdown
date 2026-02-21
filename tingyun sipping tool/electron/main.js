const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, screen } = require("electron")
const path = require("path")
const fs = require("fs")
const isDev = !app.isPackaged

// Keep a global reference of the window object to prevent garbage collection
let mainWindow

function createWindow() {
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

  // Load the Next.js app. Prefer static export when present, otherwise use a running local server.
  const packagedIndexPath = path.join(__dirname, "../out/index.html")
  const startUrl = !isDev && fs.existsSync(packagedIndexPath)
    ? `file://${packagedIndexPath}`
    : (process.env.ELECTRON_START_URL || "http://localhost:3000")

  mainWindow.loadURL(startUrl)

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
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
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
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
  })

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }))
})

ipcMain.handle("capture-screen", async (event, sourceId) => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 1920, height: 1080 },
  })
  const selectedSource = sources.find((source) => source.id === sourceId)
  return selectedSource ? selectedSource.thumbnail.toDataURL() : null
})

ipcMain.handle("capture-screen-area", async (event, bounds) => {
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
})
