/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { getTokenizer } from '../../completions-core/vscode-node/prompt/src/tokenization';
import { CompletionError, CompletionParams, CompletionResults, FinishedCallback, OpenAIFetcher } from '../../completions-core/vscode-node/lib/src/openai/fetch';
import { APIChoice } from '../../completions-core/vscode-node/lib/src/openai/openai';
import { TelemetryWithExp } from '../../completions-core/vscode-node/lib/src/telemetry';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { LocalRepositoryAutocompleteIndex } from '../common/localRepositoryAutocomplete';
import { OllamaFimCompletion } from './ollamaFimCompletion';

const SOURCE_GLOB = '**/*.{c,cc,cpp,cs,css,go,h,hpp,html,java,js,jsx,json,kt,kts,lua,md,php,py,rb,rs,scss,sh,sql,svelte,swift,ts,tsx,vue,yaml,yml}';
const EXCLUDE_GLOB = '**/{.git,.svn,.hg,node_modules,out,dist,build,target,vendor,.venv,venv}/**';
const MAX_FILES = 300;
const MAX_FILE_BYTES = 192 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

export class LocalCompletionsFetcher extends OpenAIFetcher implements vscode.Disposable {
	private readonly index = new LocalRepositoryAutocompleteIndex();
	private readonly localModel = new OllamaFimCompletion();
	private readonly disposables = new DisposableStore();
	private readonly indexReady: Promise<void>;

	constructor() {
		super();
		this.indexReady = this.buildInitialIndex();
		void this.indexReady.then(() => this.localModel.warmUp());
		this.disposables.add(vscode.workspace.onDidSaveTextDocument(document => this.indexTextDocument(document)));
		this.disposables.add(vscode.workspace.onDidDeleteFiles(event => event.files.forEach(uri => this.index.deleteDocument(uri.toString()))));
	}

	dispose(): void {
		this.disposables.dispose();
	}

	async fetchAndStreamCompletions(
		params: CompletionParams,
		baseTelemetryData: TelemetryWithExp,
		_finishedCb: FinishedCallback,
		cancellationToken?: CancellationToken,
	): Promise<CompletionResults | CompletionError> {
		await Promise.race([this.indexReady, timeout(40)]);
		if (cancellationToken?.isCancellationRequested) {
			return { type: 'canceled', reason: 'Local autocomplete request canceled' };
		}
		let completion = this.index.complete({
			languageId: params.languageId,
			prefix: params.prompt.prefix,
			suffix: params.prompt.suffix,
		});
		completion = applyStops(completion, params.postOptions?.stop);
		const modelCompletion = this.localModel.complete(params.prompt.prefix, params.prompt.suffix, cancellationToken)
			.then(value => applyStops(value, params.postOptions?.stop));
		return {
			type: 'success',
			choices: hybridChoices(completion, modelCompletion, baseTelemetryData),
			getProcessingTime: () => 0,
		};
	}

	private async buildInitialIndex(): Promise<void> {
		const uris = await vscode.workspace.findFiles(SOURCE_GLOB, EXCLUDE_GLOB, MAX_FILES);
		let totalBytes = 0;
		for (const uri of uris) {
			try {
				const stat = await vscode.workspace.fs.stat(uri);
				if (stat.size > MAX_FILE_BYTES || totalBytes + stat.size > MAX_TOTAL_BYTES) {
					continue;
				}
				const bytes = await vscode.workspace.fs.readFile(uri);
				totalBytes += bytes.byteLength;
				this.index.setDocument(uri.toString(), languageIdForUri(uri), new TextDecoder().decode(bytes));
			} catch {
				// Files can disappear or become unreadable while the background index is built.
			}
		}
	}

	private indexTextDocument(document: vscode.TextDocument): void {
		if (document.uri.scheme === 'file') {
			this.index.setDocument(document.uri.toString(), document.languageId, document.getText());
		}
	}
}

async function* hybridChoices(repositoryCompletion: string, modelCompletion: Promise<string>, telemetryData: TelemetryWithExp): AsyncIterable<APIChoice> {
	if (repositoryCompletion) {
		yield createChoice(repositoryCompletion, telemetryData, 0, 'local-repository');
	}
	const semanticCompletion = await modelCompletion;
	if (semanticCompletion && semanticCompletion !== repositoryCompletion) {
		yield createChoice(semanticCompletion, telemetryData, repositoryCompletion ? 1 : 0, 'local-qwen');
	}
}

function createChoice(completionText: string, telemetryData: TelemetryWithExp, choiceIndex: number, deploymentId: string): APIChoice {
	const tokenizer = getTokenizer();
	const tokens = tokenizer.tokenize(completionText).map(token => tokenizer.detokenize([token]));
	const requestId = generateUuid();
	return {
		completionText,
		meanLogProb: undefined,
		meanAlternativeLogProb: undefined,
		choiceIndex,
		requestId: {
			headerRequestId: requestId,
			gitHubRequestId: '',
			completionId: requestId,
			created: Date.now(),
			serverExperiments: '',
			deploymentId,
		},
		tokens,
		numTokens: tokens.length,
		blockFinished: false,
		telemetryData,
		clientCompletionId: generateUuid(),
		finishReason: 'stop',
	};
}

export function applyStops(value: string, stops: readonly string[] | undefined): string {
	let end = value.length;
	for (const stop of stops ?? []) {
		const index = value.indexOf(stop);
		if (index >= 0) {
			end = Math.min(end, index);
		}
	}
	return value.slice(0, end);
}

function languageIdForUri(uri: vscode.Uri): string {
	const extension = uri.path.slice(uri.path.lastIndexOf('.') + 1).toLowerCase();
	return ({ js: 'javascript', jsx: 'javascriptreact', py: 'python', rb: 'ruby', rs: 'rust', ts: 'typescript', tsx: 'typescriptreact' } as Record<string, string>)[extension] ?? extension;
}

function timeout(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}
