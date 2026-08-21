# X-IDE

> The version of VS Code I wish had been VS Code.

**This is version zero. It is not a mock-up, a theme pack or a disposable prototype.** It is a working development build of Code OSS 1.135.0 with its AI plumbing and several pieces of the everyday editor experience rebuilt.

X-IDE is my dream version of VS Code: the editor is still familiar, but GitHub Copilot no longer gets to stand between me and the agent UI with a clipboard, a login gate and a premium-request abacus. We integrated Codex into the bundled GitHub Copilot extension, routed the existing VS Code agent experience through it, and gave autocomplete a fast local path that does not consume Copilot requests.

We did not publish GPT-5.6 Luna, and we are not shipping model weights. X-IDE connects the Copilot-shaped machinery already inside VS Code to Codex, which supplies the model. The interesting work here is the harness: authentication, routing, streaming, tools, workspace permissions, UI state and completions.

## Why this exists

VS Code is excellent. Its AI product decisions are less excellent.

The editor already had a polished chat panel, model picker, tool UI, progress rendering, inline suggestions and years of careful workbench engineering. Unfortunately, the useful path through those surfaces was tangled around GitHub authentication, Copilot entitlements, CAPI metadata, quota state and a collection of account prompts that appeared whenever somebody had the reckless idea of clicking **Models**.

We wanted the editor, not the tollbooth.

So we kept the good interface and replaced the machinery behind it. X-IDE uses your Codex access, gives GPT-5.6 Luna the existing model slot, allows Codex to work inside the opened workspace, and leaves GitHub sign-in out of the request path.

## What we ripped out

- GitHub Copilot as the model transport and authentication authority.
- GitHub CAPI metadata fetching for main chat, titles, summaries and utility-model work.
- Copilot entitlement checks as a prerequisite for opening chat or receiving completions.
- GitHub-token minting in the active model path.
- The model-picker login trap that opened a full GitHub Copilot sign-in ceremony instead of showing the model.
- Copilot sign-in actions in the account menu and title bar.
- GitHub-first chat setup and onboarding surfaces.
- Cloud-agent and Copilot CLI session contributions that were irrelevant to the local Codex workflow.
- The remote Copilot completion fetcher as the only way to receive useful inline suggestions.
- The startup experience that buried **Open Folder** and **Open File** while proudly displaying everything except the two actions a new user actually needed.

The `github.copilot.*` command IDs and the internal `copilot` vendor ID have not all vanished. VS Code has those identifiers threaded through the workbench like electrical wiring inside concrete. Where they remain, they are compatibility seams—not proof that requests are being sent to GitHub.

## What we added

### A real Codex backend inside the Copilot extension

- A dedicated `ICodexService` registered in the extension's dependency-injection graph.
- Bundled `@openai/codex-sdk` support and platform-specific Codex executables.
- Native executable discovery for supported operating-system and architecture combinations.
- ChatGPT/Codex login, logout and login-status commands through the bundled Codex CLI.
- GPT-5.6 Luna registered in VS Code's existing language-model slot with Codex as the actual backend.
- Main chat, title generation, summaries, dictation cleanup and internal utility requests redirected away from GitHub CAPI and back through Codex.
- Streamed response handling for final messages, agent activity and cancellation.
- Codex reasoning, command execution, file changes and MCP calls translated into readable VS Code progress parts.
- Intermediate agent narration classified and suppressed so the side panel does not become one continuous wall of internal monologue.
- Native Codex shell, filesystem and patch tools enabled inside a `workspace-write` sandbox.
- Ordinary folders supported with `skipGitRepoCheck`; X-IDE does not demand a Git repository before it agrees that a directory exists.
- A transitional bridge that serialises VS Code tool schemas for Codex and parses tool-call envelopes back into VS Code's agent tool system.
- Validation for malformed, invented or unavailable tool calls instead of blindly executing model-shaped confetti.
- Explicit Explorer refresh after native Codex file changes, because a file that exists on disk but remains invisible until Windows sneezes is not a finished interaction.

### Autocomplete without the premium-request accountant

Autocomplete has its own local engine. It is not Luna waiting on a network round trip every time you type a bracket.

- A deterministic repository index that learns repeated line continuations, token sequences and identifiers from the current codebase.
- Language-aware candidate ranking and frequency scoring.
- Prefix and suffix handling that avoids duplicating text already present after the cursor.
- Short, bounded suggestions instead of hallucinating half a screenplay into the editor.
- Background indexing for up to 300 source files and 6 MiB of project text, with build folders, dependencies and VCS internals excluded.
- Live index updates when files are saved or deleted.
- A low-latency path that waits at most 40 ms for the initial index before answering.
- An optional small Ollama fill-in-the-middle model as a second quality layer.
- Clean fallback when Ollama is absent, slow or broken; local inference is an enhancement, not a hostage situation.
- No GitHub sign-in requirement and no Copilot request quota for the deterministic completion path.

### A workbench that remembers humans use it

- A large, centred **Open Folder** button when no workspace is open.
- A secondary **Open File** button beside it.
- A centred graphical **User Settings** editor instead of making every ordinary preference a search expedition.
- Working controls for colour theme, file icons, interface icons, autocomplete and Auto Save.
- Direct escape hatches to the full Settings editor and `settings.json` for people who do want the whole control room.
- A simpler **File** menu with **Open User Settings** and **Continue to Old Menu**.
- The original File menu preserved behind that second option rather than deleted for the crime of being complicated.
- A real confirmation dialogue before closing the desktop window: **Are you sure you want to close the window?**
- Signed-out chat, status and model-picker UI rewritten so GitHub Copilot authentication is not presented as the price of touching AI features.
- X-IDE branding across product names, storage folders, protocols, mutexes, launchers and extension metadata.
- Windows, Linux and WSL development launchers that load the bundled X-IDE AI extension automatically.

### Tests and failure-path work

- Tests for Codex executable resolution across platforms.
- Tests for ordinary non-Git workspace configuration and workspace sandbox settings.
- Tests for Codex prompt construction, agent-message classification and tool-envelope parsing.
- Tests for repository completion ranking and suffix overlap.
- Tests for the local completion bridge and Ollama FIM cleanup.
- Workbench model-picker tests updated for the signed-out Codex flow.
- Separate Copilot-extension typechecking, extension builds, workbench compilation and clean-profile desktop smoke runs.

## The eight pieces of backend surgery

The short version of the architecture is:

1. Bundle the Codex SDK and native runtime.
2. Replace GitHub authentication with Codex/ChatGPT authentication.
3. Register Codex-backed Luna in the model slot VS Code already understands.
4. Redirect main and utility requests away from GitHub CAPI.
5. Translate Codex streams into the response and progress types the workbench can render.
6. Enable native Codex workspace tools while keeping writes sandboxed to the opened project.
7. Bridge VS Code-specific tools into the harness without pretending a system prompt alone constitutes an execution protocol.
8. Replace quota-bound remote autocomplete with the local repository engine and optional Ollama layer.

That sounds tidy now. It was not tidy while we were doing it.

## The suffering, for historical accuracy

The first attempt could answer questions but could not reliably touch files because the model prompt knew tools existed while the actual execution path did not. Very inspirational. We then had to separate Codex-native workspace tools from VS Code host tools, define a compatibility envelope, validate it, and stop the assistant from claiming it had executed calls that the host had never received.

Codex initially rejected ordinary folders because they were not trusted Git repositories. VS Code, famously, can open folders that are not Git repositories. We disabled that inappropriate check per thread and kept the actual write boundary where it belongs: the workspace sandbox.

Native file writes worked, but Explorer sometimes stared directly at the new file and denied its existence until an unrelated UI refresh occurred. That became an explicit refresh event.

Chat streamed, but intermediate narration piled into the narrow side panel as a slab of text. That became event classification: concise activity goes to progress, the final answer goes to the answer, and raw reasoning stays out of the UI.

The close confirmation existed in configuration but the last-window shutdown path quietly translated **Close** into **Quit**, stepping around the behaviour we needed. That path was corrected too.

And yes, the Code OSS monorepo was rebuilt repeatedly while one TypeScript error waited until minute 1:17 to announce that a dependency-injection argument had moved. Character building, apparently.

This version-zero build took roughly **four and a half hours of implementation, debugging, rebuilding and native smoke testing** on 21 August 2026. Not four and a half hours watching a progress bar, and not a toy prototype assembled from screenshots: four and a half hours of cutting through a very large, very coupled editor and leaving it running afterward.

## How much changed

Against the Code OSS base, version zero changes:

- **Files changed:** `61`
- **Lines added:** `2,337`
- **Lines removed:** `697`
- **Total line churn:** `3,034`

Those changes sit across the workbench, desktop lifecycle, menus, settings, chat setup, model routing, authentication, Codex runtime, tool bridge, completion engine, tests, packaging and launch scripts. The percentage of a 5.6-million-line monorepo is mathematically small and architecturally meaningless. Replacing the lock on a cathedral changes very little masonry; it still decides who gets through the door.

## Accounts, usage and limits

You need a ChatGPT account because X-IDE authenticates through Codex rather than billing an OpenAI API key.

For useful day-to-day X-IDE agent work, **ChatGPT Plus or Pro is the practical baseline**. OpenAI currently lists the GPT-5.6 family—including Luna—on Plus, describes Luna as the higher-usage option for lighter or high-volume work, and gives Pro 5× or 20× the Codex usage of Plus. That is the massively increased headroom X-IDE is built to use, without Copilot's premium-request counter sitting in the middle of the editor.

A Free account can still access Codex for quick tasks within its smaller included allowance. It is enough to try the flow; it is not the plan we would choose for sustained agent work. Plan availability and limits can change, so check [OpenAI's current Codex pricing page](https://learn.chatgpt.com/docs/pricing) rather than trusting a README fossil forever.

Local deterministic autocomplete is separate from hosted Codex usage. It remains local and does not spend Copilot or Codex requests. The optional Ollama layer also runs locally.

## Build and run

This is currently a development build. A Windows installer and clean release packaging are the next major milestone.

The prerequisites are the same as the upstream Code OSS development build. From the repository root on Windows:

```powershell
npm install
npm run compile
scripts\code.bat
```

On first hosted-agent use, sign in to Codex with your ChatGPT account. X-IDE does not require GitHub sign-in for the model picker, chat activation or local autocomplete.

## Version-zero status

Working now:

- Codex authentication and Luna chat routing.
- Streamed agent responses and readable activity progress.
- Native workspace inspection, commands and file changes.
- Live Explorer refresh after agent edits.
- Local repository autocomplete with optional Ollama assistance.
- Signed-out model selection without the GitHub login modal.
- Friendly settings, empty-window open actions and close confirmation.

Still being hardened:

- The prompt-encoded compatibility bridge for VS Code-specific tools will be replaced by a fully structured native adapter.
- Packaging, installer creation and update delivery.
- Broader runtime and platform testing outside the current Windows development path.

Version zero means the architecture works and the editor runs. It does not mean we are pretending there are no sharp edges. It also does not mean “prototype” in the traditional sense of three buttons wired to optimism.

## Licence and attribution

X-IDE is licensed under the [MIT licence](LICENSE-XIDE.txt).

It is derived from Microsoft's [Code OSS](https://github.com/microsoft/vscode), whose inherited source retains its [MIT licence and copyright notice](LICENSE.txt). The bundled Copilot-derived extension retains its existing [MIT licence](extensions/copilot/LICENSE.txt), and third-party components retain their respective notices.

X-IDE is independent and is not affiliated with or endorsed by Microsoft, GitHub or OpenAI. We can respect the engineering, preserve the licences and still point out that putting an account turnstile in front of autocomplete was deeply silly.

For the concentrated roast, see [ROAST.md](ROAST.md). The README is merely the slow-release formulation.
