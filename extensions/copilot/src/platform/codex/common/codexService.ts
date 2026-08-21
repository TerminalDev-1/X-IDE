/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const CODEX_LUNA_MODEL_ID = 'gpt-5.6-luna';

export const ICodexService = createServiceIdentifier<ICodexService>('ICodexService');

export interface ICodexService {
	readonly _serviceBrand: undefined;
	readonly isAvailable: boolean;

	getLoginStatus(): Promise<string>;
	signIn(): Promise<void>;
	signOut(): Promise<void>;

	provideLanguageModelResponse(
		messages: readonly (vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2)[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart2>,
		token: vscode.CancellationToken,
	): Promise<void>;
}

export class NullCodexService implements ICodexService {
	declare readonly _serviceBrand: undefined;
	readonly isAvailable = false;

	async getLoginStatus(): Promise<string> {
		return 'Codex is unavailable.';
	}

	async signIn(): Promise<void> {
		throw new Error('Codex is unavailable.');
	}

	async signOut(): Promise<void> {
		throw new Error('Codex is unavailable.');
	}

	async provideLanguageModelResponse(): Promise<void> {
		throw new Error('Codex is unavailable.');
	}
}
