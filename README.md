# X-IDE

> The version of VS Code I wish had been VS Code.

X-IDE is a source fork of Code OSS 1.135.0 built around a simple idea: the editor, agent harness and autocomplete should work for the developer instead of funnelling every useful AI interaction through GitHub Copilot authentication, entitlements and request quotas.

This is my dream version of VS Code—the familiar editor I wanted to keep, with the AI backend, empty-window experience and everyday settings rebuilt around how I actually want to work. A proper installer is next, so soon you will be able to install X-IDE without building the enormous VS Code-shaped moon base yourself.

## What changed

### Removed

- GitHub Copilot as the model transport, authentication authority and quota gate.
- GitHub sign-in prompts from the model picker and autocomplete status flow.
- Copilot entitlement checks that blocked chat or inline suggestions while signed out.
- Cloud-agent and Copilot CLI surfaces that do not belong in the X-IDE workflow.
- The startup experience that hid the basic **Open Folder** and **Open File** actions.

### Added

- First-class Codex authentication through the bundled Codex CLI.
- **GPT-5.6 Luna** as the single agent model exposed through VS Code's existing model slot.
- Codex SDK streaming for chat, reasoning/progress, command execution, file changes and MCP activity.
- A deterministic repository-aware autocomplete engine with an optional small Ollama fill-in-the-middle quality layer.
- Local autocomplete that works offline, does not consume Copilot requests and has no Copilot request quota.
- A centred **User Settings** page for themes, icons, autocomplete, Auto Save and advanced settings.
- Large **Open Folder** and **Open File** actions when no workspace is open.
- Live Explorer refresh after Codex creates or edits files.
- A confirmation dialogue before closing the desktop window.

### Rewired in the Copilot backend

The bundled extension still keeps a few `github.copilot.*` IDs and the `copilot` vendor identifier as compatibility seams. VS Code has those identifiers threaded through its chat UI, commands and context keys; preserving them avoids pointlessly demolishing the contribution graph. They no longer identify the active provider.

Instead:

1. The Codex SDK and platform binaries are bundled into the extension.
2. A native Codex service owns login, executable discovery, sandbox configuration and streamed threads.
3. The existing language-model slot publishes only GPT-5.6 Luna, labelled as Codex.
4. Main chat, titles, summaries and utility-model work route back through Codex instead of GitHub CAPI.
5. Model selection and activation no longer mint or require a GitHub token.
6. Codex events are translated into VS Code's agent progress and response parts.
7. File changes trigger an explicit Explorer refresh so agent work appears immediately.
8. The completion bridge uses the local repository engine and activates without a Copilot token.

That was eight major integration steps to turn a deeply Copilot-shaped backend into a Codex-backed harness without throwing away VS Code's excellent agent UI.

## Limits, honestly

X-IDE does not apply GitHub Copilot authentication, entitlement or request limits to Codex chat, and local autocomplete has no service quota at all. Hosted Codex usage can still be subject to the limits of the Codex account or service you sign in with. “No Copilot limits” is real; “infinite hosted compute materialises from the quantum foam” would be marketing nonsense.

## Current change size

The final working-tree metrics are calculated against the upstream `HEAD`, including new untracked source and documentation files:

- **Lines added:** `2,243`
- **Lines removed:** `697`
- **Total line churn:** `2,940`
- **Changed files:** `61`
- **Share of the upstream tracked text:** `0.0523%`

The percentage is `(lines added + lines removed) / total text lines tracked at HEAD × 100`. It describes implementation churn, not a claim that every changed line is equally profound.

## Build time

The current prototype took roughly **four and a half hours** of implementation, rebuilding and native desktop smoke testing on 21 August 2026—from the first backend edits at about 13:12 to the final branded build after 17:30. That includes the glamorous bits: waiting for the VS Code monorepo to compile repeatedly while one TypeScript error laughs from minute 1:17.

## Build and run

Prerequisites are the same as the upstream Code OSS development build. From the repository root on Windows:

```powershell
npm install
npm run compile
scripts\code.bat
```

The launcher loads the bundled X-IDE AI extension from `extensions/copilot` automatically.

## Status

This is a development build, not yet a packaged release. The core Codex chat path, native workspace changes, local autocomplete, friendly settings surface and signed-out experience are working. The VS Code tool compatibility protocol is still transitional and will be replaced by a more completely native structured-tool adapter.

Next major milestone: a Windows installer and clean release packaging.

## Licensing and attribution

X-IDE is derived from Microsoft's [Code OSS](https://github.com/microsoft/vscode), whose inherited source remains available under the [MIT licence](LICENSE.txt). The bundled Copilot-derived extension is also distributed under its existing [MIT licence](extensions/copilot/LICENSE.txt).

Original X-IDE-specific additions are offered under [Apache License 2.0](LICENSE-XIDE.txt). Existing third-party notices and licences continue to apply to their respective components. X-IDE is an independent project and is not affiliated with or endorsed by Microsoft, GitHub or OpenAI.

For the less diplomatic architectural review, see [ROAST.md](ROAST.md).
