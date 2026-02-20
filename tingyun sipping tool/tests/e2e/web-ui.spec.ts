import { expect, test } from "@playwright/test"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import fs from "node:fs/promises"
import path from "node:path"

async function createSamplePdf(filePath: string, title: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([612, 792])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  page.drawText(title, { x: 72, y: 740, size: 20, font, color: rgb(0, 0, 0) })
  page.drawText("Automated Playwright OCR smoke content.", { x: 72, y: 700, size: 14, font, color: rgb(0, 0, 0) })
  const pdfBytes = await pdfDoc.save()
  await fs.writeFile(filePath, pdfBytes)
}

async function openSettings(page: Parameters<typeof test>[0]["page"]) {
  await page.locator("button:has(svg.lucide-settings)").last().click()
  await expect(page.getByText("Configure your PDF to Markdown conversion settings")).toBeVisible()
}

async function selectModel(page: Parameters<typeof test>[0]["page"], modelName: string) {
  await openSettings(page)
  await page.getByRole("radio", { name: modelName }).click()
  await page.getByRole("button", { name: "Save Settings" }).click()
}

async function uploadPdf(page: Parameters<typeof test>[0]["page"], pdfPath: string, fileName: string) {
  const chooser = page.locator('input[type="file"][accept="application/pdf"]')
  await chooser.setInputFiles(pdfPath)
  await expect(page.getByText(fileName)).toBeVisible()
}

test("web ui functions and model conversions", async ({ page }, testInfo) => {
  await page.goto("/")

  await expect(page.getByText("Tingyun Snipping Tool - Snip Create")).toBeVisible()
  await expect(page.getByRole("tab", { name: "LATEX" })).toHaveAttribute("aria-selected", "true")

  await page.getByRole("tab", { name: "MARKDOWN" }).click()
  await expect(page.getByRole("tab", { name: "MARKDOWN" })).toHaveAttribute("aria-selected", "true")
  await page.getByRole("tab", { name: "LATEX" }).click()
  await expect(page.getByRole("tab", { name: "LATEX" })).toHaveAttribute("aria-selected", "true")

  await page.locator("button:has(svg.lucide-history)").click()
  await expect(page.getByRole("heading", { name: "Previous Uploads" })).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()

  await openSettings(page)
  await page.getByRole("tab", { name: "Quality" }).click()
  await expect(page.getByText("Quality Level")).toBeVisible()
  await page.getByRole("tab", { name: "Segmentation" }).click()
  await expect(page.getByText("Document Segmentation")).toBeVisible()
  await page.getByRole("button", { name: "Save Settings" }).click()

  const models: Array<{ id: string; label: string; expectedPattern: RegExp }> = [
    { id: "paddleocr", label: "PaddleOCR (China)", expectedPattern: /Execution:.*requested paddleocr, ran (paddleocr|ocr-only)/ },
    { id: "doctr-eu", label: "docTR (Europe)", expectedPattern: /Execution:.*requested doctr-eu, ran (doctr-eu|ocr-only)/ },
    { id: "layoutlm", label: "LayoutLM", expectedPattern: /Execution:.*requested layoutlm, ran (layoutlm|ocr-only)/ },
    { id: "donut", label: "Donut", expectedPattern: /Execution:.*requested donut, ran donut/ },
    { id: "docling", label: "Docling", expectedPattern: /Execution:.*requested docling, ran (docling|ocr-only)/ },
  ]

  for (const model of models) {
    await test.step(`convert with ${model.id}`, async () => {
      await selectModel(page, model.label)

      const fileName = `sample-${model.id}.pdf`
      const filePath = path.join(testInfo.outputDir, fileName)
      await createSamplePdf(filePath, `Playwright ${model.id.toUpperCase()} test`)

      await uploadPdf(page, filePath, fileName)

      await page.getByRole("button", { name: "Convert to Markdown" }).click()

      await expect(page.getByText(model.expectedPattern)).toBeVisible({ timeout: 300_000 })
      await expect(page.getByRole("heading", { name: "Document Segments" })).toBeVisible()
      await expect(page.getByRole("button", { name: /Download (Markdown|LaTeX)/ })).toBeVisible()
    })
  }

  await page.getByRole("tab", { name: "MARKDOWN" }).click()
  await expect(page.getByRole("button", { name: "Download Markdown" })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Markdown" }).click(),
  ])
  expect(await download.suggestedFilename()).toContain(".md")

  await page.locator("button:has(svg.lucide-trash2)").click()
  await expect(page.getByText("Click the document icon in the toolbar to upload a PDF")).toBeVisible()
})
