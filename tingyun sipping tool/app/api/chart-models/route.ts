import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = process.env.FASTAPI_BASE_URL || 'http://127.0.0.1:8000'

  try {
    const response = await fetch(`${baseUrl}/chart-models`, { cache: 'no-store' })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`)
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      [
        {
          model_id: 'geometry-graph-v1',
          name: 'Geometry Graph v1',
          description: 'OpenCV-based node/edge geometry extraction from page images.',
          enabled: true,
          available: true,
          availability_note: `Chart backend unavailable at ${baseUrl}; using local fallback metadata.`,
        },
        {
          model_id: 'heuristic-graph-v1',
          name: 'Heuristic Graph v1',
          description: 'OCR-token heuristic with reconstructed graph preview.',
          enabled: true,
          available: true,
          availability_note: `Chart backend unavailable at ${baseUrl}; using local fallback metadata.`,
        },
        {
          model_id: 'conservative-v1',
          name: 'Conservative v1',
          description: 'Lower-risk chart extraction with conservative confidence.',
          enabled: true,
          available: true,
          availability_note: null,
        },
      ],
      { status: 200 },
    )
  }
}
