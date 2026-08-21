# X-IDE Agent Guide

This repository is a VS Code fork that replaces the GitHub Copilot model and authentication path with a bundled Codex runtime while retaining VS Code's chat, agent UI and tool surface. Read [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for the upstream VS Code architecture and coding rules; this file documents the fork-specific state and decisions.

## Product Direction

- Codex is not an additional provider in this fork. It occupies the existing Copilot model slot so VS Code's native chat and agent UI continue to work.
- The only published model is `gpt-5.6-luna`, displayed as **GPT-5.6 Luna** with provider detail **Codex**.
- GitHub authentication, Copilot entitlement and Copilot quotas must never gate Luna, the model picker or chat activation.
- Codex account authentication is the sole hosted-model authentication flow. Use the bundled Codex CLI's `login`, `login status` and `logout` commands.
- Do not introduce OpenAI API-key billing or require the Codex app server.
- Agent tools should ultimately use Codex-native structured execution. The current prompt-encoded Copilot tool protocol is transitional and must not be expanded as the long-term architecture.
- Autocomplete must remain fast and usable without paid inference. It combines a deterministic repository-aware engine with optional small local Ollama FIM inference.

## Current Architecture

### Codex runtime and authentication

- `extensions/copilot/src/platform/codex/common/codexService.ts` defines `ICodexService` and the Luna model ID.
- `extensions/copilot/src/platform/codex/node/codexService.ts` locates the bundled platform-specific Codex executable, manages login/logout, starts SDK threads and maps streamed events into VS Code language-model response parts.
- `extensions/copilot/src/extension/extension/vscode-node/services.ts` registers `CodexService`; tests use `NullCodexService`.
- `extensions/copilot/src/extension/authentication/vscode-node/authentication.contribution.ts` registers `github.copilot.codex.signIn`, `github.copilot.codex.signOut` and `github.copilot.codex.showLoginStatus`.
- The bundled SDK is `@openai/codex-sdk` 0.149.0. Platform binaries are optional dependencies packaged by `.esbuild.mts`.

### Chat and model routing

- `languageModelAccess.ts` publishes Luna as the sole model under the `copilot` vendor ID. The vendor ID is a compatibility shell, not the transport or authentication provider.
- `conversationFeature.ts` activates when the Codex runtime is available; a Copilot token is not required.
- `endpointProviderImpl.ts` resolves Luna through `ExtensionContributedChatEndpoint`, which returns to the registered language-model provider and therefore `CodexService` instead of CAPI.
- Main replies, titles, summaries, dictation cleanup and internal utility-model work all resolve to Luna. They must not call `ModelMetadataFetcher` or mint a GitHub token.
- The model picker sends unauthenticated users to the Codex sign-in command and uses Codex wording.
- GitHub Cloud Agent/Copilot CLI session contributions, GitHub first-run setup and GitHub sign-in UI are intentionally disabled or removed.

### Transitional tool bridge

The current implementation serialises VS Code/Copilot tool descriptions into `<copilot_tool_protocol>` text, asks Codex to emit `<copilot_tool_call>` JSON envelopes and parses those envelopes back into `LanguageModelToolCallPart`. This is a compatibility bridge, not native tool support.

Known limitations:

- Prompt text is being used as a transport protocol, so schema adherence is probabilistic.
- Codex native command, filesystem and patch tools are enabled inside the workspace sandbox. Completed command, file-change and MCP events are surfaced as structured thinking/progress activity.
- Intermediate Codex `agent_message` narration is suppressed; only concise structured activity and the final message are rendered. Tool-call envelopes remain responses so VS Code can execute them. Never expose raw reasoning or full shell commands as chat progress.
- Native `file_change` completion explicitly refreshes the Files Explorer because Codex writes outside VS Code's file service and filesystem watcher delivery can otherwise leave the tree visually stale.
- Desktop windows confirm before closing by default. Clicking a window close button uses the explicit “Are you sure you want to close the window?” prompt.
- **File** is a two-choice gateway: **Open User Settings** opens a centred graphical settings editor with Appearance, local Autocomplete, Auto Save and Advanced cards; **Continue to Old Menu** exposes the traditional full File menu.
- A new SDK thread is created for each language-model request, so VS Code owns conversation continuity through replayed messages rather than a persistent Codex thread.
- Every SDK thread sets `skipGitRepoCheck: true` because VS Code supports ordinary folders and loose files, not only Git repositories.
- `sandboxMode: 'workspace-write'` and `approvalPolicy: 'never'` allow native edits inside the opened workspace while preventing unsandboxed writes. Network access remains disabled by default.

The intended replacement is a structured adapter that maps Codex `command_execution`, `file_change`, `mcp_tool_call`, reasoning and todo events into VS Code's agent UI. VS Code-specific tools still require a permission-safe bridge: `ProvideLanguageModelChatResponseOptions` supplies schemas but not the caller's tool-invocation token, so the language-model provider must not invoke protected host tools behind the caller's back. Do not merely add more system-prompt instructions or regex envelopes.

### Local autocomplete

- `localRepositoryAutocomplete.ts` maintains a deterministic repository-aware completion index.
- `localCompletionsFetcher.ts` integrates local results into the Copilot completions bridge.
- `ollamaFimCompletion.ts` optionally queries a small local Ollama fill-in-the-middle model and falls back cleanly when Ollama is unavailable.
- Autocomplete must have a low-latency deterministic path; local model inference is an optional quality layer, never a hard dependency.
- Local autocomplete activation and its status controls do not depend on a GitHub/Copilot token. The `github.copilot.activated` context reflects the registered local provider, and the status dashboard must not advertise GitHub sign-in as a prerequisite.

### Workbench UI

- An empty workspace displays central, functional **Open Folder** and **Open File** actions in the editor watermark.
- The upstream startup/getting-started contribution that displaced this surface is disabled.
- Chat setup/sign-in onboarding is stripped down so GitHub sign-in is not presented.
- Development launchers always load `extensions/copilot` via `--extensionDevelopmentPath`.

## Important Files

- `extensions/copilot/src/platform/codex/` — Codex service, executable resolution and tests.
- `extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts` — Luna publication and direct Codex response path.
- `extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts` — selected/utility endpoint routing.
- `extensions/copilot/src/extension/completions/` — deterministic and Ollama-assisted autocomplete.
- `src/vs/workbench/browser/parts/editor/editorGroupWatermark.ts` — empty-workspace actions.
- `src/vs/workbench/contrib/chat/browser/widget/input/modelPicker/` — model picker authentication UX.
- `src/vs/workbench/contrib/preferences/browser/friendlySettingsEditor*` — centred user-facing settings surface and functional autocomplete/Auto Save controls.
- `scripts/code.bat` and `scripts/code.sh` — development launch with the local Copilot extension.

## Build and Validation

The main application and the Copilot extension have separate build paths.

From `extensions/copilot`:

```powershell
npm run typecheck
npm run build
node node_modules/vitest/vitest.mjs run src/platform/codex/node/test/codexService.spec.ts --pool=forks
```

If the Windows `npm.cmd` shim resolves a broken roaming npm installation, invoke the system CLI explicitly:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run typecheck
```

From the repository root, use the smallest applicable core compile/test command described in `.github/copilot-instructions.md`. For desktop smoke tests, launch `scripts\code.bat` with unique `--user-data-dir` and `--extensions-dir` directories so cached auth/model state cannot hide regressions.

Required smoke checks for authentication or routing changes:

1. Launch with a clean profile and no GitHub session.
2. Open the model picker; it must show Luna directly, not a GitHub sign-in modal.
3. Submit a real chat request and verify a streamed response.
4. Check renderer and Copilot extension logs for `GitHubLoginFailed` and `ModelMetadataFetcher`; neither should appear in the request path.
5. When Codex is signed out, verify that Codex login starts and GitHub login does not.

## Working-Tree Rules

- The current fork work is intentionally uncommitted. Preserve all existing modifications and untracked Codex/autocomplete files.
- Do not reset, checkout or overwrite unrelated user changes.
- Use `apply_patch` for source edits and `rg` for searching.
- Use tabs in TypeScript and follow upstream localisation, DI and disposable rules.
- Generated bundles, logs, screenshots and clean-profile data live under `.build/` and must not be committed.
- Before claiming a fix, run proportionate tests and a real clean-profile desktop smoke test. Compilation alone is not proof of auth, model-picker or native-window behaviour.
