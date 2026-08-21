/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, languages } from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../util/vs/base/common/observableInternal';
import { registerUnificationCommands } from '../../completions-core/vscode-node/completionsServiceBridges';
import { ICopilotInlineCompletionItemProviderService } from '../common/copilotInlineCompletionItemProviderService';
import { unificationStateObservable } from './completionsUnificationContribution';

export class CompletionsCoreContribution extends Disposable {

	constructor(
		@ICopilotInlineCompletionItemProviderService _copilotInlineCompletionItemProviderService: ICopilotInlineCompletionItemProviderService,
	) {
		super();

		const unificationState = unificationStateObservable(this);

		this._register(autorun(reader => {
			const unificationStateValue = unificationState.read(reader);
			const extensionUnification = unificationStateValue?.extensionUnification ?? false;

			let hasInstantiatedProvider = false;
			// The repository completion engine is entirely local and does not require a
			// Copilot token, so it remains available while signed out or offline.
			const provider = _copilotInlineCompletionItemProviderService.getOrCreateProvider();
			reader.store.add(
				languages.registerInlineCompletionItemProvider(
					{ pattern: '**' },
					provider,
					{
						debounceDelayMs: 0,
						excludes: ['github.copilot'],
						groupId: 'completions'
					}
				)
			);
			hasInstantiatedProvider = true;

			void commands.executeCommand('setContext', 'github.copilot.extensionUnification.activated', extensionUnification);
			void commands.executeCommand('setContext', 'github.copilot.activated', hasInstantiatedProvider);

			if (extensionUnification && hasInstantiatedProvider) {
				const completionsInstaService = _copilotInlineCompletionItemProviderService.getOrCreateInstantiationService();
				reader.store.add(completionsInstaService.invokeFunction(registerUnificationCommands));
			}
		}));
	}
}
