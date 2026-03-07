#!/usr/bin/env node

const { existsSync } = require("fs")
const { join } = require("path")
const { spawnSync } = require("child_process")

exports.default = async function afterSign(context) {
  if (process.platform !== "darwin") return
  const productFilename = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${productFilename}.app`)
  if (!existsSync(appPath)) {
    console.warn(`[afterSign] App bundle not found at ${appPath}, skipping`)
    return
  }
  const signingMode = process.env.TINGYUN_SIGNING_MODE || "adhoc"
  if (signingMode === "official") {
    const verifyOfficial = spawnSync(
      "codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", appPath],
      { stdio: "inherit" }
    )
    if (verifyOfficial.status !== 0) {
      throw new Error(
        `[afterSign] official codesign verification failed with exit code ${verifyOfficial.status}`
      )
    }
    return
  }
  const result = spawnSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", appPath],
    { stdio: "inherit" }
  )
  if (result.status !== 0) {
    throw new Error(`[afterSign] codesign failed with exit code ${result.status}`)
  }
  const verify = spawnSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: "inherit" }
  )
  if (verify.status !== 0) {
    throw new Error(
      `[afterSign] codesign verification failed with exit code ${verify.status}`
    )
  }
}
