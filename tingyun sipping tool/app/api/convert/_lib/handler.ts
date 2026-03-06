import { NextResponse } from 'next/server'
import fs from 'fs'
import http from 'http'
import https from 'https'

type SegmentType = 'title' | 'header' | 'paragraph' | 'table' | 'equation'

type Segment = {
  id: number
  type: SegmentType
  content: string
  confidence: number
}

type ChartValidationStatus = 'valid' | 'malformed' | 'schema_mismatch'

type NormalizedChart = {
  id: string
  page: number | null
  chart_type: string | null
  series: unknown[]
  confidence: number | null
  title: string | null
  x_label: string | null
  y_label: string | null
  preview_image_data_url: string | null
  raw: unknown
  json_preview: string
  validation_status: ChartValidationStatus
  validation_error: string | null
  flags: string[]
}

function backendBaseUrl(): string {
  return process.env.FASTAPI_BASE_URL || 'http://127.0.0.1:8000'
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function safeJsonSnippet(raw: string, max = 1200): string {
  if (!raw) return ''
  return raw.length > max ? `${raw.slice(0, max)}...` : raw
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function logConvert(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message: `next-route: ${message}`,
    meta,
  })
  const logPath = process.env.DESKTOP_APP_LOG_PATH
  if (logPath) {
    try {
      fs.appendFileSync(logPath, `${line}\n`, 'utf8')
      return
    } catch {
      // fall through to console
    }
  }
  if (level === 'error') {
    console.error(line)
    return
  }
  if (level === 'warn') {
    console.warn(line)
    return
  }
  console.info(line)
}

function markdownToSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let current: { type: SegmentType; content: string } = { type: 'paragraph', content: '' }

  const pushCurrent = () => {
    if (!current.content.trim()) {
      return
    }

    segments.push({
      id: segments.length + 1,
      type: current.type,
      content: `${current.content.trim()}\n\n`,
      confidence: 0.95,
    })
  }

  for (const line of lines) {
    if (line.startsWith('#')) {
      pushCurrent()
      const headerLevel = (line.match(/^#+/) || [''])[0].length
      const type: SegmentType = headerLevel === 1 && segments.length === 0 ? 'title' : 'header'
      current = { type, content: `${line}\n` }
      continue
    }

    if (line.startsWith('|')) {
      if (current.type !== 'table') {
        pushCurrent()
        current = { type: 'table', content: `${line}\n` }
      } else {
        current.content += `${line}\n`
      }
      continue
    }

    if (line.includes('$') && /\$[^$]+\$/.test(line)) {
      if (current.type !== 'equation') {
        pushCurrent()
        current = { type: 'equation', content: `${line}\n` }
      } else {
        current.content += `${line}\n`
      }
      continue
    }

    if (line.trim()) {
      if (!['paragraph', 'title', 'header'].includes(current.type)) {
        pushCurrent()
        current = { type: 'paragraph', content: `${line}\n` }
      } else {
        current.content += `${line}\n`
      }
      continue
    }

    current.content += '\n'
  }

  pushCurrent()
  return segments
}

function normalizeChartItem(item: unknown, index: number): NormalizedChart {
  const fallbackId = `chart-${index + 1}`
  const malformedFromRaw = (rawText: string, err: string): NormalizedChart => ({
    id: fallbackId,
    page: null,
    chart_type: null,
    series: [],
    confidence: null,
    title: null,
    x_label: null,
    y_label: null,
    preview_image_data_url: null,
    raw: rawText,
    json_preview: rawText,
    validation_status: 'malformed',
    validation_error: err,
    flags: [],
  })

  let obj: Record<string, unknown>
  if (typeof item === 'string') {
    try {
      const parsed = JSON.parse(item)
      if (!parsed || typeof parsed !== 'object') {
        return malformedFromRaw(item, 'Parsed JSON is not an object')
      }
      obj = parsed as Record<string, unknown>
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to parse chart JSON'
      return malformedFromRaw(item, msg)
    }
  } else if (item && typeof item === 'object') {
    obj = item as Record<string, unknown>
  } else {
    return malformedFromRaw(String(item), 'Chart payload is not an object')
  }

  const id = safeString(obj.id, fallbackId)
  const page = Number.isFinite(Number(obj.page)) ? Number(obj.page) : null
  const chartType = safeString(obj.chart_type, '')
  const series = Array.isArray(obj.series) ? obj.series : []
  const confidence = Number.isFinite(Number(obj.confidence)) ? Number(obj.confidence) : null
  const flags = Array.isArray(obj.flags)
    ? obj.flags.filter((flag): flag is string => typeof flag === 'string')
    : []

  const missing: string[] = []
  if (!id) missing.push('id')
  if (page === null) missing.push('page')
  if (!chartType) missing.push('chart_type')
  if (!Array.isArray(obj.series)) missing.push('series')
  if (confidence === null) missing.push('confidence')

  let validationStatus: ChartValidationStatus = missing.length === 0 ? 'valid' : 'schema_mismatch'
  let validationError: string | null =
    missing.length === 0 ? null : `Missing/invalid required fields: ${missing.join(', ')}`

  const inferredTopology = flags.includes('inferred-edges') || flags.includes('topology-unverified')
  if (inferredTopology) {
    validationStatus = 'schema_mismatch'
    validationError =
      'Topology is OCR-inferred (not vision-verified). Review and correct edges manually before export.'
  }

  const normalized: NormalizedChart = {
    id: id || fallbackId,
    page,
    chart_type: chartType || null,
    series,
    confidence,
    title: safeString(obj.title, '') || null,
    x_label: safeString(obj.x_label, '') || null,
    y_label: safeString(obj.y_label, '') || null,
    preview_image_data_url: safeString(obj.preview_image_data_url, '') || null,
    raw: obj.raw ?? obj,
    json_preview: JSON.stringify(obj, null, 2),
    validation_status: validationStatus,
    validation_error: validationError,
    flags,
  }
  return normalized
}

function normalizeCharts(payload: Record<string, unknown>): NormalizedChart[] {
  const rawCharts = Array.isArray(payload.charts) ? payload.charts : []
  return rawCharts.map((item, idx) => normalizeChartItem(item, idx))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postBackendRaw(
  targetUrl: string,
  headers: Record<string, string>,
  body: Buffer,
  timeoutMs: number,
): Promise<{ status: number; statusText: string; bodyText: string }> {
  return await new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl)
    const useHttps = parsed.protocol === 'https:'
    const transport = useHttps ? https : http

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : useHttps ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          ...headers,
          'content-length': String(body.byteLength),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            statusText: res.statusMessage || 'Unknown',
            bodyText: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Backend request timeout after ${timeoutMs}ms`))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export function createModelRoute(frontendModel: string) {
  return async function POST(request: Request) {
    const baseUrl = backendBaseUrl()
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const contentType = safeString(request.headers.get('content-type'))
      if (!contentType || !contentType.toLowerCase().includes('multipart/form-data')) {
        logConvert('warn', 'Invalid content-type for convert route', {
          reqId,
          frontendModel,
          contentType: contentType || null,
        })
        return NextResponse.json(
          {
            error:
              'Invalid request content type. Expected multipart/form-data with fields `pdf` and optional `options`.',
          },
          { status: 400 },
        )
      }

      // Vercel/serverless request body limits are strict; fail early with clear guidance.
      // Do not enforce this in desktop runtime (Electron packaged app also runs in production mode).
      const isDesktopRuntime = Boolean(process.env.DESKTOP_APP_LOG_PATH)
      const enforceUploadLimit =
        process.env.ENFORCE_WEB_UPLOAD_LIMIT === '1' ||
        (!isDesktopRuntime && process.env.VERCEL === '1')
      const maxPdfBytes = Number(process.env.MAX_WEB_PDF_BYTES || 4_000_000)
      const contentLengthRaw = request.headers.get('content-length')
      const contentLength = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : NaN
      if (enforceUploadLimit && Number.isFinite(contentLength) && contentLength > maxPdfBytes) {
        return NextResponse.json(
          {
            error:
              `PDF is too large for web deployment upload proxy (${Math.ceil(contentLength / 1024 / 1024)}MB). ` +
              `Maximum supported here is about ${Math.floor(maxPdfBytes / 1024 / 1024)}MB. ` +
              'Use local Electron mode for larger files, or host backend separately and upload directly there.',
          },
          { status: 413 },
        )
      }
      // Do not parse multipart in Next packaged runtime; forward raw body to FastAPI.
      // This avoids undici/busboy parser crashes seen in packaged Electron mode.
      const rawBody = await request.arrayBuffer()
      const forwardHeaders: Record<string, string> = {
        'content-type': contentType,
      }
      const backendUrl = `${baseUrl}/convert/${encodeURIComponent(frontendModel)}`
      const backendTimeoutMs = Number(process.env.BACKEND_FETCH_TIMEOUT_MS || 900_000)
      const rawBuffer = Buffer.from(rawBody)
      let response:
        | { status: number; statusText: string; bodyText: string }
        | null = null
      let lastFetchError: unknown = null

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          response = await postBackendRaw(
            backendUrl,
            forwardHeaders,
            rawBuffer,
            backendTimeoutMs,
          )
          break
        } catch (error) {
          lastFetchError = error
          const errMessage = error instanceof Error ? error.message : String(error)
          logConvert('warn', 'Backend fetch attempt failed', {
            reqId,
            frontendModel,
            backendUrl: baseUrl,
            attempt,
            errMessage,
          })
          if (attempt < 2) {
            await delay(800)
            continue
          }
        }
      }

      if (!response) {
        const errMessage = lastFetchError instanceof Error ? lastFetchError.message : String(lastFetchError)
        throw new Error(`Backend request failed: ${errMessage}`)
      }

      const raw = response.bodyText
      let payload: Record<string, unknown> = {}
      if (raw) {
        try {
          payload = JSON.parse(raw)
        } catch {
          payload = { raw }
        }
      }

      if (response.status < 200 || response.status >= 300) {
        const detailCandidate = payload?.detail ?? payload?.error
        const detail =
          typeof detailCandidate === 'string'
            ? detailCandidate
            : detailCandidate
              ? stringifyUnknown(detailCandidate)
              : `Backend conversion failed (${response.status})`
        logConvert('error', 'Backend conversion returned non-OK status', {
          reqId,
          frontendModel,
          backendUrl: baseUrl,
          status: response.status,
          statusText: response.statusText,
          detail,
          rawSnippet: safeJsonSnippet(raw),
        })
        return NextResponse.json(
          {
            error:
              `${detail}. Backend URL: ${baseUrl}. ` +
              'If running on Vercel, run the model backend separately and set FASTAPI_BASE_URL. ' +
              'For local development, start FastAPI with: `npm run backend:dev`.',
            requestId: reqId,
          },
          { status: 502 },
        )
      }

      const markdown = typeof payload?.markdown === 'string' ? payload.markdown : ''
      const executionPayload =
        payload?.execution && typeof payload.execution === 'object'
          ? (payload.execution as Record<string, unknown>)
          : null
      const execution =
        executionPayload
          ? {
              requested_model: safeString(executionPayload.requested_model, frontendModel),
              engine_used: safeString(executionPayload.engine_used, safeString(payload?.model_id, frontendModel)),
              provider_used: safeString(executionPayload.provider_used, 'unknown'),
              fallback_used: Boolean(executionPayload.fallback_used),
              note: typeof executionPayload.note === 'string' ? executionPayload.note : null,
            }
          : {
              requested_model: frontendModel,
              engine_used: payload?.model_id || frontendModel,
              provider_used: 'unknown',
              fallback_used: false,
              note: null,
            }

      return NextResponse.json({
        markdown,
        segments: markdownToSegments(markdown),
        backendModel: payload?.model_id || frontendModel,
        execution,
        charts: normalizeCharts(payload),
        chart_execution:
          payload?.chart_execution && typeof payload.chart_execution === 'object'
            ? payload.chart_execution
            : {
                engine_used: 'none',
                fallback_used: false,
                note: 'Chart sidecar unavailable',
              },
        requestId: reqId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected conversion error'
      const stack = error instanceof Error ? error.stack : null
      logConvert('error', 'Unhandled conversion route error', {
        reqId,
        frontendModel,
        backendUrl: baseUrl,
        message,
        stack,
      })
      const enriched =
        `${message}. Backend URL: ${baseUrl}. ` +
        'The backend may be down, missing Python dependencies, or not reachable from this runtime.'
      return NextResponse.json(
        {
          error: enriched,
          requestId: reqId,
        },
        { status: 500 },
      )
    }
  }
}
