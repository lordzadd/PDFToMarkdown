import { NextResponse } from 'next/server'
import fs from 'fs'

type SegmentType = 'title' | 'header' | 'paragraph' | 'table' | 'equation'

type Segment = {
  id: number
  type: SegmentType
  content: string
  confidence: number
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

      const formData = await request.formData()
      const pdf = formData.get('pdf')
      const options = formData.get('options')

      if (!(pdf instanceof File)) {
        return NextResponse.json({ error: 'No PDF uploaded in field `pdf`.' }, { status: 400 })
      }

      // Vercel serverless request body limits are strict; fail early with clear guidance.
      // Keep this guard scoped to hosted/serverless deployments so local Electron stays unrestricted.
      const enforceUploadLimit =
        process.env.ENFORCE_WEB_UPLOAD_LIMIT === '1' ||
        process.env.VERCEL === '1' ||
        process.env.NODE_ENV === 'production'
      const maxPdfBytes = Number(process.env.MAX_WEB_PDF_BYTES || 4_000_000)
      if (enforceUploadLimit && pdf.size > maxPdfBytes) {
        return NextResponse.json(
          {
            error:
              `PDF is too large for web deployment upload proxy (${Math.ceil(pdf.size / 1024 / 1024)}MB). ` +
              `Maximum supported here is about ${Math.floor(maxPdfBytes / 1024 / 1024)}MB. ` +
              'Use local Electron mode for larger files, or host backend separately and upload directly there.',
          },
          { status: 413 },
        )
      }

      const backendForm = new FormData()
      backendForm.append('file', pdf, pdf.name || 'upload.pdf')
      if (typeof options === 'string' && options.trim()) {
        try {
          const parsedOptions = JSON.parse(options)
          if (!parsedOptions || typeof parsedOptions !== 'object' || Array.isArray(parsedOptions)) {
            throw new Error('options must be a JSON object')
          }
          backendForm.append('options', JSON.stringify(parsedOptions))
        } catch (error) {
          const optionError = error instanceof Error ? error.message : String(error)
          logConvert('warn', 'Invalid options payload', {
            reqId,
            frontendModel,
            optionError,
            optionsSnippet: safeJsonSnippet(options, 300),
          })
          return NextResponse.json(
            {
              error: `Invalid \`options\` JSON payload: ${optionError}`,
            },
            { status: 400 },
          )
        }
      }

      const response = await fetch(`${baseUrl}/convert/${encodeURIComponent(frontendModel)}`, {
        method: 'POST',
        body: backendForm,
      })

      const raw = await response.text()
      let payload: Record<string, unknown> = {}
      if (raw) {
        try {
          payload = JSON.parse(raw)
        } catch {
          payload = { raw }
        }
      }

      if (!response.ok) {
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
