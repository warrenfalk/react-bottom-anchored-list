# Repository Guidelines

## Project Structure & Module Organization
`src/main.tsx` bootstraps the Vite demo app. `src/App.tsx` is the demo harness for prepend, append, and layout-change checks. `src/index.ts` is the package entrypoint. The core implementation lives in `src/components/BottomAnchoredList.tsx`. Shared demo styles live in `src/styles.css`. Root config lives in `package.json`, `tsconfig*.json`, and `vite.config.ts`. Do not commit `dist/`, `demo-dist/`, or `node_modules/`.

## Build, Test, and Development Commands
- `pnpm install` installs dependencies.
- `pnpm dev` starts the local Vite development server.
- `pnpm build` builds the library package into `dist/` and the demo into `demo-dist/`.
- `pnpm build:lib` builds ESM, CJS, and declarations from `src/index.ts`.
- `pnpm build:demo` runs `tsc -b` and creates a Vite demo bundle.
- `pnpm preview` serves the latest demo build locally.
- `nix develop` is optional and provides the pinned Node.js and `pnpm` toolchain from `flake.nix`.

Use `pnpm`, not `npm`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and React function components. Follow the existing style: 2-space indentation, semicolons, single quotes, and concise helpers. Use `PascalCase` for component files and `camelCase` for variables, hooks, and functions.

Match the repository’s domain terminology in code and comments:
- `older` / `newer` for source-array temporal direction
- `lower index` / `higher index` for exact array position
- `above` / `below` for visual position
- `tail` for the most recent item

Keep comments minimal and use them only where anchor restoration or scroll behavior is non-obvious.

## List Behavior Invariants
- Render only `items[renderedLowerIndex..tailIndex]`.
- Use reverse DOM order with `column-reverse`; the tail stays lowest.
- Anchor is either `end` or item mode. In item mode, the visually lowest visible item stays `bottomOffsetPx` below the viewport bottom, and `bottomOffsetPx >= 0`.
- If the tail becomes visible below, snap to `end`.
- If the oldest rendered item does not extend far enough above the viewport, decrease `renderedLowerIndex` to reveal older items.
- After any layout-affecting change, restore the current anchor.

## Testing Guidelines
No automated test runner is configured yet. `pnpm build` is the required verification step. For behavior-heavy updates, also check the demo manually: older-item reveal, tail snapping, and anchor restoration after layout changes. If you add tests, colocate them under `src/` using `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
Git history is minimal, so use short, imperative commit subjects such as `add anchor restore guard` or `rename rendered lower index`. Keep commits focused.

Pull requests should include a short summary, verification steps, and screenshots or GIFs for visible UI changes. Call out any changes to scroll anchoring, tail behavior, or rendered-window logic explicitly.
