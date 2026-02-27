const { contextBridge, ipcRenderer } = require("electron")

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  // File operations
  fileSystem: {
    openFile: () => ipcRenderer.invoke("open-file-dialog"),
    saveFile: (options) => ipcRenderer.invoke("save-file", options),
  },

  // Window controls
  windowControls: {
    minimize: () => ipcRenderer.send("minimize-window"),
    maximize: () => ipcRenderer.send("maximize-window"),
    close: () => ipcRenderer.send("close-window"),
  },

  // Screen capture
  screenCapture: {
    getSources: () => ipcRenderer.invoke("get-screen-sources"),
    getPermissionStatus: () => ipcRenderer.invoke("get-screen-access-status"),
    openPermissionSettings: () => ipcRenderer.invoke("open-screen-permission-settings"),
    captureScreen: (sourceId) => ipcRenderer.invoke("capture-screen", sourceId),
    captureScreenArea: (bounds) => ipcRenderer.invoke("capture-screen-area", bounds),
    captureWithSystemTool: () => ipcRenderer.invoke("capture-screen-system"),
  },

  diagnostics: {
    get: () => ipcRenderer.invoke("get-diagnostics"),
    openLogDirectory: () => ipcRenderer.invoke("open-log-directory"),
  },

  logger: {
    info: (message, meta = {}) => ipcRenderer.send("renderer-log", { level: "info", message, meta }),
    warn: (message, meta = {}) => ipcRenderer.send("renderer-log", { level: "warn", message, meta }),
    error: (message, meta = {}) => ipcRenderer.send("renderer-log", { level: "error", message, meta }),
  },
})
