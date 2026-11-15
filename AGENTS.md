# Cub Spiele.Com — Agent Instructions (`AGENTS.md`)

See [GEMINI.md](./GEMINI.md) for the complete architecture, hardware invariants, and build commands for **Cub Spiele.Com** inside Google Antigravity.

## Quick Rules for Antigravity Agents
- **Emulator Name**: Always use **Cub Spiele.Com** (`CubSpieleCom.exe`) for application branding and release artifacts.
- **Audio**: Keep initial volume at `20%` (`0.2`). Never emit synthetic frontend button/touch UI click sounds—only authentic SM8521 hardware audio (`SGDA` `$004E` DAC, `SG0`/`SG1`/`SG2`, and BIOS audio clips).
- **Touch Screen**: Do not add touch pulse/ripple animations. Maintain the continuous **Touch Grid Visibility Slider (`0%–100%`)**.
- **Desktop Layout**: Default to **Screen-Only Mode** (compact view with `2×`/`3×`/`4×` integer scaling) and support **Touch View** (mobile-inspired button-only border controls) plus Light/Dark appearance from the top menu bar.
- **Verification**: Always run `npm run lint` (`tsc --noEmit`) and `npm run release:win` after modifying emulator core or UI files.
