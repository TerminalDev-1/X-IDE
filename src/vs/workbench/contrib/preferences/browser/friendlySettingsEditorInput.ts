/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

export class FriendlySettingsEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.operationCodexFriendlySettings';
	readonly resource = undefined;

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton;
	}

	override get typeId(): string {
		return FriendlySettingsEditorInput.ID;
	}

	override get editorId(): string {
		return FriendlySettingsEditorInput.ID;
	}

	override getName(): string {
		return localize('friendlySettings.editorName', "User Settings");
	}

	override getIcon() {
		return Codicon.settingsGear;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof FriendlySettingsEditorInput;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
