# Tingyun Snipping Tool v0.1.3

## Release Pipeline Fixes
- CI release workflow now runs `npm run electron:icons` before packaging.
- macOS CI build now uses ad-hoc signing (`-c.mac.identity=-`) to reduce Gatekeeper "damaged" failures for unsigned artifacts.

## User-visible impact
- Correct app icon is embedded in release artifacts.
- macOS release artifacts are more likely to launch without quarantine/signature issues.
