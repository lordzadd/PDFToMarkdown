# Tingyun Snipping Tool v0.1.1

## Highlights
- Added dedicated chart model infrastructure with backend endpoint `GET /chart-models`.
- Added selectable chart-model settings in the UI (separate from OCR model settings).
- Added new chart model: `geometry-graph-v1` (OpenCV-based topology extraction for graph-like screenshots/PDF pages).
- Kept OCR markdown/LaTeX pipeline unchanged; chart extraction remains additive.

## Chart Pipeline Changes
- Conversion endpoint now accepts `options.chartModel` and executes chart extraction with model-specific routing.
- New chart models:
  - `geometry-graph-v1`: geometry-aware graph extraction (preferred)
  - `heuristic-graph-v1`: OCR token heuristic
  - `conservative-v1`: low-hallucination variant
- Added chart execution metadata propagation (`chart_execution`) end-to-end.

## Validation and Safety
- Added chart normalization and schema validation in Next API conversion handler.
- Added explicit malformed/schema-mismatch handling for chart payloads.
- Token-inferred graph topology is now flagged as unverified (`inferred-edges`, `topology-unverified`) and surfaced as non-valid export state.
- CHARTS tab now shows chart flags for manual QA.

## API/UI Reliability
- Added `/api/chart-models` proxy route.
- Fixed `/api/models` response shape to return a direct array expected by frontend runtime metadata loading.
- Updated web smoke script model matrix and stability for current adapters.

## Build/Packaging
- Verified mac artifacts for this version:
  - `Tingyun Snipping Tool-0.1.1-arm64.dmg`
  - `Tingyun Snipping Tool-0.1.1-arm64-mac.zip`
