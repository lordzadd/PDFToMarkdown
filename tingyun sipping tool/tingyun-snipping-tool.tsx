"use client"

import React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Square,
  Move,
  Pencil,
  FileText,
  FileDown,
  Trash2,
  Settings,
  Minus,
  SquareIcon,
  X,
  ChevronLeft,
  Grid,
  Undo,
  Redo,
  PenTool,
  Upload,
  Download,
  Check,
  AlertCircle,
  Loader2,
  History,
  Layers,
  Monitor,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Tabs as TabsComponent,
  TabsContent,
  TabsList as TabsListComponent,
  TabsTrigger as TabsTriggerComponent,
} from "@/components/ui/tabs"
import Image from "next/image"
import { PDFDocument } from "pdf-lib"

// Define the available models
const PDF_MODELS = [
  {
    id: "doctr-eu",
    name: "docTR (Europe)",
    description: "Mindee docTR local OCR model with layout-aware text extraction",
    strengths: ["General documents", "Context understanding", "Natural language"],
    processingTime: "Slow",
  },
  {
    id: "layoutlm",
    name: "LayoutLM",
    description: "Microsoft's document understanding model",
    strengths: ["Document layout", "Tables", "Forms"],
    processingTime: "Fast",
  },
  {
    id: "markitdown",
    name: "MarkItDown (Microsoft)",
    description: "Microsoft MarkItDown document-to-markdown converter",
    strengths: ["Robust markdown output", "Broad document support", "Good structure extraction"],
    processingTime: "Very Fast",
  },
  {
    id: "docling",
    name: "Docling",
    description: "Specialized model for document linguistics and segmentation",
    strengths: ["Multilingual support", "Document segmentation", "Linguistic analysis", "OCR enhancement"],
    processingTime: "Medium",
  },
  {
    id: "zerox",
    name: "ZeroX (OmniAI)",
    description: "OmniAI ZeroX OCR adapter with LLM-assisted extraction",
    strengths: ["Complex layouts", "LLM-assisted parsing", "OCR fallback"],
    processingTime: "Slow",
  },
]

// Model-specific processing settings
const MODEL_SETTINGS = {
  "doctr-eu": {
    defaultQuality: 90,
    supportsEquations: true,
    supportsTableDetection: true,
    supportsSegmentation: true,
    processingSteps: [
      "Image analysis",
      "Content extraction",
      "Context understanding",
      "Semantic segmentation",
      "Markdown generation",
      "Post-processing",
    ],
  },
  layoutlm: {
    defaultQuality: 75,
    supportsEquations: false,
    supportsTableDetection: true,
    supportsSegmentation: true,
    processingSteps: ["Layout analysis", "Text extraction", "Structure detection", "Markdown formatting"],
  },
  markitdown: {
    defaultQuality: 70,
    supportsEquations: false,
    supportsTableDetection: false,
    supportsSegmentation: false,
    processingSteps: ["Document parsing", "Markdown extraction", "Post-processing"],
  },
  docling: {
    defaultQuality: 85,
    supportsEquations: true,
    supportsTableDetection: true,
    supportsSegmentation: true,
    processingSteps: [
      "Document segmentation",
      "Linguistic analysis",
      "OCR with segmentation",
      "Structure recognition",
      "Multilingual processing",
      "Markdown generation",
    ],
  },
  zerox: {
    defaultQuality: 80,
    supportsEquations: true,
    supportsTableDetection: true,
    supportsSegmentation: false,
    processingSteps: ["PDF analysis", "OCR/LLM extraction", "Markdown generation"],
  },
}

// Sample previous uploads for demonstration
const SAMPLE_PREVIOUS_UPLOADS = [
  { id: 1, name: "research-paper.pdf", date: "2025-03-18", type: "pdf" },
  { id: 2, name: "math-formulas.png", date: "2025-03-17", type: "image" },
  { id: 3, name: "lecture-notes.pdf", date: "2025-03-15", type: "pdf" },
  { id: 4, name: "handwritten-equations.jpg", date: "2025-03-12", type: "image" },
]

interface UploadHistory {
  id: number
  name: string
  date: string
  type: string
  content?: string | File
  path?: string
}

interface SegmentationOptions {
  enableTextSegmentation: boolean
  enableLayoutSegmentation: boolean
  enableTableSegmentation: boolean
  enableImageSegmentation: boolean
  segmentationLevel: "basic" | "advanced" | "expert"
}

interface ExecutionMeta {
  requested_model: string
  engine_used: string
  provider_used: string
  fallback_used: boolean
  note?: string | null
}

interface ElectronDiagnostics {
  backendBaseUrl: string | null
  backendHealthy: boolean
  backendLastError: string | null
  logPath: string
  recentLogs: string[]
}

type PageLimitOption = "full" | "1" | "2" | "5" | "10" | "20"

const TingyunSnippingTool = () => {
  const [isElectron, setIsElectron] = useState(false)
  const [activeTab, setActiveTab] = useState("latex")
  const [isHandwritingMode, setIsHandwritingMode] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState("docling")
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfFilePath, setPdfFilePath] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [conversionProgress, setConversionProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")
  const [markdownResult, setMarkdownResult] = useState("")
  const [latexResult, setLatexResult] = useState("")
  const [showResult, setShowResult] = useState(false)
  const [qualityLevel, setQualityLevel] = useState(
    MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].defaultQuality,
  )
  const [preserveTables, setPreserveTables] = useState(true)
  const [preserveEquations, setPreserveEquations] = useState(true)
  const [pageLimit, setPageLimit] = useState<PageLimitOption>("full")
  const [segmentationOptions, setSegmentationOptions] = useState<SegmentationOptions>({
    enableTextSegmentation: true,
    enableLayoutSegmentation: true,
    enableTableSegmentation: true,
    enableImageSegmentation: false,
    segmentationLevel: "advanced",
  })
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)
  const [isModelInfoOpen, setIsModelInfoOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>(SAMPLE_PREVIOUS_UPLOADS)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isScreenSnippingMode, setIsScreenSnippingMode] = useState(false)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedArea, setSelectedArea] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvasHistory, setCanvasHistory] = useState<ImageData[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showGrid, setShowGrid] = useState(false)
  const [isPenActive, setIsPenActive] = useState(true)
  const [penColor, setPenColor] = useState("#000000")
  const [penSize, setPenSize] = useState(2)
  const [documentSegments, setDocumentSegments] = useState<any[]>([])
  const [activeSegment, setActiveSegment] = useState<number | null>(null)
  const [executionMeta, setExecutionMeta] = useState<ExecutionMeta | null>(null)
  const [isScreenSourcesDialogOpen, setIsScreenSourcesDialogOpen] = useState(false)
  const [screenSources, setScreenSources] = useState<any[]>([])
  const [selectedScreenSource, setSelectedScreenSource] = useState<string | null>(null)
  const [screenAccessStatus, setScreenAccessStatus] = useState<string>("unknown")
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [conversionErrorDetails, setConversionErrorDetails] = useState<string | null>(null)
  const [lastDiagnostics, setLastDiagnostics] = useState<ElectronDiagnostics | null>(null)
  const [isHandwritingConverting, setIsHandwritingConverting] = useState(false)

  // Update quality level when model changes
  useEffect(() => {
    setQualityLevel(MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].defaultQuality)
  }, [selectedModel])

  useEffect(() => {
    setIsElectron(typeof window !== "undefined" && window.electron !== undefined)
  }, [])

  useEffect(() => {
    if (!isElectron || !window.electron?.diagnostics?.get) return
    window.electron.diagnostics.get().then((diagnostics) => {
      setLastDiagnostics(diagnostics)
      window.electron?.logger?.info("Loaded startup diagnostics", {
        backendBaseUrl: diagnostics.backendBaseUrl,
        backendHealthy: diagnostics.backendHealthy,
        logPath: diagnostics.logPath,
      })
    })
  }, [isElectron])

  const logInfo = (message: string, meta: Record<string, unknown> = {}) => {
    if (isElectron && window.electron?.logger?.info) {
      window.electron.logger.info(message, meta)
    } else {
      console.info(message, meta)
    }
  }

  const logError = (message: string, meta: Record<string, unknown> = {}) => {
    if (isElectron && window.electron?.logger?.error) {
      window.electron.logger.error(message, meta)
    } else {
      console.error(message, meta)
    }
  }

  const resetConversionFeedback = () => {
    setConversionError(null)
    setConversionErrorDetails(null)
  }

  const resetLoadedDocumentState = () => {
    setShowResult(false)
    resetConversionFeedback()
    setMarkdownResult("")
    setLatexResult("")
    setDocumentSegments([])
    setActiveSegment(null)
  }

  const convertImageFileToPdfFile = async (imageFile: File, outputName: string): Promise<File> => {
    const imageBytes = await imageFile.arrayBuffer()
    const pdf = await PDFDocument.create()
    const mime = (imageFile.type || "").toLowerCase()

    let embeddedImage
    if (mime.includes("png")) {
      embeddedImage = await pdf.embedPng(imageBytes)
    } else if (mime.includes("jpg") || mime.includes("jpeg")) {
      embeddedImage = await pdf.embedJpg(imageBytes)
    } else {
      throw new Error(`Unsupported screenshot format: ${imageFile.type || "unknown"}`)
    }

    const page = pdf.addPage([embeddedImage.width, embeddedImage.height])
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    })

    const pdfBytes = await pdf.save()
    return new File([pdfBytes], outputName, { type: "application/pdf" })
  }

  const setActivePdfInput = (file: File, path: string | null = null) => {
    setPdfFile(file)
    setPdfFilePath(path)
    resetLoadedDocumentState()
  }

  // Initialize canvas when handwriting mode is activated
  useEffect(() => {
    if (isHandwritingMode && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Save initial state
        const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height)
        setCanvasHistory([initialState])
        setHistoryIndex(0)
      }
    }
  }, [isHandwritingMode])

  // Draw grid on canvas if enabled
  useEffect(() => {
    if (isHandwritingMode && canvasRef.current && showGrid) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (ctx) {
        // Save current canvas state
        const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Draw grid
        ctx.strokeStyle = "#e5e7eb"
        ctx.lineWidth = 1

        // Draw horizontal lines
        for (let y = 20; y < canvas.height; y += 20) {
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(canvas.width, y)
          ctx.stroke()
        }

        // Draw vertical lines
        for (let x = 20; x < canvas.width; x += 20) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, canvas.height)
          ctx.stroke()
        }

        // Restore canvas state when grid is toggled off
        return () => {
          if (ctx && !showGrid) {
            ctx.putImageData(currentState, 0, 0)
          }
        }
      }
    }
  }, [showGrid, isHandwritingMode])

  const handlePenClick = () => {
    setIsHandwritingMode(true)
  }

  const handleBackClick = () => {
    setIsHandwritingMode(false)
  }

  const handleSettingsClick = () => {
    setIsSettingsOpen(true)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type === "application/pdf") {
        setActivePdfInput(file)
        logInfo("Loaded PDF from browser file input", { fileName: file.name, size: file.size })

        // Add to history
        const newUpload: UploadHistory = {
          id: Date.now(),
          name: file.name,
          date: new Date().toISOString().split("T")[0],
          type: "pdf",
          content: file,
        }

        setUploadHistory((prev) => [newUpload, ...prev])
      } else {
        alert("Please upload a PDF file")
      }
    }

    // Allow selecting the same file path again to retrigger conversion.
    e.target.value = ""
  }

  const handleElectronFileOpen = async () => {
    if (!isElectron) return

    try {
      const result = await window.electron.fileSystem.openFile()
      if (result) {
        // Convert base64 to File object
        const { name, path, data } = result
        const bytes = atob(data)
        const buffer = new ArrayBuffer(bytes.length)
        const array = new Uint8Array(buffer)

        for (let i = 0; i < bytes.length; i++) {
          array[i] = bytes.charCodeAt(i)
        }

        const file = new File([buffer], name, { type: "application/pdf" })

        setActivePdfInput(file, path)
        logInfo("Opened PDF in Electron", { path, name })

        // Add to history
        const newUpload: UploadHistory = {
          id: Date.now(),
          name: name,
          date: new Date().toISOString().split("T")[0],
          type: "pdf",
          content: file,
          path: path,
        }

        setUploadHistory((prev) => [newUpload, ...prev])
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown file open error"
      logError("Error opening file", { message })
      alert(`Error opening file: ${message}`)
    }
  }

  const handleFileClick = () => {
    if (isElectron) {
      handleElectronFileOpen()
    } else if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleHistoryClick = () => {
    setIsSettingsOpen(false)
    setIsModelInfoOpen(false)
    setIsScreenSourcesDialogOpen(false)
    requestAnimationFrame(() => setIsHistoryOpen(true))
  }

  const handleHistoryItemClick = async (item: UploadHistory) => {
    if (item.type === "pdf" && item.content instanceof File) {
      setActivePdfInput(item.content, item.path || null)
    } else if (item.type === "pdf") {
      // For sample data without actual file content
      alert(`This would load ${item.name} (sample data)`)
    } else if (item.type === "image" && item.content instanceof File) {
      try {
        const stem = item.name.replace(/\.[^.]+$/, "") || "screenshot"
        const pdfFromImage = await convertImageFileToPdfFile(item.content, `${stem}.pdf`)
        setActivePdfInput(pdfFromImage, item.path || null)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown image load error"
        logError("Failed to load image history item for OCR", { message, itemName: item.name })
        alert(`Unable to load screenshot for OCR: ${message}`)
      }
    }
    setIsHistoryOpen(false)
  }

  const handleScreenSnip = async () => {
    if (isElectron) {
      // Default to native capture in desktop mode to avoid repeated macOS TCC prompts
      // that can occur with desktop source enumeration in unsigned/ad-hoc builds.
      await handleSystemScreenCapture()
    } else {
      setIsScreenSnippingMode(true)
      setIsSelectionMode(false)
      alert("Screen snipping mode activated. Click and drag to select an area of the screen.")
    }
  }

  const handleOpenScreenPermissionSettings = async () => {
    if (!isElectron) return
    await window.electron.screenCapture.openPermissionSettings()
  }

  const addCapturedImageToHistory = async (imageData: string, name = "Screenshot") => {
    const response = await fetch(imageData)
    const blob = await response.blob()
    const safeStem = name.toLowerCase().replace(/\s+/g, "-")
    const imageFile = new File([blob], `${safeStem}.png`, { type: "image/png" })
    const newUpload: UploadHistory = {
      id: Date.now(),
      name,
      date: new Date().toISOString().split("T")[0],
      type: "image",
      content: imageFile,
    }
    setUploadHistory((prev) => [newUpload, ...prev])

    const pdfFileFromImage = await convertImageFileToPdfFile(imageFile, `${safeStem}.pdf`)
    setActivePdfInput(pdfFileFromImage)
    logInfo("Loaded captured screenshot as active PDF input", {
      imageName: imageFile.name,
      pdfName: pdfFileFromImage.name,
      imageBytes: imageFile.size,
      pdfBytes: pdfFileFromImage.size,
    })

    await runConversionForFile(pdfFileFromImage, { autoSource: "screenshot-capture", modelId: "ocr-only" })
  }

  const handleSystemScreenCapture = async () => {
    if (isElectron) {
      if (window.electron?.screenCapture?.captureWithSystemTool) {
        try {
          const imageData = await window.electron.screenCapture.captureWithSystemTool()
          if (!imageData) {
            return
          }
          setIsScreenSourcesDialogOpen(false)
          await addCapturedImageToHistory(imageData, "Screenshot")
          logInfo("Captured screenshot via macOS screencapture fallback")
          return
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown native capture error"
          logError("Native screenshot capture failed", { message })
          alert(`Native screenshot capture failed: ${message}. Please verify Screen Recording permissions and retry.`)
          return
        }
      }
      alert("Native screenshot tool is unavailable in this runtime.")
      return
    }

    let systemPickerError: string | null = null
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      })
      const videoTrack = mediaStream.getVideoTracks()[0]
      if (!videoTrack) {
        return
      }

      const video = document.createElement("video")
      video.srcObject = mediaStream
      await video.play()

      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        videoTrack.stop()
        return
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = canvas.toDataURL("image/png")
      videoTrack.stop()
      setIsScreenSourcesDialogOpen(false)
      await addCapturedImageToHistory(imageData, "Screenshot")
      alert("Screenshot captured successfully.")
      logInfo("Captured screenshot via system picker (getDisplayMedia)", { width: canvas.width, height: canvas.height })
    } catch (error) {
      systemPickerError = error instanceof Error ? error.message : "Unknown display capture error"
      logInfo("System picker capture failed; trying native fallback", { systemPickerError })
    }

    if (isElectron && window.electron?.screenCapture?.captureWithSystemTool) {
      try {
        const imageData = await window.electron.screenCapture.captureWithSystemTool()
        if (!imageData) {
          return
        }
        setIsScreenSourcesDialogOpen(false)
        await addCapturedImageToHistory(imageData, "Screenshot")
        logInfo("Captured screenshot via macOS screencapture fallback")
        return
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Unknown native capture error"
        logError("Native screenshot fallback failed", { fallbackMessage, systemPickerError })
        alert(
          `System screen capture failed: ${fallbackMessage}.` +
            (systemPickerError ? ` System picker error: ${systemPickerError}.` : "") +
            " Please verify Screen Recording permissions and retry.",
        )
        return
      }
    }

    if (systemPickerError) {
      alert(`System screen capture failed: ${systemPickerError}. Please allow screen sharing permissions and try again.`)
    }
  }

  const handleScreenSourceSelect = async (sourceId: string) => {
    setSelectedScreenSource(sourceId)
    setIsScreenSourcesDialogOpen(false)

    try {
      const imageData = await window.electron.screenCapture.captureScreen(sourceId)
      if (imageData) {
        await addCapturedImageToHistory(imageData, "Screenshot")
        logInfo("Captured screenshot from source", { sourceId })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown capture error"
      logError("Error capturing selected screen", { sourceId, message })
      alert(`Error capturing selected screen: ${message}`)
    }
  }

  const handleSelectionTool = () => {
    setIsSelectionMode(true)
    setIsScreenSnippingMode(false)
    alert("Selection mode activated. Click and drag to select content.")
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isScreenSnippingMode || isSelectionMode) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setStartPoint({ x, y })
      setIsDrawing(true)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((isScreenSnippingMode || isSelectionMode) && isDrawing) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      setSelectedArea({
        x: Math.min(startPoint.x, x),
        y: Math.min(startPoint.y, y),
        width: Math.abs(x - startPoint.x),
        height: Math.abs(y - startPoint.y),
      })
    }
  }

  const handleMouseUp = async () => {
    if ((isScreenSnippingMode || isSelectionMode) && isDrawing) {
      setIsDrawing(false)

      if (isScreenSnippingMode && isElectron) {
        try {
          const imageData = await window.electron.screenCapture.captureScreenArea(selectedArea)
          if (imageData) {
            await addCapturedImageToHistory(imageData, "Screen Area")
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown capture area error"
          logError("Error capturing screen area", { message, selectedArea })
          alert(`Error capturing screen area: ${message}`)
        }
      }
      setIsScreenSnippingMode(false)
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPenActive) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.strokeStyle = penColor
      ctx.lineWidth = penSize
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      setIsDrawing(true)
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPenActive || !isDrawing) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  const handleCanvasMouseUp = () => {
    if (!isPenActive || !isDrawing) return

    setIsDrawing(false)

    // Save canvas state for undo/redo
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext("2d")
      if (ctx) {
        const newState = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Remove any redo states
        const newHistory = canvasHistory.slice(0, historyIndex + 1)

        setCanvasHistory([...newHistory, newState])
        setHistoryIndex(newHistory.length)
      }
    }
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext("2d")
        if (ctx) {
          const newIndex = historyIndex - 1
          ctx.putImageData(canvasHistory[newIndex], 0, 0)
          setHistoryIndex(newIndex)
        }
      }
    }
  }

  const handleRedo = () => {
    if (historyIndex < canvasHistory.length - 1) {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext("2d")
        if (ctx) {
          const newIndex = historyIndex + 1
          ctx.putImageData(canvasHistory[newIndex], 0, 0)
          setHistoryIndex(newIndex)
        }
      }
    }
  }

  const toggleGrid = () => {
    setShowGrid(!showGrid)
  }

  const togglePenTool = () => {
    setIsPenActive(true)
  }

  const handleClearCanvas = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "white"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Save cleared state
        const clearedState = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Remove any redo states
        const newHistory = canvasHistory.slice(0, historyIndex + 1)

        setCanvasHistory([...newHistory, clearedState])
        setHistoryIndex(newHistory.length)
      }
    }
  }

  const normalizeNoTextPlaceholders = (value: string): string =>
    value
      .replace(/\*No text detected on this page\.\*/gi, "")
      .replace(/\\textit\{No text detected on this page\.\}/gi, "")
      .trim()

  const buildPreprocessedHandwritingCanvas = (
    sourceCanvas: HTMLCanvasElement,
    sourceCtx: CanvasRenderingContext2D,
  ): HTMLCanvasElement | null => {
    const { width, height } = sourceCanvas
    const src = sourceCtx.getImageData(0, 0, width, height)
    const data = src.data

    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (r < 200 || g < 200 || b < 200) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX < 0 || maxY < 0) {
      return null
    }

    const pad = 18
    const sx = Math.max(0, minX - pad)
    const sy = Math.max(0, minY - pad)
    const sw = Math.min(width - sx, maxX - minX + pad * 2 + 1)
    const sh = Math.min(height - sy, maxY - minY + pad * 2 + 1)
    const scale = 3

    const out = document.createElement("canvas")
    out.width = Math.max(1, sw * scale)
    out.height = Math.max(1, sh * scale)
    const outCtx = out.getContext("2d")
    if (!outCtx) {
      return null
    }

    outCtx.fillStyle = "#ffffff"
    outCtx.fillRect(0, 0, out.width, out.height)
    outCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height)

    const outImg = outCtx.getImageData(0, 0, out.width, out.height)
    const outData = outImg.data
    for (let i = 0; i < outData.length; i += 4) {
      const r = outData[i]
      const g = outData[i + 1]
      const b = outData[i + 2]
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      const v = luma < 190 ? 0 : 255
      outData[i] = v
      outData[i + 1] = v
      outData[i + 2] = v
      outData[i + 3] = 255
    }
    outCtx.putImageData(outImg, 0, 0)
    return out
  }

  const handleScanHandwriting = async () => {
    resetConversionFeedback()
    const canvas = canvasRef.current
    if (!canvas) {
      alert("Canvas not available. Please try again.")
      return
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      alert("Could not get canvas context. Please try again.")
      return
    }

    setIsHandwritingConverting(true)
    setCurrentStep("Converting handwriting to OCR input")
    setConversionProgress(10)

    try {
      const preprocessedCanvas = buildPreprocessedHandwritingCanvas(canvas, ctx)
      if (!preprocessedCanvas) {
        throw new Error("No handwriting detected. Draw text with the pen tool and retry.")
      }

      const pngDataUrl = preprocessedCanvas.toDataURL("image/png")
      const pngBytes = Uint8Array.from(atob(pngDataUrl.split(",")[1]), (c) => c.charCodeAt(0))

      const pdfDoc = await PDFDocument.create()
      const pngImage = await pdfDoc.embedPng(pngBytes)
      const page = pdfDoc.addPage([pngImage.width, pngImage.height])
      page.drawImage(pngImage, { x: 0, y: 0, width: pngImage.width, height: pngImage.height })

      const pdfBytes = await pdfDoc.save()
      const handwritingPdf = new File([pdfBytes], "handwriting.pdf", { type: "application/pdf" })

      setCurrentStep("Running handwriting OCR")
      setConversionProgress(35)
      const markdown = await runModelConversion("ocr-only", handwritingPdf)
      const normalizedText = normalizeNoTextPlaceholders(markdown)
      if (!normalizedText) {
        throw new Error("No handwriting text recognized. Try larger/darker writing and scan again.")
      }
      setConversionProgress(100)
      setCurrentStep("Handwriting OCR completed")

      const normalized = normalizedText
      setIsHandwritingMode(false)
      setMarkdownResult(normalized)
      setLatexResult(convertMarkdownToLatex(normalized))
      setShowResult(true)

      setDocumentSegments([
        {
          id: 1,
          type: "equation",
          content: normalized,
          confidence: 0.9,
        },
      ])
      setActiveSegment(0)
      logInfo("Handwriting OCR completed", { outputLength: normalized.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown handwriting conversion error"
      const diagnostics = await fetchDiagnostics()
      setConversionError(`Handwriting OCR failed: ${message}`)
      setConversionErrorDetails(
        diagnostics
          ? `Backend URL: ${diagnostics.backendBaseUrl || "unknown"} | Healthy: ${diagnostics.backendHealthy ? "yes" : "no"} | Last backend error: ${diagnostics.backendLastError || "none"}`
          : null,
      )
      setLastDiagnostics(diagnostics)
      logError("Handwriting OCR failed", { message, diagnostics })
      alert(`Handwriting OCR failed: ${message}`)
    } finally {
      setIsHandwritingConverting(false)
    }
  }

  const buildCommonOptions = () => {
    const maxPages = pageLimit === "full" ? undefined : Number.parseInt(pageLimit, 10)
    return {
      qualityLevel,
      preserveTables,
      preserveEquations,
      segmentation: segmentationOptions,
      ...(maxPages ? { maxPages } : {}),
    }
  }

  const parseErrorText = async (response: Response): Promise<string> => {
    let payload: Record<string, unknown> | null = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const primary =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.detail === "string"
          ? payload.detail
          : `Request failed with status ${response.status}`
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null
    return `${primary}${requestId ? ` [requestId: ${requestId}]` : ""} (HTTP ${response.status})`
  }

  const fetchDiagnostics = async (): Promise<ElectronDiagnostics | null> => {
    if (!isElectron || !window.electron?.diagnostics?.get) {
      return null
    }
    try {
      return await window.electron.diagnostics.get()
    } catch {
      return null
    }
  }

  const runModelConversion = async (modelId: string, file: File) => {
    const commonOptions = buildCommonOptions()
    const model = PDF_MODELS.find((m) => m.id === modelId)
    const endpoint = `/api/convert/${encodeURIComponent(modelId)}`

    setCurrentStep(`Preparing ${model?.name || modelId} request`)
    setConversionProgress(8)
    await new Promise((resolve) => setTimeout(resolve, 120))

    const formData = new FormData()
    // Send canonical FastAPI field name; backend also accepts legacy `pdf` for compatibility.
    formData.append("file", file, file.name)
    formData.append("options", JSON.stringify(commonOptions))

    setCurrentStep("Uploading PDF to backend")
    setConversionProgress(18)
    const requestStartedAt = Date.now()
    let ticker: ReturnType<typeof setInterval> | null = null

    try {
      ticker = setInterval(() => {
        setConversionProgress((prev) => Math.min(prev + 2, 88))
        const elapsed = Math.floor((Date.now() - requestStartedAt) / 1000)
        setCurrentStep(`Running OCR on backend (${elapsed}s elapsed)`)
      }, 900)

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const details = await parseErrorText(response)
        throw new Error(details)
      }

      const data = await response.json()
      setCurrentStep("Post-processing OCR output")
      setConversionProgress(95)

      setDocumentSegments(Array.isArray(data.segments) ? data.segments : [])
      setActiveSegment(Array.isArray(data.segments) && data.segments.length > 0 ? 0 : null)
      setExecutionMeta(data.execution ?? null)

      logInfo("Conversion completed", {
        modelId,
        execution: data.execution,
      })

      return typeof data.markdown === "string" ? data.markdown : ""
    } finally {
      if (ticker) {
        clearInterval(ticker)
      }
    }
  }

  const runConversionForFile = async (file: File, opts: { autoSource?: string; modelId?: string } = {}) => {
    const modelForRun = opts.modelId ?? selectedModel
    resetConversionFeedback()
    setIsConverting(true)
    setConversionProgress(0)
    setShowResult(false)
    setCurrentStep("Initializing...")
    setExecutionMeta(null)
    if (opts.autoSource) {
      logInfo("Auto conversion triggered", { source: opts.autoSource, fileName: file.name, model: modelForRun })
    }

    try {
      let result = await runModelConversion(modelForRun, file)

      // Handle table preservation setting
      if (!preserveTables && result.includes("| ")) {
        result = result.replace(/\n\|[^\n]+\|[^\n]+\n\|[^\n]+\|/g, "\n[Table content removed]")
      }

      // Handle equation preservation setting
      if (!preserveEquations && result.includes("$")) {
        result = result.replace(/\$\$[^$]+\$\$/g, "[Equation removed]")
        result = result.replace(/\$[^$]+\$/g, "[Inline equation removed]")
      }

      setMarkdownResult(result)
      setLatexResult(convertMarkdownToLatex(result))
      setCurrentStep("Completed")
      setConversionProgress(100)
      setIsConverting(false)
      setShowResult(true)
    } catch (error) {
      const diagnostics = await fetchDiagnostics()
      const message = error instanceof Error ? error.message : "Unknown conversion error"
      setConversionError(message)
      setConversionErrorDetails(
        diagnostics
          ? `Backend URL: ${diagnostics.backendBaseUrl || "unknown"} | Healthy: ${diagnostics.backendHealthy ? "yes" : "no"} | Last backend error: ${diagnostics.backendLastError || "none"}`
          : null,
      )
      setLastDiagnostics(diagnostics)
      logError("Conversion failed", {
        message,
        diagnostics,
        model: modelForRun,
      })
      setIsConverting(false)
      setCurrentStep("Failed")
      setConversionProgress(0)
    }
  }

  const handleConvertPdf = async () => {
    if (!pdfFile) return
    await runConversionForFile(pdfFile)
  }

  const handleDownloadMarkdown = async () => {
    if (!markdownResult) return

    if (isElectron) {
      try {
        const fileName = pdfFile?.name.replace(".pdf", "") || "converted"
        const success = await window.electron.fileSystem.saveFile({
          content: markdownResult,
          defaultPath: `${fileName}.md`,
          filters: [{ name: "Markdown Files", extensions: ["md"] }],
        })

        if (success) {
          alert("Markdown file saved successfully!")
        }
      } catch (error) {
        console.error("Error saving file:", error)
        alert("Error saving file. Please try again.")
      }
    } else {
      // Browser download fallback
      const blob = new Blob([markdownResult], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${pdfFile?.name.replace(".pdf", "")}.md` || "converted.md"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const convertMarkdownToLatex = (markdown: string): string => {
    if (!markdown) return ""

    let latex = markdown

    // Replace headers
    latex = latex.replace(/^# (.*$)/gm, "\\section{$1}")
    latex = latex.replace(/^## (.*$)/gm, "\\subsection{$1}")
    latex = latex.replace(/^### (.*$)/gm, "\\subsubsection{$1}")

    // Replace bold and italic
    latex = latex.replace(/\*\*(.*?)\*\*/g, "\\textbf{$1}")
    latex = latex.replace(/\*(.*?)\*/g, "\\textit{$1}")

    // Replace lists
    latex = latex.replace(/^\s*[-*+]\s+(.*$)/gm, "\\item $1")
    latex = latex.replace(/^\s*(\d+)\.\s+(.*$)/gm, "\\item $2")

    // Wrap lists in itemize or enumerate
    const itemizeRegex = /\\item .+(?:\n\\item .+)*/g
    const itemizeMatches = latex.match(itemizeRegex) || []

    for (const match of itemizeMatches) {
      latex = latex.replace(match, "\\begin{itemize}\n" + match + "\n\\end{itemize}")
    }

    // Handle tables (simplified)
    const tableRegex = /\|(.+)\|[\s\S]*?\|/g
    const tableMatches = latex.match(tableRegex) || []

    for (const match of tableMatches) {
      // Extract table content
      const rows = match.split("\n").filter((row) => row.trim().startsWith("|"))

      if (rows.length > 1) {
        // Get header row
        const headerRow = rows[0]
        const headerCols = headerRow.split("|").filter((col) => col.trim() !== "")

        // Create LaTeX table
        let latexTable =
          "\\begin{table}[h!]\n\\centering\n\\begin{tabular}{" + "|c".repeat(headerCols.length) + "|}\n\\hline\n"

        // Add headers
        latexTable += headerCols.map((col) => col.trim()).join(" & ") + " \\\\ \\hline\n"

        // Add data rows
        for (let i = 2; i < rows.length; i++) {
          const cols = rows[i].split("|").filter((col) => col.trim() !== "")
          latexTable += cols.map((col) => col.trim()).join(" & ") + " \\\\ \\hline\n"
        }

        latexTable += "\\end{tabular}\n\\caption{Table}\n\\end{table}"

        latex = latex.replace(match, latexTable)
      }
    }

    // Preserve math expressions (already in LaTeX format)
    // No need to convert $...$ or $...$ as they're already in LaTeX format

    // Add document structure
    latex =
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{amssymb}\n\\usepackage{graphicx}\n\\begin{document}\n\n" +
      latex +
      "\n\n\\end{document}"

    return latex
  }

  const handleDownloadLatex = async () => {
    const latexToSave = latexResult || (markdownResult ? convertMarkdownToLatex(markdownResult) : "")
    if (!latexToSave) return

    if (isElectron) {
      try {
        const fileName = pdfFile?.name.replace(".pdf", "") || "converted"
        const success = await window.electron.fileSystem.saveFile({
          content: latexToSave,
          defaultPath: `${fileName}.tex`,
          filters: [{ name: "LaTeX Files", extensions: ["tex"] }],
        })

        if (success) {
          alert("LaTeX file saved successfully!")
        }
      } catch (error) {
        console.error("Error saving file:", error)
        alert("Error saving file. Please try again.")
      }
    } else {
      // Browser download fallback
      const blob = new Blob([latexToSave], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${pdfFile?.name.replace(".pdf", "")}.tex` || "converted.tex"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const handleClearContent = () => {
    setPdfFile(null)
    setPdfFilePath(null)
    resetConversionFeedback()
    setMarkdownResult("")
    setLatexResult("")
    setShowResult(false)
    setDocumentSegments([])
    setActiveSegment(null)
  }

  const handleDownloadContent = () => {
    if (showResult) {
      if (activeTab === "markdown") {
        handleDownloadMarkdown()
      } else {
        handleDownloadLatex()
      }
    } else {
      alert("Convert a PDF first or create content to download")
    }
  }

  // Function to handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value)

    // Convert content when switching to LaTeX tab
    if (value === "latex" && markdownResult && !latexResult) {
      setLatexResult(convertMarkdownToLatex(markdownResult))
    }
  }

  const handleSegmentClick = (index: number) => {
    setActiveSegment(index)
  }

  const handleModelInfoClick = () => {
    setIsModelInfoOpen(true)
  }

  // Window control handlers for Electron
  const handleMinimizeWindow = () => {
    if (isElectron) {
      window.electron.windowControls.minimize()
    }
  }

  const handleMaximizeWindow = () => {
    if (isElectron) {
      window.electron.windowControls.maximize()
    }
  }

  const handleCloseWindow = () => {
    if (isElectron) {
      window.electron.windowControls.close()
    }
  }

  return (
    <div className="flex flex-col h-screen w-full border border-gray-300 bg-white">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 relative">
            <Image
              src="/tingyun-logo.png"
              alt="Tingyun Logo"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          <span className="text-sm text-gray-700">Tingyun Snipping Tool - Snip Create</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1 text-gray-500 hover:text-gray-700" onClick={handleMinimizeWindow}>
            <Minus size={16} />
          </button>
          <button className="p-1 text-gray-500 hover:text-gray-700" onClick={handleMaximizeWindow}>
            <SquareIcon size={16} />
          </button>
          <button className="p-1 text-gray-500 hover:text-gray-700" onClick={handleCloseWindow}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleScreenSnip}>
                  <Square size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Screen Snipping Tool</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSelectionTool}>
                  <Move size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Selection Tool</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePenClick}>
                  <Pencil size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Handwriting Tool</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${pdfFile ? "text-purple-500" : ""}`}
                  onClick={handleFileClick}
                >
                  <FileText size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{pdfFile ? "Change PDF" : "Upload PDF for conversion"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf"
            className="hidden"
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    handleHistoryClick()
                  }}
                >
                  <History size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Previous Uploads</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownloadContent}>
                  <FileDown size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download Content</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleModelInfoClick}>
                  <Layers size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Model Information</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-auto">
          <TabsList className="h-8">
            <TabsTrigger
              value="markdown"
              className={`px-4 ${activeTab === "markdown" ? "bg-white text-black" : "bg-gray-100 text-gray-700"}`}
            >
              MARKDOWN
            </TabsTrigger>
            <TabsTrigger
              value="latex"
              className={`px-4 ${activeTab === "latex" ? "bg-purple-500 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              LATEX
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClearContent}>
                  <Trash2 size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear Content</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSettingsClick}>
                  <Settings size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex">
        {/* Segments panel (only shown when segments are available) */}
        {documentSegments.length > 0 && (
          <div className="w-64 border-r border-gray-200 overflow-y-auto p-2">
            <h3 className="font-medium text-sm mb-2 text-gray-700">Document Segments</h3>
            <div className="space-y-1">
              {documentSegments.map((segment, index) => (
                <div
                  key={segment.id}
                  className={`p-2 rounded text-xs cursor-pointer ${
                    activeSegment === index ? "bg-purple-100 text-purple-700" : "hover:bg-gray-100"
                  }`}
                  onClick={() => handleSegmentClick(index)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{segment.type.charAt(0).toUpperCase() + segment.type.slice(1)}</span>
                    {segment.confidence && (
                      <span className="text-xs text-gray-500">{Math.round(segment.confidence * 100)}%</span>
                    )}
                  </div>
                  <p className="truncate text-gray-600 mt-1">{segment.content.split("\n")[0].replace(/[#*`]/g, "")}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main content area */}
        <div
          className="flex-1 p-4 bg-white border border-gray-200 mx-4 my-2 rounded-md overflow-auto relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isHandwritingMode && (
            <div className="h-full flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleBackClick} className="flex items-center gap-1">
                    <ChevronLeft size={14} />
                    Back
                  </Button>
                  <span className="text-sm text-gray-600">Handwriting Workspace</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={togglePenTool}>
                    <PenTool size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyIndex <= 0}>
                    <Undo size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRedo} disabled={historyIndex >= canvasHistory.length - 1}>
                    <Redo size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={toggleGrid}>
                    <Grid size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearCanvas}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>Pen Size</span>
                <Slider
                  value={[penSize]}
                  min={1}
                  max={12}
                  step={1}
                  onValueChange={(value) => setPenSize(value[0])}
                  className="w-40"
                />
                <span>Color</span>
                <input
                  type="color"
                  value={penColor}
                  onChange={(e) => setPenColor(e.target.value)}
                  className="h-7 w-10 p-0 border border-gray-300 rounded"
                />
              </div>

              <div className="flex-1 border border-gray-200 rounded-md bg-white flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={900}
                  height={480}
                  className="max-w-full max-h-full cursor-crosshair border border-gray-100"
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleScanHandwriting}
                  disabled={isHandwritingConverting}
                  className="bg-purple-500 hover:bg-purple-600 text-white"
                >
                  {isHandwritingConverting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Converting...
                    </span>
                  ) : (
                    "Scan Handwriting"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Selection overlay */}
          {(isScreenSnippingMode || isSelectionMode) && isDrawing && (
            <div
              className="absolute border-2 border-purple-500 bg-purple-100 bg-opacity-20 pointer-events-none"
              style={{
                left: `${selectedArea.x}px`,
                top: `${selectedArea.y}px`,
                width: `${selectedArea.width}px`,
                height: `${selectedArea.height}px`,
              }}
            />
          )}

          {!isHandwritingMode && pdfFile && !showResult && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="flex items-center gap-2 text-purple-600">
                <FileText size={24} />
                <span className="font-medium">{pdfFile.name}</span>
                {pdfFilePath && <span className="text-xs text-gray-500">({pdfFilePath})</span>}
              </div>

              {conversionError && (
                <Alert className="max-w-2xl bg-red-50 border-red-200 text-red-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">Conversion failed</p>
                    <p className="text-xs mt-1">{conversionError}</p>
                    {conversionErrorDetails && <p className="text-xs mt-1">{conversionErrorDetails}</p>}
                    {lastDiagnostics?.logPath && <p className="text-xs mt-1">Log file: {lastDiagnostics.logPath}</p>}
                    {isElectron && (
                      <div className="mt-2">
                        <Button variant="outline" size="sm" onClick={() => window.electron.diagnostics.openLogDirectory()}>
                          Open Log Folder
                        </Button>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {isConverting ? (
                <div className="w-full max-w-lg">
                  <Progress value={conversionProgress} className="h-2 mb-2" />
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {currentStep} ({conversionProgress}%)
                    </span>
                  </div>
                  <p className="text-xs text-center text-gray-400 mt-2">
                    Using {PDF_MODELS.find((m) => m.id === selectedModel)?.name} model
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Model: {PDF_MODELS.find((m) => m.id === selectedModel)?.name}</span>
                    <span>•</span>
                    <span>Quality: {qualityLevel}%</span>
                    {MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation && (
                      <>
                        <span>•</span>
                        <span>Segmentation: Enabled</span>
                      </>
                    )}
                  </div>
                  <Button onClick={handleConvertPdf} className="bg-purple-500 hover:bg-purple-600 text-white">
                    Convert to Markdown
                  </Button>
                </div>
              )}
            </div>
          )}

          {!isHandwritingMode && showResult && (
            <div className="flex flex-col h-full">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">
                    {activeTab === "markdown" ? "Converted Markdown" : "Converted LaTeX"}
                    {activeSegment !== null && documentSegments.length > 0 && (
                      <span className="text-xs text-gray-500 ml-2">
                        - Viewing {documentSegments[activeSegment].type}
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full">
                    {PDF_MODELS.find((m) => m.id === selectedModel)?.name}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1"
                  onClick={activeTab === "markdown" ? handleDownloadMarkdown : handleDownloadLatex}
                >
                  <Download size={14} />
                  Download {activeTab === "markdown" ? "Markdown" : "LaTeX"}
                </Button>
              </div>
              {executionMeta && (
                <div className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <span className="font-medium">Execution:</span>{" "}
                  requested <span className="font-mono">{executionMeta.requested_model}</span>, ran{" "}
                  <span className="font-mono">{executionMeta.engine_used}</span>
                  {executionMeta.fallback_used ? " (fallback)" : ""}
                  {executionMeta.note ? ` - ${executionMeta.note}` : ""}
                </div>
              )}
              <Textarea
                value={
                  activeTab === "markdown"
                    ? activeSegment !== null && documentSegments.length > 0
                      ? documentSegments[activeSegment].content
                      : markdownResult
                    : latexResult
                }
                onChange={(e) =>
                  activeTab === "markdown"
                    ? activeSegment !== null && documentSegments.length > 0
                      ? setDocumentSegments((prev) => {
                          const newSegments = [...prev]
                          newSegments[activeSegment] = {
                            ...newSegments[activeSegment],
                            content: e.target.value,
                          }
                          return newSegments
                        })
                      : setMarkdownResult(e.target.value)
                    : setLatexResult(e.target.value)
                }
                className="flex-1 font-mono text-sm"
              />
            </div>
          )}

          {!isHandwritingMode && !pdfFile && !showResult && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="p-6 border-2 border-dashed rounded-lg border-gray-300 flex flex-col items-center gap-2 max-w-lg mx-auto">
                <Upload size={32} className="text-gray-400" />
                <p className="text-gray-500">Click the document icon in the toolbar to upload a PDF</p>
                <p className="text-xs text-gray-400">Supported models: docTR (Europe), LayoutLM, MarkItDown, Docling, and ZeroX</p>
                {isElectron && (
                  <p className="text-xs text-purple-500 mt-1">Running in desktop mode with enhanced capabilities</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-center p-4">
        <Button
          className="px-12 py-2 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-md"
          disabled={isConverting || !showResult}
          onClick={handleDownloadContent}
        >
          Save {activeTab === "markdown" ? "Markdown" : "LaTeX"}
        </Button>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image
                src="/tingyun-logo.png"
                alt="Tingyun Logo"
                width={24}
                height={24}
                className="object-contain"
              />
              Settings
            </DialogTitle>
            <DialogDescription>Configure your PDF to Markdown conversion settings</DialogDescription>
          </DialogHeader>

          <TabsComponent defaultValue="models" className="flex flex-col min-h-0 flex-1">
            <TabsListComponent className="grid grid-cols-3 shrink-0">
              <TabsTriggerComponent value="models">Models</TabsTriggerComponent>
              <TabsTriggerComponent value="quality">Quality</TabsTriggerComponent>
              <TabsTriggerComponent value="segmentation">Segmentation</TabsTriggerComponent>
            </TabsListComponent>

            <TabsContent value="models" className="py-4 max-h-[52vh] overflow-y-auto">
              <div>
                <h3 className="text-sm font-medium mb-3">PDF to Markdown Model</h3>
                <RadioGroup value={selectedModel} onValueChange={setSelectedModel}>
                  {PDF_MODELS.map((model) => (
                    <div key={model.id} className="flex items-start space-x-2 mb-3">
                      <RadioGroupItem value={model.id} id={model.id} />
                      <div className="grid gap-1">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={model.id} className="font-medium">
                            {model.name}
                          </Label>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                            {model.processingTime}
                          </span>
                          {model.id === "docling" && (
                            <span className="text-xs px-2 py-0.5 bg-purple-100 rounded-full text-purple-600">New</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{model.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {model.strengths.map((strength, index) => (
                            <span key={index} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full">
                              {strength}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </TabsContent>

            <TabsContent value="quality" className="py-4 max-h-[52vh] overflow-y-auto">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium">Quality Level</h3>
                  <span className="text-sm text-gray-500">{qualityLevel}%</span>
                </div>
                <Slider
                  value={[qualityLevel]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(value) => setQualityLevel(value[0])}
                  className="mb-4"
                />
                <p className="text-xs text-gray-500">
                  Higher quality provides better results but may take longer to process
                </p>
              </div>

              <div className="space-y-3 mt-6">
                <h3 className="text-sm font-medium">Content Preservation</h3>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="preserveTables"
                    checked={preserveTables}
                    onCheckedChange={(checked) => setPreserveTables(checked === true)}
                  />
                  <Label htmlFor="preserveTables">Preserve tables</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="preserveEquations"
                    checked={preserveEquations}
                    onCheckedChange={(checked) => setPreserveEquations(checked === true)}
                    disabled={!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsEquations}
                  />
                  <Label htmlFor="preserveEquations">
                    Preserve equations
                    {!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsEquations && (
                      <span className="text-xs text-gray-500 ml-2">(Not supported by this model)</span>
                    )}
                  </Label>
                </div>
              </div>

              <div className="space-y-3 mt-6">
                <h3 className="text-sm font-medium">Page Limit</h3>
                <p className="text-xs text-gray-500">Choose full OCR or a faster preview on first pages only</p>
                <RadioGroup value={pageLimit} onValueChange={(value: PageLimitOption) => setPageLimit(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="full" id="page-limit-full" />
                    <Label htmlFor="page-limit-full">Full document (default)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="page-limit-1" />
                    <Label htmlFor="page-limit-1">First 1 page</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="page-limit-2" />
                    <Label htmlFor="page-limit-2">First 2 pages</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="5" id="page-limit-5" />
                    <Label htmlFor="page-limit-5">First 5 pages</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="10" id="page-limit-10" />
                    <Label htmlFor="page-limit-10">First 10 pages</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="20" id="page-limit-20" />
                    <Label htmlFor="page-limit-20">First 20 pages</Label>
                  </div>
                </RadioGroup>
              </div>
            </TabsContent>

            <TabsContent value="segmentation" className="py-4 max-h-[52vh] overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Document Segmentation</h3>
                  {!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 rounded-full text-yellow-700">
                      Not supported by {PDF_MODELS.find((m) => m.id === selectedModel)?.name}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableTextSegmentation"
                      checked={segmentationOptions.enableTextSegmentation}
                      onCheckedChange={(checked) =>
                        setSegmentationOptions((prev) => ({ ...prev, enableTextSegmentation: checked === true }))
                      }
                      disabled={!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation}
                    />
                    <Label htmlFor="enableTextSegmentation">Text segmentation</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableLayoutSegmentation"
                      checked={segmentationOptions.enableLayoutSegmentation}
                      onCheckedChange={(checked) =>
                        setSegmentationOptions((prev) => ({ ...prev, enableLayoutSegmentation: checked === true }))
                      }
                      disabled={!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation}
                    />
                    <Label htmlFor="enableLayoutSegmentation">Layout segmentation</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableTableSegmentation"
                      checked={segmentationOptions.enableTableSegmentation}
                      onCheckedChange={(checked) =>
                        setSegmentationOptions((prev) => ({ ...prev, enableTableSegmentation: checked === true }))
                      }
                      disabled={!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation}
                    />
                    <Label htmlFor="enableTableSegmentation">Table segmentation</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableImageSegmentation"
                      checked={segmentationOptions.enableImageSegmentation}
                      onCheckedChange={(checked) =>
                        setSegmentationOptions((prev) => ({ ...prev, enableImageSegmentation: checked === true }))
                      }
                      disabled={!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation}
                    />
                    <Label htmlFor="enableImageSegmentation">Image segmentation</Label>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-medium mb-2">Segmentation Level</h3>
                  <RadioGroup
                    value={segmentationOptions.segmentationLevel}
                    onValueChange={(value: "basic" | "advanced" | "expert") =>
                      setSegmentationOptions((prev) => ({ ...prev, segmentationLevel: value }))
                    }
                    disabled={!MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].supportsSegmentation}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="basic" id="basic" />
                      <Label htmlFor="basic">Basic - Simple document structure</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="advanced" id="advanced" />
                      <Label htmlFor="advanced">Advanced - Detailed semantic segmentation</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="expert" id="expert" />
                      <Label htmlFor="expert">Expert - Fine-grained linguistic analysis</Label>
                    </div>
                  </RadioGroup>
                </div>

                <Alert className="mt-4 bg-purple-50 text-purple-800 border-purple-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The Docling model provides the most advanced segmentation capabilities.
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>
          </TabsComponent>

          <div className="flex justify-end pt-2 shrink-0">
            <Button
              onClick={() => setIsSettingsOpen(false)}
              className="flex items-center gap-1 bg-purple-500 hover:bg-purple-600 text-white"
            >
              <Check size={16} />
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isModelInfoOpen} onOpenChange={setIsModelInfoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers size={18} />
              Model Information
            </DialogTitle>
            <DialogDescription>Current OCR model adapters and their strengths</DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 max-h-[420px] overflow-y-auto">
            {PDF_MODELS.map((model) => (
              <div key={model.id} className="rounded border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{model.name}</p>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {model.processingTime}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{model.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {model.strengths.map((strength) => (
                    <span key={`${model.id}-${strength}`} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">
                      {strength}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={18} />
              Previous Uploads
            </DialogTitle>
            <DialogDescription>Select a previous upload to load it</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {uploadHistory.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {uploadHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                    onClick={() => handleHistoryItemClick(item)}
                  >
                    <div className="flex items-center gap-2">
                      {item.type === "pdf" ? (
                        <FileText size={18} className="text-purple-500" />
                      ) : (
                        <FileText size={18} className="text-purple-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.date}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleHistoryItemClick(item)}>
                      Load
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-4">No previous uploads found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Screen Sources Dialog */}
      <Dialog open={isScreenSourcesDialogOpen} onOpenChange={setIsScreenSourcesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor size={18} />
              Select Screen to Capture
            </DialogTitle>
            <DialogDescription>Choose which screen or window to capture</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {screenSources.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {screenSources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                    onClick={() => handleScreenSourceSelect(source.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Monitor size={18} className="text-purple-500" />
                      <div>
                        <p className="text-sm font-medium">{source.name}</p>
                        <p className="text-xs text-gray-500">{source.displayId}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleScreenSourceSelect(source.id)}>
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-center text-gray-500 py-2">No screen sources available</p>
                <p className="text-xs text-gray-500 text-center">
                  Screen Recording access status: <span className="font-medium">{screenAccessStatus}</span>
                </p>
                {isElectron && (
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="default" size="sm" onClick={handleSystemScreenCapture}>
                      Use System Screen Picker
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOpenScreenPermissionSettings}>
                      Open Screen Recording Settings
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleScreenSnip}>
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TingyunSnippingTool
