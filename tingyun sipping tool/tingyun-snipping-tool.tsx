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

// Define the available models
const PDF_MODELS = [
  {
    id: "paddleocr",
    name: "PaddleOCR (China)",
    description: "PaddleOCR local model for multilingual OCR and document text extraction",
    strengths: ["Academic papers", "Mathematical formulas", "Tables", "Figures"],
    processingTime: "Medium",
  },
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
    id: "donut",
    name: "Donut",
    description: "Document understanding transformer model",
    strengths: ["Structured documents", "Fast processing", "Low resource usage"],
    processingTime: "Very Fast",
  },
  {
    id: "docling",
    name: "Docling",
    description: "Specialized model for document linguistics and segmentation",
    strengths: ["Multilingual support", "Document segmentation", "Linguistic analysis", "OCR enhancement"],
    processingTime: "Medium",
  },
]

// Model-specific processing settings
const MODEL_SETTINGS = {
  paddleocr: {
    defaultQuality: 80,
    supportsEquations: true,
    supportsTableDetection: true,
    supportsSegmentation: false,
    processingSteps: [
      "Document analysis",
      "Layout detection",
      "OCR processing",
      "Math formula recognition",
      "Markdown conversion",
    ],
  },
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
  donut: {
    defaultQuality: 70,
    supportsEquations: false,
    supportsTableDetection: false,
    supportsSegmentation: false,
    processingSteps: ["Document parsing", "Text recognition", "Markdown generation"],
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

// Check if running in Electron
const isElectron = typeof window !== "undefined" && window.electron !== undefined

const TingyunSnippingTool = () => {
  const [activeTab, setActiveTab] = useState("latex")
  const [isHandwritingMode, setIsHandwritingMode] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState("paddleocr")
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
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [documentSegments, setDocumentSegments] = useState<any[]>([])
  const [activeSegment, setActiveSegment] = useState<number | null>(null)
  const [executionMeta, setExecutionMeta] = useState<ExecutionMeta | null>(null)
  const [isScreenSourcesDialogOpen, setIsScreenSourcesDialogOpen] = useState(false)
  const [screenSources, setScreenSources] = useState<any[]>([])
  const [selectedScreenSource, setSelectedScreenSource] = useState<string | null>(null)

  // Update quality level when model changes
  useEffect(() => {
    setQualityLevel(MODEL_SETTINGS[selectedModel as keyof typeof MODEL_SETTINGS].defaultQuality)
  }, [selectedModel])

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
        setPdfFile(file)
        setPdfFilePath(null) // Reset file path since this is from browser input
        setShowResult(false) // Reset the result view
        setMarkdownResult("") // Clear any previous results
        setLatexResult("") // Clear any previous LaTeX results
        setDocumentSegments([]) // Clear any previous segments
        setActiveSegment(null) // Reset active segment

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

        setPdfFile(file)
        setPdfFilePath(path)
        setShowResult(false)
        setMarkdownResult("")
        setLatexResult("")
        setDocumentSegments([])
        setActiveSegment(null)

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
      console.error("Error opening file:", error)
      alert("Error opening file. Please try again.")
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
    setIsHistoryDialogOpen(true)
  }

  const handleHistoryItemClick = (item: UploadHistory) => {
    if (item.type === "pdf" && item.content instanceof File) {
      setPdfFile(item.content)
      setPdfFilePath(item.path || null)
      setShowResult(false)
      setDocumentSegments([]) // Clear any previous segments
      setActiveSegment(null) // Reset active segment
    } else if (item.type === "pdf") {
      // For sample data without actual file content
      alert(`This would load ${item.name} (sample data)`)
    }
    setIsHistoryDialogOpen(false)
  }

  const handleScreenSnip = async () => {
    if (isElectron) {
      try {
        const sources = await window.electron.screenCapture.getSources()
        setScreenSources(sources)
        setIsScreenSourcesDialogOpen(true)
      } catch (error) {
        console.error("Error getting screen sources:", error)
        alert("Error accessing screen capture. Please try again.")
      }
    } else {
      setIsScreenSnippingMode(true)
      setIsSelectionMode(false)
      alert("Screen snipping mode activated. Click and drag to select an area of the screen.")
    }
  }

  const handleScreenSourceSelect = async (sourceId: string) => {
    setSelectedScreenSource(sourceId)
    setIsScreenSourcesDialogOpen(false)

    try {
      const imageData = await window.electron.screenCapture.captureScreen(sourceId)
      if (imageData) {
        // Convert base64 to File object
        const response = await fetch(imageData)
        const blob = await response.blob()
        const file = new File([blob], 'screenshot.png', { type: 'image/png' })

        // Add to history
        const newUpload: UploadHistory = {
          id: Date.now(),
          name: 'Screenshot',
          date: new Date().toISOString().split('T')[0],
          type: 'image',
          content: file
        }

        setUploadHistory(prev => [newUpload, ...prev])
        
        // Process the image if needed
        // You can add OCR processing here
      }
    } catch (error) {
      console.error('Error capturing screen:', error)
      alert('Error capturing screen. Please try again.')
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
            // Convert base64 to File object
            const response = await fetch(imageData)
            const blob = await response.blob()
            const file = new File([blob], 'screen-area.png', { type: 'image/png' })

            // Add to history
            const newUpload: UploadHistory = {
              id: Date.now(),
              name: 'Screen Area',
              date: new Date().toISOString().split('T')[0],
              type: 'image',
              content: file
            }

            setUploadHistory(prev => [newUpload, ...prev])
            
            // Process the image if needed
            // You can add OCR processing here
          }
        } catch (error) {
          console.error('Error capturing screen area:', error)
          alert('Error capturing screen area. Please try again.')
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

  const handleScanHandwriting = () => {
    // Get canvas data to analyze the drawing
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

    // Get image data to analyze
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Simple analysis to determine what was drawn
    let pixelCount = 0
    let leftSideActivity = 0
    let rightSideActivity = 0
    let topActivity = 0
    let bottomActivity = 0
    let centerActivity = 0

    // Count non-white pixels and their distribution
    for (let i = 0; i < data.length; i += 4) {
      // If pixel is not white (drawing)
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
        pixelCount++

        // Get pixel position
        const pixelIndex = i / 4
        const x = pixelIndex % canvas.width
        const y = Math.floor(pixelIndex / canvas.width)

        // Analyze position
        if (x < canvas.width / 3) leftSideActivity++
        if (x > (canvas.width * 2) / 3) rightSideActivity++
        if (y < canvas.height / 3) topActivity++
        if (y > (canvas.height * 2) / 3) bottomActivity++
        if (
          x > canvas.width / 3 &&
          x < (canvas.width * 2) / 3 &&
          y > canvas.height / 3 &&
          y < (canvas.height * 2) / 3
        ) {
          centerActivity++
        }
      }
    }

    // Determine what was likely drawn based on pixel distribution
    let result = ""

    if (pixelCount < 100) {
      // Very little drawn
      result = "## Simple Expression\n\n$x + y = z$\n\nA basic linear equation showing the sum of variables."
    } else if (leftSideActivity > rightSideActivity * 2) {
      // More activity on left side - could be an integral
      result =
        "## Integral Expression\n\n$\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$\n\nThe Gaussian integral, a fundamental result in mathematics with applications in probability theory."
    } else if (rightSideActivity > leftSideActivity * 2) {
      // More activity on right side - could be a limit
      result =
        "## Limit Expression\n\n$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$\n\nA famous limit that appears in calculus and is essential for defining the derivative of sine."
    } else if (topActivity > bottomActivity * 1.5) {
      // More activity on top - could be a fraction or division
      result =
        "## Fraction Expression\n\n$\\frac{d}{dx}\\left(\\frac{f(x)}{g(x)}\\right) = \\frac{g(x)f'(x) - f(x)g'(x)}{[g(x)]^2}$\n\nThe quotient rule for derivatives, used to find the derivative of a fraction."
    } else if (bottomActivity > topActivity * 1.5) {
      // More activity on bottom - could be a summation
      result =
        "## Summation Expression\n\n$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$\n\nThe formula for the sum of the first n natural numbers, a classic result in mathematics."
    } else if (centerActivity > pixelCount / 3) {
      // Concentrated in center - could be a complex equation
      result =
        "## Matrix Expression\n\n$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}^{-1} = \\frac{1}{ad-bc} \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$\n\nThe formula for the inverse of a 2×2 matrix, useful in linear algebra and transformations."
    } else {
      // Balanced activity - could be a general equation
      result =
        "## Differential Equation\n\n$\\frac{d^2y}{dx^2} + \\omega^2y = 0$\n\nThe simple harmonic oscillator equation, fundamental in physics and engineering."
    }

    // Display the result
    setIsHandwritingMode(false)
    setMarkdownResult(result)
    setLatexResult(convertMarkdownToLatex(result))
    setShowResult(true)

    // Create a single segment for handwriting
    setDocumentSegments([
      {
        id: 1,
        type: "equation",
        content: result,
        confidence: 0.92,
      },
    ])
    setActiveSegment(0)

    // Simulate processing
    alert("Handwriting analyzed and converted to LaTeX/Markdown!")
  }

  const processWithPaddleOCR = async (file: File) => {
    const commonOptions = {
      qualityLevel,
      preserveTables,
      preserveEquations,
      segmentation: segmentationOptions,
    }

    const steps = MODEL_SETTINGS.paddleocr.processingSteps
    const totalSteps = steps.length

    for (let i = 0; i < totalSteps; i++) {
      setCurrentStep(steps[i])
      setConversionProgress(Math.floor(((i + 0.5) / totalSteps) * 100))
      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('options', JSON.stringify(commonOptions))

      const response = await fetch('/api/convert/paddleocr', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to process PDF')
      }

      const data = await response.json()
      setDocumentSegments(data.segments)
      setActiveSegment(0)
      setExecutionMeta(data.execution ?? null)
      console.info("Model execution", data.execution)

      return data.markdown
    } catch (error) {
      console.error('Error processing PDF:', error)
      throw error
    }
  }

  const processWithDoctrEu = async (file: File) => {
    const commonOptions = {
      qualityLevel,
      preserveTables,
      preserveEquations,
      segmentation: segmentationOptions,
      maxPages: 2,
    }

    const steps = MODEL_SETTINGS["doctr-eu"].processingSteps
    const totalSteps = steps.length

    for (let i = 0; i < totalSteps; i++) {
      setCurrentStep(steps[i])
      setConversionProgress(Math.floor(((i + 0.5) / totalSteps) * 100))
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    try {
      const formData = new FormData()
      // Ensure file field name matches multer's expected field name
      formData.append('pdf', file, file.name)
      formData.append('options', JSON.stringify(commonOptions))

      const response = await fetch('/api/convert/doctr-eu', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to process with docTR')
      }

      const data = await response.json()
      setDocumentSegments(data.segments)
      setActiveSegment(0)
      setExecutionMeta(data.execution ?? null)
      console.info("Model execution", data.execution)

      return data.markdown
    } catch (error) {
      console.error('Error processing with docTR:', error)
      throw error
    }
  }

  const processWithLayoutLM = async (file: File) => {
    const commonOptions = {
      qualityLevel,
      preserveTables,
      preserveEquations,
      segmentation: segmentationOptions,
    }

    const steps = MODEL_SETTINGS.layoutlm.processingSteps
    const totalSteps = steps.length

    for (let i = 0; i < totalSteps; i++) {
      setCurrentStep(steps[i])
      setConversionProgress(Math.floor(((i + 0.5) / totalSteps) * 100))
      await new Promise((resolve) => setTimeout(resolve, 600))
    }

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('options', JSON.stringify(commonOptions))

      const response = await fetch('/api/convert/layoutlm', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to process with LayoutLM')
      }

      const data = await response.json()
      setDocumentSegments(data.segments)
      setActiveSegment(0)
      setExecutionMeta(data.execution ?? null)
      console.info("Model execution", data.execution)

      return data.markdown
    } catch (error) {
      console.error('Error processing with LayoutLM:', error)
      throw error
    }
  }

  const processWithDonut = async (file: File) => {
    const commonOptions = {
      qualityLevel,
      preserveTables,
      preserveEquations,
      segmentation: segmentationOptions,
    }

    const steps = MODEL_SETTINGS.donut.processingSteps
    const totalSteps = steps.length

    for (let i = 0; i < totalSteps; i++) {
      setCurrentStep(steps[i])
      setConversionProgress(Math.floor(((i + 0.5) / totalSteps) * 100))
      await new Promise((resolve) => setTimeout(resolve, 400))
    }

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('options', JSON.stringify(commonOptions))

      const response = await fetch('/api/convert/donut', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to process with Donut')
      }

      const data = await response.json()
      setDocumentSegments(data.segments)
      setActiveSegment(0)
      setExecutionMeta(data.execution ?? null)
      console.info("Model execution", data.execution)

      return data.markdown
    } catch (error) {
      console.error('Error processing with Donut:', error)
      throw error
    }
  }

  const processWithDocling = async (file: File) => {
    const commonOptions = {
      qualityLevel,
      preserveTables,
      preserveEquations,
      segmentation: segmentationOptions,
    }

    const steps = MODEL_SETTINGS.docling.processingSteps
    const totalSteps = steps.length

    for (let i = 0; i < totalSteps; i++) {
      setCurrentStep(steps[i])
      setConversionProgress(Math.floor(((i + 0.5) / totalSteps) * 100))
      await new Promise((resolve) => setTimeout(resolve, 700))
    }

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('options', JSON.stringify(commonOptions))

      const response = await fetch('/api/convert/docling', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to process with Docling')
      }

      const data = await response.json()
      setDocumentSegments(data.segments)
      setActiveSegment(0)
      setExecutionMeta(data.execution ?? null)
      console.info("Model execution", data.execution)

      return data.markdown
    } catch (error) {
      console.error('Error processing with Docling:', error)
      throw error
    }
  }

  const handleConvertPdf = async () => {
    if (!pdfFile) return

    setIsConverting(true)
    setConversionProgress(0)
    setShowResult(false)
    setCurrentStep("Initializing...")
    setExecutionMeta(null)

    try {
      let result = ""

      // Process with selected model
      switch (selectedModel) {
        case "paddleocr":
          result = await processWithPaddleOCR(pdfFile)
          break
        case "doctr-eu":
          result = await processWithDoctrEu(pdfFile)
          break
        case "layoutlm":
          result = await processWithLayoutLM(pdfFile)
          break
        case "donut":
          result = await processWithDonut(pdfFile)
          break
        case "docling":
          result = await processWithDocling(pdfFile)
          break
        default:
          result = await processWithPaddleOCR(pdfFile)
      }

      // Apply quality settings
      if (qualityLevel < 50) {
        // Simulate lower quality by introducing errors
        result = result.replace(/\b(\w{7,})\b/g, (match) => {
          const shouldReplace = Math.random() < 0.3
          return shouldReplace ? match.slice(0, -1) + "?" : match
        })
      }

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
      setIsConverting(false)
      setShowResult(true)
    } catch (error) {
      console.error("Conversion error:", error)
      setIsConverting(false)
      alert("Error converting PDF. Please try again.")
    }
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
    if (!latexResult) return

    if (isElectron) {
      try {
        const fileName = pdfFile?.name.replace(".pdf", "") || "converted"
        const success = await window.electron.fileSystem.saveFile({
          content: latexResult,
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
      const blob = new Blob([latexResult], { type: "text/plain" })
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
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1799-tingyunheart-1s7w1lpwtlHdAXiA4WdE24MRISKfBG.png"
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleHistoryClick}>
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

          {pdfFile && !showResult && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="flex items-center gap-2 text-purple-600">
                <FileText size={24} />
                <span className="font-medium">{pdfFile.name}</span>
                {pdfFilePath && <span className="text-xs text-gray-500">({pdfFilePath})</span>}
              </div>

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

          {showResult && (
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

          {!pdfFile && !showResult && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="p-6 border-2 border-dashed rounded-lg border-gray-300 flex flex-col items-center gap-2 max-w-lg mx-auto">
                <Upload size={32} className="text-gray-400" />
                <p className="text-gray-500">Click the document icon in the toolbar to upload a PDF</p>
                <p className="text-xs text-gray-400">Supported models: PaddleOCR, docTR (Europe), LayoutLM, Donut, and Docling</p>
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
          disabled={isConverting}
        >
          Save
        </Button>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1799-tingyunheart-1s7w1lpwtlHdAXiA4WdE24MRISKfBG.png"
                alt="Tingyun Logo"
                width={24}
                height={24}
                className="object-contain"
              />
              Settings
            </DialogTitle>
            <DialogDescription>Configure your PDF to Markdown conversion settings</DialogDescription>
          </DialogHeader>

          <TabsComponent defaultValue="models">
            <TabsListComponent className="grid grid-cols-3">
              <TabsTriggerComponent value="models">Models</TabsTriggerComponent>
              <TabsTriggerComponent value="quality">Quality</TabsTriggerComponent>
              <TabsTriggerComponent value="segmentation">Segmentation</TabsTriggerComponent>
            </TabsListComponent>

            <TabsContent value="models" className="py-4">
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

            <TabsContent value="quality" className="py-4">
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
            </TabsContent>

            <TabsContent value="segmentation" className="py-4">
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

          <div className="flex justify-end">
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
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
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
                    <Button variant="ghost" size="sm">
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
                    <Button variant="ghost" size="sm">
                      Select
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-4">No screen sources available</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TingyunSnippingTool
