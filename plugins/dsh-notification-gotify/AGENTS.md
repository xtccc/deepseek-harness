# AGENTS.md

Standing orders for this package. The product contract lives in [README.md](README.md); these rules govern how it is changed.

## Layout

- `src/` — TypeScript source. `src/index.ts` is the host plugin (config schema + `session/event` subscription); `src/watcher.ts` folds session events into push intents (completed / failed / interrupted / question, with the question debounce); `src/gotify.ts` is the serialized Gotify HTTP client; `src/contract.ts` and `src/types.ts` are the shared host types. There is no browser half.
- `lib/` — committed build artifacts. The harness profile resolves `main` from here; **every source change that should be installable must rebuild and commit `lib/` in the same commit**.
- `tests/` — vitest suites importing internals by relative path.

## Build and checks

- `pnpm run typecheck`, `pnpm run test`, `pnpm run build` — all three must be green before a commit claims completion; `pnpm run check` runs them in order.
- The watcher fold (`src/watcher.ts`) is pure apart from injected send/schedule effects and is unit-tested; the composition spec proves the subscription + fold + push chain over the real `SessionStore` (only the fetch transport is faked).
- Test fixtures build events with the real constructors (`createAssistantMessage`, `createToolResultMessage`). A hand-written message literal plus a cast hides exactly the field mistakes these suites exist to catch.

## Commit discipline

- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `chore:`) with a body explaining what and why for non-trivial changes.
- One concern per commit: host behavior, build tooling, docs, and test fixes land separately.
- Never commit credentials (Gotify tokens included), `node_modules/`, or logs.

## Integration

- The plugin lives in the DeepSeek Harness checkout at `plugins/dsh-notification-gotify` and mounts into a dsh profile as a bundle: the profile's `package.json` links this directory, its `dsh.profile.bundles` lists `dsh-notification-gotify`, and `dsh.bundle.patch` inserts the single host row.
- No harness change is required: the host subscribes to the `session/event` firehose (the same seam the session-projection registry drives) and POSTs to Gotify; there is no client bundle and no settings UI.
- Configuration lives in the profile's `cordis.yml` plugin row (`baseUrl`, `appToken`, per-kind toggles and priorities). Host plugin-set changes take effect on server restart.
- Dev-time `link:` dependencies resolve against the surrounding checkout (`../../packages/...`, `../../vendor/...`). When that checkout moves to a new snapshot, re-run `pnpm install`, `pnpm run check`, and fix API drift before integrating.
