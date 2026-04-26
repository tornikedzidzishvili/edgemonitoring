---
name: JSX in alerts pipeline — rename .ts to .tsx
description: When a .ts file needs JSX (e.g. react-email render calls), rename it to .tsx — don't extract a helper
type: feedback
---

Files that call `render(<Component />)` from @react-email/render must be `.tsx`, not `.ts`. TypeScript will error on JSX syntax in plain `.ts` files even with `jsx: "react-jsx"` in tsconfig.

**Why:** alerts.ts needed JSX for the three render() call sites added in EMS-7 — renaming to alerts.tsx was the right fix. Extracting a separate renderEmails.tsx helper would add indirection without benefit.

**How to apply:** Any time a server-side file uses JSX for email rendering, name it `.tsx`. The `moduleResolution: Bundler` config resolves `./alerts.js` imports back to `alerts.tsx` source correctly — no import path changes needed in callers.
