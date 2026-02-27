export interface IElectronAPI {
  fileSystem: {
    openFile: () => Promise<{ name: string; path: string; data: string }>;
    saveFile: (options: { content: string; defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<boolean>;
  };
  windowControls: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  screenCapture: {
    getSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
    getPermissionStatus: () => Promise<string>;
    openPermissionSettings: () => Promise<boolean>;
    captureScreen: (sourceId: string) => Promise<string>;
    captureScreenArea: (bounds: { x: number; y: number; width: number; height: number }) => Promise<string>;
  };
  diagnostics: {
    get: () => Promise<{
      backendBaseUrl: string | null;
      backendHealthy: boolean;
      backendLastError: string | null;
      logPath: string;
      recentLogs: string[];
    }>;
    openLogDirectory: () => Promise<string>;
  };
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
