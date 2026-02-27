export interface IElectronAPI {
  fileSystem: {
    openFile: () => Promise<{ name: string; path: string; data: string }>;
    saveFile: (options: { content: string; defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<boolean>;
  };
  windowControls: {
    minimize: () => void;
    maximize: () => void;
    restore: () => void;
    close: () => void;
  };
  screenCapture: {
    getSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
    getPermissionStatus: () => Promise<string>;
    openPermissionSettings: () => Promise<boolean>;
    captureScreen: (sourceId: string) => Promise<string>;
    captureScreenArea: (bounds: { x: number; y: number; width: number; height: number }) => Promise<string>;
    captureWithSystemTool: () => Promise<string | null>;
  };
  diagnostics: {
    get: () => Promise<{
      backendBaseUrl: string | null;
      backendHealthy: boolean;
      backendLastError: string | null;
      logPath: string;
      recentLogs: string[];
    }>;
    ensureBackendReady: () => Promise<{
      ok: boolean;
      backendBaseUrl: string | null;
      backendLastError: string | null;
    }>;
    writeDebugCapture: (payload: {
      prefix?: string;
      imageBase64?: string;
      pdfBase64?: string;
    }) => Promise<{
      ok: boolean;
      imagePath?: string | null;
      pdfPath?: string | null;
      error?: string;
    }>;
    openLogDirectory: () => Promise<string>;
  };
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
  system: {
    getPlatform: () => Promise<string>;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
