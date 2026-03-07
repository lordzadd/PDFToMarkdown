# Tingyun Snipping Tool on macOS (No Apple Developer Signing)

This app is currently distributed with ad-hoc signing (not Apple notarized), so macOS Gatekeeper may block first launch.

## Install Steps

1. Download the latest mac asset from Releases:
   - `Tingyun.Snipping.Tool-<version>-arm64-mac.zip` (recommended)
2. Unzip it.
3. Move `Tingyun Snipping Tool.app` to `/Applications`.
4. In Terminal, run:

```bash
xattr -dr com.apple.quarantine "/Applications/Tingyun Snipping Tool.app"
```

5. Open the app once using Finder:
   - Right-click `Tingyun Snipping Tool.app`
   - Click `Open`
   - Click `Open` again in the dialog

After this one-time trust step, normal launch should work.

## Notes

- If macOS still says the app is blocked, repeat the `xattr` command and reopen via right-click `Open`.
- If backend fails at startup, check logs at:
  - `~/Library/Application Support/my-v0-project/logs/desktop-app.log`
