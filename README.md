<p align="center">
  <img src="logo.png" alt="asyncapi-cable" width="200">
</p>

<h1 align="center">asyncapi-cable</h1>

<p align="center">
  Generate typed <a href="https://docs.anycable.io">AnyCable</a> channel clients from an
  <strong>AsyncAPI 3.0</strong> document. Produces platform-agnostic channel classes +
  message types (usable on web <em>and</em> React Native) plus a thin, framework-specific
  wrapper (Vue composables or React hooks).
</p>

The "[Orval](https://orval.dev) for cable" — point it at your AsyncAPI cable
document and get end-to-end typed real-time clients, the same way Orval turns an
OpenAPI spec into a typed REST client.

## Two packages, one contract

This repository ships both ends of the cable contract:

| Package | Path | What it does |
|---------|------|--------------|
| npm **`asyncapi-cable`** | `/` | Generates typed AnyCable clients *from* an AsyncAPI 3 document |
| gem **`asyncapi_cable`** | [`ruby/`](ruby) | Generates that document *from* your Rails ActionCable channels, and validates broadcast payloads against it at runtime |

They are released independently — the gem writes the document, the npm package
consumes it — and neither requires the other. The gem pairs with
[`openapi-ruby`](https://github.com/openapi-ruby/openapi-ruby), sharing its
schema-component registry so one component can appear in both the OpenAPI and
the AsyncAPI document.

## Key Features

- **AsyncAPI 3.0 → typed AnyCable clients** — channel classes + message payload types generated from your cable document
- **Platform-agnostic core** — the channel classes + models depend only on `@anycable/core`, so they run on web *and* React Native
- **Vue & React presets** — per-target `preset` emits Vue composables (`onScopeDispose`) or React hooks (`useEffect`); only the runtime + wrapper differ
- **Typed payloads** — message types generated via [`@asyncapi/modelina`](https://github.com/asyncapi/modelina), preserving snake_case wire keys
- **Typed payloads behind a JSON string** — a `payload` declared as a string with `contentSchema` gets its decoded model generated plus a `parseXPayload` helper, so the cast lives in one place instead of at every call site
- **Single cable seam** — only `runtime.ts` imports your AnyCable instance ([Orval-mutator](https://orval.dev/guides/custom-client) style), configurable per target
- **Multi-target config** — one `cable.config.mjs` (analog of `orval.config.ts`) generates many documents at once
- **Vendor extensions** — `x-actioncable-channel` maps to the Rails channel identifier; `x-client-supplied: false` marks server-derived params

## Requirements

- Node >= 20
- An AsyncAPI 3.0 cable document
- In the consuming app: `@anycable/core`, plus `vue` (vue preset) or `react` (react preset)

## Install

```bash
pnpm add -D asyncapi-cable
# the generated code imports these in the consuming app:
pnpm add @anycable/core        # + vue (vue preset) or react (react preset)
```

## Usage

Add a `cable.config.mjs` (analog of `orval.config.ts`):

```js
export default {
  cableInternalV1: {
    input: "asyncapi/cable_internal.yaml",
    output: {
      target: "src/services/cableInternalV1",
      // the "mutator": a file exporting your AnyCable instance getter
      cable: { path: "../cableClient", name: "getCable" },
      preset: "vue", // or "react"
    },
  },
};
```

Then run:

```bash
pnpm exec asyncapi-cable -c cable.config.mjs
```

The config is a map of *target name* → target. Each target:

| Key | Required | Description |
|-----|----------|-------------|
| `input` | ✓ | Path to a local AsyncAPI 3.0 document (resolved from the cwd), or an `http(s)` URL to fetch it from (e.g. a backend that serves the contract) |
| `output.target` | ✓ | Directory for the generated code — **wiped and rebuilt** on each run |
| `output.cable.path` | | Import path (from `runtime.ts`) to the file exporting your AnyCable getter |
| `output.cable.name` | | Named export of that getter (defaults to a built-in seam if `cable` is omitted) |
| `output.preset` | | `"vue"` (default) or `"react"` |

## What it emits

```
<output.target>/
  models/*.ts        message payload types + enums (via @asyncapi/modelina)
                     — an enum is a string literal union, assignable to the
                     one an OpenAPI client writes for the same component
  channels/*.ts      class XChannel extends Channel<Params, Message>
                     — depends ONLY on @anycable/core (web + React Native)
  runtime.ts         the preset's subscribe/lifecycle helper — the ONLY file
                     importing your cable mutator (output.cable)
  composables/*.ts   per-channel useXChannel(handlers)  (Vue composable / React hook)
  index.ts           barrel
```

The channel classes and message types are **shared across presets**; only
`runtime.ts` and the per-channel wrapper differ (`vue` → composable with
`onScopeDispose`; `react` → hook with `useEffect`).

### The cable mutator

`output.cable` points at a file in your app that exports the AnyCable instance
(the one seam the generated code imports), e.g.:

```ts
// src/cableClient.ts
import { createCable } from "@anycable/web"; // or @anycable/core in React Native
let cable;
export function getCable() {
  return (cable ??= createCable(/* url */));
}
```

## Document extensions

The generator reads two vendor extensions from the AsyncAPI document:

- `x-actioncable-channel` on a channel → the Rails channel class name used as
  the AnyCable `static identifier`.
- `x-client-supplied: false` on a parameter → server-derived, so it's omitted
  from the channel's client-supplied params.

## Programmatic API

```js
import { generateAll, generateOne } from "asyncapi-cable";
await generateAll(config, process.cwd());
```

## Requirements

Node >= 20. AsyncAPI 3.0 input.

## Releasing

Releases are automated with
[release-please](https://github.com/googleapis/release-please). Land commits on
`main` using [Conventional Commits](https://www.conventionalcommits.org)
(`feat:` → minor, `fix:` → patch); release-please opens a "release" PR that bumps
the version and updates the changelog. Merging that PR tags the release and
publishes to npm — no stored `NPM_TOKEN`; publishing uses npm
[Trusted Publishing](https://docs.npmjs.com/trusted-publishers) via GitHub
Actions OIDC.

### Merge queue

`ci.yml` listens on `merge_group` as well as `pull_request`. A queued entry is
tested against a merge-group ref, so a required check that only runs on
`pull_request` never reports there and the entry is dropped when the queue's
check timeout expires.

### Component scoping

The root package covers the npm generator and the `ruby` package covers the
gem. A package path of `.` matches every commit, so the root entry carries
`exclude-paths: ["ruby"]` — without it, a gem-only change would also cut an npm
release with a changelog full of Ruby entries.

`last-release-sha` marks where the gem was imported. The commits that came in
with `git subtree` carry root-level paths from before the import, so the root
package would otherwise keep proposing a release for changes that never
touched the npm side — and `exclude-paths` cannot filter them, because those
paths really were at the root when the commits were written.

### Repository settings this depends on

The `openapi-ruby` organization does not let `GITHUB_TOKEN` open pull requests,
so release-please authenticates with a **`RELEASE_PLEASE_TOKEN`** repository
secret (a PAT with `contents` + `pull-requests` write). Without it the release
job runs and quietly raises no release PR. Repository settings do **not**
survive a transfer between organizations — after a move, re-check this secret,
the branch ruleset, and both trusted publishers.

### npm

Trusted Publishing can only be configured on a package that already exists on
npm, so the **first** publish must be done manually:

```bash
npm publish --access public
```

Then, on the package's npm page → **Settings → Publishing access**, add a
GitHub Actions trusted publisher:

- Organization/user: `openapi-ruby`
- Repository: `asyncapi-cable`
- Workflow filename: `release-please.yml`
- Environment: *(leave blank)*

After this, every merged release PR publishes automatically.

If a publish job was skipped but the release and tag exist, run the **Release**
workflow manually and pick the package under `publish` — that republishes the
tagged version instead of forcing a new one.

### RubyGems

No manual first push: RubyGems supports a **pending** trusted publisher for a
gem that does not exist yet. Create it at
[rubygems.org/profile/oidc/pending_trusted_publishers](https://rubygems.org/profile/oidc/pending_trusted_publishers):

- Gem name: `asyncapi_cable`
- Repository owner: `openapi-ruby`
- Repository name: `asyncapi-cable`
- Workflow filename: `release-please.yml`
- Environment: `rubygems`

The first successful push from that workflow creates the gem and converts the
entry into a normal trusted publisher.

A trusted publisher is bound to one `organization/repository` pair, so
**transferring the repository invalidates it** on both registries — automated
publishing fails until each entry is pointed at the new owner.

A trusted publisher is bound to one `organization/repository` pair, so
**transferring the repository invalidates it** — automated publishing fails
until the entry is pointed at the new owner. Update it on the npm package page
in the same sitting as the transfer.

## License

MIT
