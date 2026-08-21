/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode-languageserver-protocol';

const OLLAMA_GENERATE_URL = 'http://127.0.0.1:11434/api/generate';
const LOCAL_MODEL = 'qwen2.5-coder:3b';
const MAX_PREFIX_CHARS = 12_000;
const MAX_SUFFIX_CHARS = 4_000;
const REQUEST_TIMEOUT_MS = 2_500;

interface OllamaGenerateResponse {
	readonly response?: string;
}

/** A deliberately loopback-only FIM client. Source never leaves the machine. */
export class OllamaFimCompletion {
	async complete(prefix: string, suffix: string, cancellationToken?: CancellationToken): Promise<string> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		const cancellation = cancellationToken?.onCancellationRequested(() => controller.abort());
		try {
			const response = await fetch(OLLAMA_GENERATE_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: LOCAL_MODEL,
					prompt: buildFimPrompt(prefix, suffix),
					raw: true,
					stream: false,
					keep_alive: '30m',
					options: {
						temperature: 0,
						num_ctx: 4096,
						num_predict: 32,
						stop: modelStops(suffix),
					},
				}),
				signal: controller.signal,
			});
			if (!response.ok) {
				return '';
			}
			const result = await response.json() as OllamaGenerateResponse;
			return cleanFimCompletion(result.response ?? '', suffix);
		} catch {
			// Ollama is optional. The deterministic repository index remains available.
			return '';
		} finally {
			clearTimeout(timeout);
			cancellation?.dispose();
		}
	}

	async warmUp(): Promise<void> {
		await this.complete('const localAutocompleteWarmup =', ';');
	}
}

export function buildFimPrompt(prefix: string, suffix: string): string {
	return `<|fim_prefix|>${prefix.slice(-MAX_PREFIX_CHARS)}<|fim_suffix|>${suffix.slice(0, MAX_SUFFIX_CHARS)}<|fim_middle|>`;
}

export function cleanFimCompletion(value: string, suffix: string): string {
	let completion = value.replace(/<\|(?:fim_(?:pad|prefix|suffix|middle)|endoftext)\|>[\s\S]*$/u, '');
	completion = completion.replace(/[ \t]+$/gm, '');
	if (suffix) {
		for (let overlap = Math.min(completion.length, suffix.length); overlap > 0; overlap--) {
			if (completion.endsWith(suffix.slice(0, overlap))) {
				completion = completion.slice(0, -overlap);
				break;
			}
		}
	}
	return completion.slice(0, 480).trimEnd();
}

function modelStops(suffix: string): string[] {
	const stops = ['<|fim_pad|>', '<|fim_prefix|>', '<|fim_suffix|>', '<|fim_middle|>', '<|endoftext|>', '\n\n'];
	const suffixBoundary = suffix.slice(0, 64);
	if (suffixBoundary) {
		stops.push(suffixBoundary);
	}
	return stops;
}
