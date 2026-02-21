#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { _electron: electron } = require('playwright')

const APP_DIR = path.resolve(__dirname, '..')
const PDF_PATH = process.env.E2E_PDF_PATH || '/Users/ritviksharma/Downloads/Memoire-JMBorello-1.pdf'
const FASTAPI_PORT = process.env.FASTAPI_PORT || '8014'
const FRONTEND_PORT = process.env.FRONTEND_PORT || '3000'
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || `http://127.0.0.1:${FASTAPI_PORT}`
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`
const OUT_DIR = path.join(APP_DIR, 'output', 'electron-ui-pass')
const SAVE_DIR = path.join(OUT_DIR, 'downloads')
const REPORT_PATH = path.join(OUT_DIR, 'report.json')

const MODEL_LABELS = [
  { id: 'paddleocr', label: 'PaddleOCR (China)' },
  { id: 'doctr-eu', label: 'docTR (Europe)' },
  { id: 'layoutlm', label: 'LayoutLM' },
  { id: 'markitdown', label: 'MarkItDown (Microsoft)' },
  { id: 'docling', label: 'Docling' },
  { id: 'zerox', label: 'ZeroX (OmniAI)' },
]

function startProcess(name, cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd: APP_DIR,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (buf) => process.stdout.write(`[${name}] ${buf}`))
  child.stderr.on('data', (buf) => process.stderr.write(`[${name}] ${buf}`))
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[${name}] exited with code ${code}`)
    }
  })

  return child
}

function cleanupPorts() {
  const cleanup = spawn('bash', ['-lc', `lsof -tiTCP:${FASTAPI_PORT} -sTCP:LISTEN | xargs -I{} kill -9 {} 2>/dev/null || true; lsof -tiTCP:${FRONTEND_PORT} -sTCP:LISTEN | xargs -I{} kill -9 {} 2>/dev/null || true`], {
    cwd: APP_DIR,
    stdio: 'ignore',
  })
  return new Promise((resolve) => cleanup.on('exit', () => resolve()))
}

async function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.ok) return
    } catch (_) {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function clickToolbarIcon(page, iconClass) {
  const button = page.locator(`button:has(svg.${iconClass})`).first()
  await button.waitFor({ timeout: 5000 })
  await button.click({ timeout: 5000 })
}

async function openPdfViaToolbar(page) {
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles({
    name: path.basename(PDF_PATH),
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(PDF_PATH),
  })
  await page.getByRole('button', { name: 'Convert to Markdown' }).waitFor({ timeout: 30000 })
}

async function setModel(page, label) {
  await clickToolbarIcon(page, 'lucide-settings')

  await page.getByRole('dialog').getByRole('heading', { name: /Settings/ }).waitFor({ timeout: 10000 })
  await page.getByLabel(label).click({ timeout: 5000 })
  await page.getByRole('button', { name: 'Save Settings' }).click({ timeout: 5000 })
}

async function runConvertAndCapture(page, modelId) {
  console.log(`[ui] converting model=${modelId}`)
  await page.getByRole('button', { name: 'Convert to Markdown' }).click({ timeout: 5000 })
  await page.getByText(/Converted (Markdown|LaTeX)/).first().waitFor({ timeout: 300000 })
  await page.getByRole('tab', { name: 'MARKDOWN' }).click({ timeout: 5000 })
  await page.getByText('Converted Markdown').waitFor({ timeout: 10000 })

  const executionText = (await page.locator('text=/Execution:/').first().textContent().catch(() => '')) || ''
  const markdown = (await page.locator('textarea').first().inputValue().catch(() => '')) || ''

  await page.getByRole('button', { name: /Download Markdown/ }).click({ timeout: 10000 })

  const defaultSaved = path.join(SAVE_DIR, `${path.basename(PDF_PATH, '.pdf')}.md`)
  const targetSaved = path.join(SAVE_DIR, `${modelId}.md`)

  const deadline = Date.now() + 10000
  while (Date.now() < deadline && !fs.existsSync(defaultSaved)) {
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!fs.existsSync(defaultSaved)) {
    throw new Error(`Download file not found for model ${modelId}`)
  }
  fs.copyFileSync(defaultSaved, targetSaved)

  return {
    modelId,
    executionText,
    markdownLength: markdown.length,
    markdownPreview: markdown.slice(0, 240),
    savePath: targetSaved,
    hasExpectedKeyword: /memoire|borello|universit|france|table|chapitre|introduction/i.test(markdown),
  }
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`PDF not found: ${PDF_PATH}`)
  }

  fs.mkdirSync(SAVE_DIR, { recursive: true })
  await cleanupPorts()

  const backend = startProcess('backend', 'npm', ['run', 'backend:dev'], { FASTAPI_PORT })
  const frontend = startProcess('frontend', 'npm', ['run', 'dev', '--', '--port', FRONTEND_PORT], { FASTAPI_BASE_URL })

  const cleanup = async () => {
    for (const p of [backend, frontend]) {
      if (p && !p.killed) {
        p.kill('SIGTERM')
      }
    }
  }

  process.on('SIGINT', async () => {
    await cleanup()
    process.exit(1)
  })

  try {
    await waitForUrl(`${FASTAPI_BASE_URL}/health`)
    await waitForUrl(FRONTEND_URL)

    const electronApp = await electron.launch({
      args: ['.'],
      cwd: APP_DIR,
      env: {
        ...process.env,
        ELECTRON_START_URL: FRONTEND_URL,
        FASTAPI_BASE_URL,
        E2E_OPEN_FILE_PATH: PDF_PATH,
        E2E_SAVE_DIR: SAVE_DIR,
        ELECTRON_DISABLE_DEVTOOLS: '1',
      },
    })

    const page = await electronApp.firstWindow()
    const dialogs = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })

    await page.getByText('Tingyun Snipping Tool - Snip Create').waitFor({ timeout: 30000 })

    const openFileResult = await page.evaluate(async () => {
      if (!window.electron?.fileSystem?.openFile) {
        return null
      }
      const result = await window.electron.fileSystem.openFile()
      return result ? { name: result.name, path: result.path, dataLen: result.data?.length || 0 } : null
    })

    const report = {
      timestamp: new Date().toISOString(),
      pdfPath: PDF_PATH,
      electronOpenFileResult: openFileResult,
      models: [],
      dialogs,
    }

    for (const model of MODEL_LABELS) {
      try {
        console.log(`[ui] start model=${model.id}`)
        await openPdfViaToolbar(page)
        console.log(`[ui] pdf loaded model=${model.id}`)
        await setModel(page, model.label)
        console.log(`[ui] model selected model=${model.id}`)
        const result = await runConvertAndCapture(page, model.id)
        report.models.push({ ...result, ok: true })
        console.log(`[ui] done model=${model.id}`)
      } catch (error) {
        report.models.push({
          modelId: model.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
        console.error(`[ui] failed model=${model.id}`, error)
      }
    }

    await electronApp.close()
    await cleanup()

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
    console.log(`Wrote report: ${REPORT_PATH}`)
  } catch (error) {
    await cleanup()
    throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
