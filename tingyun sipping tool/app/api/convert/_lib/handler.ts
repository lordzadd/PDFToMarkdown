import { NextResponse } from 'next/server'

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
    try {
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
        backendForm.append('options', options)
      }

      const response = await fetch(`${backendBaseUrl()}/convert/${encodeURIComponent(frontendModel)}`, {
        method: 'POST',
        body: backendForm,
      })

      const raw = await response.text()
      const payload = raw ? JSON.parse(raw) : {}

      if (!response.ok) {
        const detail = payload?.detail || payload?.error || `Backend conversion failed (${response.status})`
        return NextResponse.json(
          {
            error:
              `${detail}. If running on Vercel, run the model backend separately and set FASTAPI_BASE_URL. ` +
              'For local development, start FastAPI with: `npm run backend:dev`.',
          },
          { status: 502 },
        )
      }

      const markdown = typeof payload?.markdown === 'string' ? payload.markdown : ''
      const execution =
        payload?.execution && typeof payload.execution === 'object'
          ? {
              requested_model: payload.execution.requested_model || frontendModel,
              engine_used: payload.execution.engine_used || payload?.model_id || frontendModel,
              provider_used: payload.execution.provider_used || 'unknown',
              fallback_used: Boolean(payload.execution.fallback_used),
              note: typeof payload.execution.note === 'string' ? payload.execution.note : null,
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
      })
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Unexpected conversion error',
        },
        { status: 500 },
      )
    }
  }
}
