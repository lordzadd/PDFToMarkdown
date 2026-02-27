import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = process.env.FASTAPI_BASE_URL || 'http://127.0.0.1:8000'

  try {
    const response = await fetch(`${baseUrl}/models`, { cache: 'no-store' })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`)
    }

    return NextResponse.json({ models: data })
  } catch {
    return NextResponse.json(
      {
        models: [
          { model_id: 'nougat', description: 'Nougat mode (backend unavailable).' },
          { model_id: 'gpt4v', description: 'GPT-4V mode (backend unavailable).' },
          { model_id: 'layoutlm', description: 'LayoutLM mode (backend unavailable).' },
          { model_id: 'markitdown', description: 'MarkItDown mode (backend unavailable).' },
          { model_id: 'docling', description: 'Docling mode (backend unavailable).' },
          { model_id: 'zerox', description: 'ZeroX mode (backend unavailable).' },
          { model_id: 'ocr-only', description: 'OCR-only mode (backend unavailable).' },
        ],
        warning: `Model backend unavailable at ${baseUrl}. Start FastAPI locally or configure FASTAPI_BASE_URL.`,
      },
      { status: 200 },
    )
  }
}
