import { createModelRoute } from '../_lib/handler'

// Backward compatibility alias: donut endpoint now maps to MarkItDown.
export const POST = createModelRoute('markitdown')
