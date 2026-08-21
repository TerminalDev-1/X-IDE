/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/friendlySettingsEditor.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { FriendlySettingsEditorInput } from './friendlySettingsEditorInput.js';

const $ = DOM.$;

export class FriendlySettingsEditor extends EditorPane {

	static readonly ID = 'workbench.editor.operationCodexFriendlySettings';

	private readonly contentDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(FriendlySettingsEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = DOM.append(parent, $('.operation-codex-friendly-settings'));
	}

	override async setInput(input: FriendlySettingsEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.render();
	}

	override layout(dimension: DOM.Dimension): void {
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
	}

	private render(): void {
		if (!this.container) {
			return;
		}

		this.contentDisposables.clear();
		DOM.clearNode(this.container);

		const shell = DOM.append(this.container, $('.friendly-settings-shell'));
		const heading = DOM.append(shell, $('header.friendly-settings-heading'));
		DOM.append(heading, $('div.friendly-settings-eyebrow', undefined, localize('friendlySettings.personalise', "PERSONALISE YOUR EDITOR")));
		DOM.append(heading, $('h1', undefined, localize('friendlySettings.title', "User Settings")));
		DOM.append(heading, $('p', undefined, localize('friendlySettings.subtitle', "The everyday controls, without making you excavate the full Settings editor.")));

		const grid = DOM.append(shell, $('.friendly-settings-grid'));
		this.renderThemeCard(grid);
		this.renderAutocompleteCard(grid);
		this.renderAutoSaveCard(grid);
		this.renderAdvancedCard(grid);
	}

	private renderThemeCard(parent: HTMLElement): void {
		const card = this.createCard(parent, 'codicon-color-mode', localize('friendlySettings.appearance', "Appearance"), localize('friendlySettings.appearance.description', "Choose the colours and icon style that feel right."));
		const currentTheme = this.configurationService.getValue<string>('workbench.colorTheme') || localize('friendlySettings.defaultTheme', "Default theme");
		const current = DOM.append(card, $('.friendly-settings-current'));
		DOM.append(current, $('span.friendly-settings-current-label', undefined, localize('friendlySettings.currentTheme', "Current theme")));
		DOM.append(current, $('strong', undefined, currentTheme));

		const actions = DOM.append(card, $('.friendly-settings-actions'));
		this.addButton(actions, localize('friendlySettings.changeTheme', "Change colour theme"), 'workbench.action.selectTheme');
		this.addButton(actions, localize('friendlySettings.fileIcons', "File icons"), 'workbench.action.selectIconTheme', true);
		this.addButton(actions, localize('friendlySettings.interfaceIcons', "Interface icons"), 'workbench.action.selectProductIconTheme', true);
	}

	private renderAutocompleteCard(parent: HTMLElement): void {
		const card = this.createCard(parent, 'codicon-sparkle', localize('friendlySettings.autocomplete', "Autocomplete"), localize('friendlySettings.autocomplete.description', "Instant local suggestions from the code in your workspace. No GitHub sign-in required."));
		this.addAutocompleteSwitch(card);
		DOM.append(card, $('.friendly-settings-note', undefined, localize('friendlySettings.localAutocomplete', "Runs locally and does not consume Copilot requests.")));
	}

	private renderAutoSaveCard(parent: HTMLElement): void {
		const card = this.createCard(parent, 'codicon-save', localize('friendlySettings.autoSave', "Auto Save"), localize('friendlySettings.autoSave.description', "Keep changes safe without reaching for Ctrl+S every minute."));
		this.addSwitch(card, localize('friendlySettings.enableAutoSave', "Enable auto save"), localize('friendlySettings.enableAutoSave.detail', "Save shortly after you stop typing"), 'files.autoSave', 'afterDelay', 'off');
	}

	private renderAdvancedCard(parent: HTMLElement): void {
		const card = this.createCard(parent, 'codicon-settings-gear', localize('friendlySettings.advanced', "Advanced"), localize('friendlySettings.advanced.description', "Need the whole control room? Every VS Code setting is still available."));
		const actions = DOM.append(card, $('.friendly-settings-actions'));
		this.addButton(actions, localize('friendlySettings.openAllSettings', "Open all settings"), 'workbench.action.openGlobalSettings');
		this.addButton(actions, localize('friendlySettings.openSettingsJson', "Edit settings.json"), 'workbench.action.openSettingsJson', true);
	}

	private createCard(parent: HTMLElement, icon: string, title: string, description: string): HTMLElement {
		const card = DOM.append(parent, $('section.friendly-settings-card'));
		const titleRow = DOM.append(card, $('.friendly-settings-card-title'));
		const iconElement = DOM.append(titleRow, $('span.codicon.friendly-settings-card-icon'));
		iconElement.classList.add(icon);
		const copy = DOM.append(titleRow, $('div'));
		DOM.append(copy, $('h2', undefined, title));
		DOM.append(copy, $('p', undefined, description));
		return card;
	}

	private addButton(parent: HTMLElement, label: string, command: string, secondary = false): void {
		const button = this.contentDisposables.add(new Button(parent, { ...defaultButtonStyles, secondary }));
		button.label = label;
		this.contentDisposables.add(button.onDidClick(() => this.commandService.executeCommand(command)));
	}

	private addAutocompleteSwitch(parent: HTMLElement): void {
		const label = localize('friendlySettings.enableAutocomplete', "Enable autocomplete");
		const { switchButton, refreshBase } = this.createSwitchRow(parent, label, localize('friendlySettings.enableAutocomplete.detail', "Show inline ghost-text suggestions while typing"));
		const refresh = () => {
			const inlineSuggestionsEnabled = this.configurationService.getValue<boolean>('editor.inlineSuggest.enabled') !== false;
			const completionsConfig = this.configurationService.getValue<Record<string, boolean>>('github.copilot.enable');
			refreshBase(inlineSuggestionsEnabled && completionsConfig?.['*'] !== false);
		};

		refresh();
		this.contentDisposables.add(DOM.addDisposableListener(switchButton, DOM.EventType.CLICK, async () => {
			const enabled = switchButton.getAttribute('aria-checked') === 'true';
			const next = !enabled;
			const completionsConfig = this.configurationService.getValue<Record<string, boolean>>('github.copilot.enable') ?? {};
			await Promise.all([
				this.configurationService.updateValue('editor.inlineSuggest.enabled', next, ConfigurationTarget.USER),
				this.configurationService.updateValue('github.copilot.enable', { ...completionsConfig, '*': next }, ConfigurationTarget.USER),
			]);
			refresh();
		}));
		this.contentDisposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('editor.inlineSuggest.enabled') || event.affectsConfiguration('github.copilot.enable')) {
				refresh();
			}
		}));
	}

	private addSwitch(parent: HTMLElement, label: string, detail: string, setting: string, enabledValue: unknown = true, disabledValue: unknown = false): void {
		const { switchButton, refreshBase } = this.createSwitchRow(parent, label, detail);

		const refresh = () => {
			const current = this.configurationService.getValue(setting);
			const checked = current === enabledValue || (enabledValue === true && current !== false);
			refreshBase(checked);
		};

		refresh();
		this.contentDisposables.add(DOM.addDisposableListener(switchButton, DOM.EventType.CLICK, async () => {
			const checked = switchButton.getAttribute('aria-checked') === 'true';
			await this.configurationService.updateValue(setting, checked ? disabledValue : enabledValue, ConfigurationTarget.USER);
			refresh();
		}));
		this.contentDisposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(setting)) {
				refresh();
			}
		}));
	}

	private createSwitchRow(parent: HTMLElement, label: string, detail: string): { switchButton: HTMLButtonElement; refreshBase: (checked: boolean) => void } {
		const row = DOM.append(parent, $('.friendly-settings-switch-row'));
		const text = DOM.append(row, $('div.friendly-settings-switch-copy'));
		DOM.append(text, $('strong', undefined, label));
		DOM.append(text, $('span', undefined, detail));
		const switchButton = DOM.append(row, $('button.friendly-settings-switch')) as HTMLButtonElement;
		switchButton.type = 'button';
		switchButton.setAttribute('role', 'switch');
		const refreshBase = (checked: boolean) => {
			switchButton.classList.toggle('checked', checked);
			switchButton.setAttribute('aria-checked', String(checked));
			switchButton.setAttribute('aria-label', label);
			switchButton.title = checked ? localize('friendlySettings.turnOff', "Turn off") : localize('friendlySettings.turnOn', "Turn on");
		};
		return { switchButton, refreshBase };
	}
}
