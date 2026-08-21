/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, l10n, window } from 'vscode';
import { ICodexService } from '../../../platform/codex/common/codexService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

/**
 * The main entry point for the authentication contribution.
 */
export class AuthenticationContrib extends Disposable {
	constructor(
		@ICodexService private readonly codexService: ICodexService,
	) {
		super();
		this.registerCodexCommands();
	}

	private registerCodexCommands(): void {
		this._register(commands.registerCommand('github.copilot.codex.signIn', async () => {
			try {
				await this.codexService.signIn();
				await window.showInformationMessage(l10n.t('Signed in to Codex.'));
			} catch (error) {
				await window.showErrorMessage(l10n.t('Codex sign-in failed: {0}', error instanceof Error ? error.message : String(error)));
			}
		}));
		this._register(commands.registerCommand('github.copilot.codex.signOut', async () => {
			try {
				await this.codexService.signOut();
				await window.showInformationMessage(l10n.t('Signed out of Codex.'));
			} catch (error) {
				await window.showErrorMessage(l10n.t('Codex sign-out failed: {0}', error instanceof Error ? error.message : String(error)));
			}
		}));
		this._register(commands.registerCommand('github.copilot.codex.showLoginStatus', async () => {
			await window.showInformationMessage(await this.codexService.getLoginStatus());
		}));
	}
}
