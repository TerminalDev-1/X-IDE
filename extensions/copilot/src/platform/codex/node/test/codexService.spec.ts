/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sep } from 'path';
import * as vscode from 'vscode';
import { describe, expect, test } from 'vitest';
import { classifyCodexAgentMessages, createCodexThreadOptions, parseCopilotToolOutput, renderCodexPrompt, resolveCodexExecutable } from '../codexService';

describe('CodexService', () => {
	test('resolves the bundled Windows x64 runtime', () => {
		const executable = resolveCodexExecutable('C:\\extension', 'win32', 'x64');
		expect(executable).toBe([
			'C:\\extension',
			'node_modules',
			'@openai',
			'codex-win32-x64',
			'vendor',
			'x86_64-pc-windows-msvc',
			'bin',
			'codex.exe',
		].join(sep));
	});

	test('rejects unsupported architectures', () => {
		expect(() => resolveCodexExecutable('/extension', 'linux', 'riscv64')).toThrow('Codex does not support linux/riscv64.');
	});

	test('allows Codex threads in ordinary non-Git workspace folders', () => {
		expect(createCodexThreadOptions('C:\\workspace', 'medium')).toEqual({
			model: 'gpt-5.6-luna',
			modelReasoningEffort: 'medium',
			workingDirectory: 'C:\\workspace',
			skipGitRepoCheck: true,
			sandboxMode: 'workspace-write',
			approvalPolicy: 'never',
		});
	});

	test('enables Codex native workspace tools instead of forbidding them in the prompt', () => {
		const prompt = renderCodexPrompt([vscode.LanguageModelChatMessage.User('Create index.html')], {
			requestInitiator: 'test',
			toolMode: vscode.LanguageModelChatToolMode.Auto,
		});
		expect(prompt).toContain('Use Codex native workspace tools');
		expect(prompt).not.toContain('Do not use Codex built-in');
	});

	test('parses Copilot tool calls and surrounding text', () => {
		expect(parseCopilotToolOutput('Checking.\n<copilot_tool_call>{"callId":"call-1","name":"read_file","input":{"path":"README.md"}}</copilot_tool_call>')).toEqual([
			{ type: 'text', value: 'Checking.\n' },
			{ type: 'toolCall', callId: 'call-1', name: 'read_file', input: { path: 'README.md' } },
		]);
	});

	test('keeps intermediate agent narration out of the final chat response', () => {
		expect(classifyCodexAgentMessages([
			['message-1', 'I will inspect the workspace.'],
			['message-2', 'The file has been created.'],
		])).toEqual([
			{ id: 'message-1', text: 'I will inspect the workspace.', kind: 'activity' },
			{ id: 'message-2', text: 'The file has been created.', kind: 'response' },
		]);
	});

	test('preserves intermediate Copilot tool calls as executable responses', () => {
		const toolCall = '<copilot_tool_call>{"callId":"call-1","name":"read_file","input":{"path":"README.md"}}</copilot_tool_call>';
		expect(classifyCodexAgentMessages([
			['message-1', toolCall],
			['message-2', 'Done.'],
		])).toEqual([
			{ id: 'message-1', text: toolCall, kind: 'response' },
			{ id: 'message-2', text: 'Done.', kind: 'response' },
		]);
	});

	test('rejects malformed Copilot tool calls', () => {
		expect(() => parseCopilotToolOutput('<copilot_tool_call>{broken}</copilot_tool_call>')).toThrow('malformed JSON');
		expect(() => parseCopilotToolOutput('<copilot_tool_call>{"callId":"","name":"read_file","input":{}}</copilot_tool_call>')).toThrow('invalid Copilot tool call');
	});

});
