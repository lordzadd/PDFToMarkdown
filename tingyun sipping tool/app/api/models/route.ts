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

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      [
        { model_id: 'layoutlm', description: 'LayoutLM mode (backend unavailable).', enabled: true, available: true },
        { model_id: 'markitdown', description: 'MarkItDown mode (backend unavailable).', enabled: true, available: true },
        { model_id: 'docling', description: 'Docling mode (backend unavailable).', enabled: true, available: true },
        { model_id: 'doctr-eu', description: 'docTR mode (backend unavailable).', enabled: true, available: true },
        { model_id: 'zerox', description: 'ZeroX mode (backend unavailable).', enabled: true, available: true },
        { model_id: 'ocr-only', description: 'OCR-only mode (backend unavailable).', enabled: true, available: true },
      ],
      { status: 200 },
    )
  }
}
