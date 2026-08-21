/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelReasoningEffort, ThreadEvent, ThreadOptions } from '@openai/codex-sdk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ILogService } from '../../log/common/logService';
import { CODEX_LUNA_MODEL_ID, ICodexService } from '../common/codexService';

interface CodexProcessResult {
	readonly exitCode: number;
	readonly output: string;
}

const TARGET_BY_PLATFORM: Partial<Record<NodeJS.Platform, Partial<Record<string, string>>>> = {
	linux: { x64: 'x86_64-unknown-linux-musl', arm64: 'aarch64-unknown-linux-musl' },
	android: { x64: 'x86_64-unknown-linux-musl', arm64: 'aarch64-unknown-linux-musl' },
	darwin: { x64: 'x86_64-apple-darwin', arm64: 'aarch64-apple-darwin' },
	win32: { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' },
};

const PACKAGE_BY_TARGET: Record<string, string> = {
	'x86_64-unknown-linux-musl': 'codex-linux-x64',
	'aarch64-unknown-linux-musl': 'codex-linux-arm64',
	'x86_64-apple-darwin': 'codex-darwin-x64',
	'aarch64-apple-darwin': 'codex-darwin-arm64',
	'x86_64-pc-windows-msvc': 'codex-win32-x64',
	'aarch64-pc-windows-msvc': 'codex-win32-arm64',
};

export function resolveCodexExecutable(extensionPath: string, platform: NodeJS.Platform = process.platform, architecture: string = process.arch): string {
	const target = TARGET_BY_PLATFORM[platform]?.[architecture];
	if (!target) {
		throw new Error(`Codex does not support ${platform}/${architecture}.`);
	}
	const packageName = PACKAGE_BY_TARGET[target];
	return path.join(
		extensionPath,
		'node_modules',
		'@openai',
		packageName,
		'vendor',
		target,
		'bin',
		platform === 'win32' ? 'codex.exe' : 'codex',
	);
}

export class CodexService implements ICodexService {
	declare readonly _serviceBrand: undefined;

	private readonly codexPath: string;
	private signInPromise: Promise<void> | undefined;

	constructor(
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
	) {
		this.codexPath = resolveCodexExecutable(extensionContext.extensionPath);
	}

	get isAvailable(): boolean {
		return existsSync(this.codexPath);
	}

	async getLoginStatus(): Promise<string> {
		const result = await this.runCodex(['login', 'status']);
		if (result.exitCode !== 0) {
			return result.output || vscode.l10n.t('Not signed in to Codex.');
		}
		return result.output || vscode.l10n.t('Signed in to Codex.');
	}

	signIn(): Promise<void> {
		if (!this.signInPromise) {
			this.signInPromise = this.runSignIn().finally(() => this.signInPromise = undefined);
		}
		return this.signInPromise;
	}

	private async runSignIn(): Promise<void> {
		const result = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: vscode.l10n.t('Signing in to Codex…'),
			cancellable: true,
		}, async (_progress, token) => this.runCodex(['login'], token));
		if (result.exitCode !== 0) {
			throw new Error(result.output || vscode.l10n.t('Codex sign-in failed.'));
		}
	}

	async signOut(): Promise<void> {
		const result = await this.runCodex(['logout']);
		if (result.exitCode !== 0) {
			throw new Error(result.output || vscode.l10n.t('Codex sign-out failed.'));
		}
	}

	async provideLanguageModelResponse(
		messages: readonly (vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2)[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
	): Promise<void> {
		if (!this.isAvailable) {
			throw new Error(vscode.l10n.t('The bundled Codex runtime is unavailable.'));
		}

		const status = await this.runCodex(['login', 'status'], token);
		if (status.exitCode !== 0) {
			await this.signIn();
		}

		const { Codex } = await import('@openai/codex-sdk');
		const codex = new Codex({ codexPathOverride: this.codexPath });
		const workingDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
		const configuredEffort = options.modelConfiguration?.reasoningEffort;
		const modelReasoningEffort = isModelReasoningEffort(configuredEffort) ? configuredEffort : 'medium';
		const thread = codex.startThread(createCodexThreadOptions(workingDirectory, modelReasoningEffort));

		const abortController = new AbortController();
		const cancellation = token.onCancellationRequested(() => abortController.abort());
		try {
			const turn = await thread.runStreamed(renderCodexPrompt(messages, options), { signal: abortController.signal });
			const streamedText = new Map<string, string>();
			const reportedActivity = new Set<string>();
			for await (const event of turn.events) {
				await this.collectEvent(event, streamedText, reportedActivity, progress);
			}
			for (const message of classifyCodexAgentMessages([...streamedText.entries()])) {
				if (message.kind === 'response') {
					this.reportAgentOutput(message.text, options.tools ?? [], progress);
				}
			}
		} finally {
			cancellation.dispose();
		}
	}

	private async collectEvent(
		event: ThreadEvent,
		streamedText: Map<string, string>,
		reportedActivity: Set<string>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
	): Promise<void> {
		if (event.type === 'error') {
			throw new Error(event.message);
		}
		if (event.type === 'turn.failed') {
			throw new Error(event.error.message);
		}
		if (event.type !== 'item.started' && event.type !== 'item.updated' && event.type !== 'item.completed') {
			return;
		}

		const item = event.item;
		if (item.type === 'agent_message') {
			streamedText.set(item.id, item.text);
		} else if (item.type === 'reasoning') {
			if (!reportedActivity.has(item.id)) {
				reportedActivity.add(item.id);
				progress.report(new vscode.LanguageModelThinkingPart(vscode.l10n.t('Analysing the workspace…'), item.id));
			}
		} else if (event.type === 'item.completed' && !reportedActivity.has(item.id)) {
			reportedActivity.add(item.id);
			if (item.type === 'command_execution') {
				progress.report(new vscode.LanguageModelThinkingPart(vscode.l10n.t('Ran a workspace command.'), item.id));
			} else if (item.type === 'file_change') {
				const paths = item.changes.map(change => path.basename(change.path)).join(', ');
				progress.report(new vscode.LanguageModelThinkingPart(vscode.l10n.t('Updated workspace files: {0}', paths), item.id));
				await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
			} else if (item.type === 'mcp_tool_call') {
				progress.report(new vscode.LanguageModelThinkingPart(vscode.l10n.t('Used tool: {0}/{1}', item.server, item.tool), item.id));
			}
		}
	}

	private reportAgentOutput(
		output: string,
		tools: readonly vscode.LanguageModelChatTool[],
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
	): void {
		const allowedTools = new Set(tools.map(tool => tool.name));
		for (const part of parseCopilotToolOutput(output)) {
			if (part.type === 'text') {
				if (part.value) {
					progress.report(new vscode.LanguageModelTextPart(part.value));
				}
			} else {
				if (!allowedTools.has(part.name)) {
					throw new Error(vscode.l10n.t('Codex requested an unavailable Copilot tool: {0}', part.name));
				}
				progress.report(new vscode.LanguageModelToolCallPart(part.callId, part.name, part.input));
			}
		}
	}

	private runCodex(args: readonly string[], token?: vscode.CancellationToken): Promise<CodexProcessResult> {
		return new Promise((resolve, reject) => {
			if (!this.isAvailable) {
				reject(new Error(vscode.l10n.t('The bundled Codex runtime is unavailable.')));
				return;
			}

			const child = spawn(this.codexPath, args, {
				cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				env: process.env,
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
			});
			let output = '';
			child.stdout.setEncoding('utf8');
			child.stderr.setEncoding('utf8');
			child.stdout.on('data', chunk => output += chunk);
			child.stderr.on('data', chunk => output += chunk);
			const cancellation = token?.onCancellationRequested(() => child.kill());
			child.once('error', error => {
				cancellation?.dispose();
				reject(error);
			});
			child.once('exit', code => {
				cancellation?.dispose();
				const exitCode = code ?? 1;
				const trimmedOutput = output.trim();
				if (exitCode !== 0) {
					this.logService.warn(`[CodexService] codex ${args.join(' ')} failed (${exitCode}): ${trimmedOutput}`);
				}
				resolve({ exitCode, output: trimmedOutput });
			});
		});
	}
}

export interface ClassifiedCodexAgentMessage {
	readonly id: string;
	readonly text: string;
	readonly kind: 'activity' | 'response';
}

/**
 * Codex can emit several agent messages during one turn. The earlier messages
 * are progress narration, while the final message is the user-facing answer.
 * Tool-call envelopes remain responses regardless of position so VS Code can
 * execute them instead of hiding them in the collapsible progress UI.
 */
export function classifyCodexAgentMessages(messages: readonly (readonly [string, string])[]): ClassifiedCodexAgentMessage[] {
	return messages.map(([id, text], index) => ({
		id,
		text,
		kind: index === messages.length - 1 || parseCopilotToolOutput(text).some(part => part.type === 'toolCall') ? 'response' : 'activity',
	}));
}

export function createCodexThreadOptions(workingDirectory: string, modelReasoningEffort: ModelReasoningEffort): ThreadOptions {
	return {
		model: CODEX_LUNA_MODEL_ID,
		modelReasoningEffort,
		workingDirectory,
		// VS Code supports ordinary folders and loose files, not only Git
		// repositories. The SDK otherwise exits before the first model turn.
		skipGitRepoCheck: true,
		// Codex owns native shell and file tools. Keep them confined to the
		// opened workspace instead of disabling them and hoping prompt-encoded
		// host tool calls happen to be available.
		sandboxMode: 'workspace-write',
		approvalPolicy: 'never',
	};
}

export function renderCodexPrompt(
	messages: readonly (vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2)[],
	options: vscode.ProvideLanguageModelChatResponseOptions,
): string {
	const toolProtocol = renderCopilotToolProtocol(options);
	const conversation = messages.map(message => {
		const role = vscode.LanguageModelChatMessageRole[message.role] ?? String(message.role);
		const content = typeof message.content === 'string'
			? message.content
			: message.content.map(part => renderMessagePart(part)).filter(Boolean).join('\n');
		return `<${role.toLowerCase()}>\n${content}\n</${role.toLowerCase()}>`;
	}).join('\n\n');
	const mode = options.tools?.length
		? 'Use Codex native shell, search, filesystem and patch tools for workspace actions. The host tools declared below are supplementary and should be used only for VS Code-specific actions that Codex cannot perform natively.'
		: 'Use Codex native workspace tools when the request requires inspecting, creating, editing, testing or running project files. All writes must remain inside the configured workspace sandbox.';
	return `${mode}${toolProtocol}\n\n${conversation}`;
}

function renderCopilotToolProtocol(options: vscode.ProvideLanguageModelChatResponseOptions): string {
	if (!options.tools?.length) {
		return '';
	}
	const tools = options.tools.map(tool => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema ?? { type: 'object' },
	}));
	const requirement = options.toolMode === vscode.LanguageModelChatToolMode.Required
		? 'You must call at least one of these tools.'
		: 'Call a tool only when it helps complete the request.';
	return `

<copilot_tool_protocol>
${requirement}
Available tools (JSON):
${JSON.stringify(tools)}

To call a tool, emit exactly this envelope with valid JSON and no Markdown fence:
<copilot_tool_call>{"callId":"unique-id","name":"exact-tool-name","input":{}}</copilot_tool_call>
The host will execute it and return the result in the next request. You may emit multiple envelopes for independent calls. Never invent a tool name. If you call a tool, do not claim its result before the host returns it.
</copilot_tool_protocol>`;
}

export type CopilotToolOutputPart =
	| { readonly type: 'text'; readonly value: string }
	| { readonly type: 'toolCall'; readonly callId: string; readonly name: string; readonly input: object };

export function parseCopilotToolOutput(output: string): CopilotToolOutputPart[] {
	const parts: CopilotToolOutputPart[] = [];
	const pattern = /<copilot_tool_call>\s*([\s\S]*?)\s*<\/copilot_tool_call>/g;
	let offset = 0;
	for (let match = pattern.exec(output); match; match = pattern.exec(output)) {
		if (match.index > offset) {
			parts.push({ type: 'text', value: output.slice(offset, match.index) });
		}
		let value: unknown;
		try {
			value = JSON.parse(match[1]);
		} catch {
			throw new Error('Codex emitted malformed JSON for a Copilot tool call.');
		}
		if (!isToolCall(value)) {
			throw new Error('Codex emitted an invalid Copilot tool call.');
		}
		parts.push({ type: 'toolCall', callId: value.callId, name: value.name, input: value.input });
		offset = pattern.lastIndex;
	}
	if (offset < output.length) {
		parts.push({ type: 'text', value: output.slice(offset) });
	}
	return parts;
}

function isToolCall(value: unknown): value is { callId: string; name: string; input: object } {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as { callId?: unknown; name?: unknown; input?: unknown };
	return typeof candidate.callId === 'string'
		&& candidate.callId.length > 0
		&& typeof candidate.name === 'string'
		&& candidate.name.length > 0
		&& Boolean(candidate.input)
		&& typeof candidate.input === 'object'
		&& !Array.isArray(candidate.input);
}

function renderMessagePart(part: vscode.LanguageModelChatMessage['content'][number] | vscode.LanguageModelThinkingPart): string {
	if (part instanceof vscode.LanguageModelTextPart) {
		return part.value;
	}
	if (part instanceof vscode.LanguageModelThinkingPart) {
		return typeof part.value === 'string' ? part.value : part.value.join('');
	}
	if (part instanceof vscode.LanguageModelToolCallPart) {
		return `[Tool call ${part.name}: ${JSON.stringify(part.input)}]`;
	}
	if (part instanceof vscode.LanguageModelToolResultPart) {
		return `[Tool result ${part.callId}: ${part.content.map(value => value instanceof vscode.LanguageModelTextPart ? value.value : '').join('')}]`;
	}
	return '';
}

function isModelReasoningEffort(value: string | number | boolean | undefined): value is ModelReasoningEffort {
	return typeof value === 'string' && ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(value);
}
