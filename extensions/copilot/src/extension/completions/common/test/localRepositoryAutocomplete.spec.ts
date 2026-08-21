/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { LocalRepositoryAutocompleteIndex } from '../localRepositoryAutocomplete';

describe('LocalRepositoryAutocompleteIndex', () => {
	test('completes a repeated line from repository code', () => {
		const index = new LocalRepositoryAutocompleteIndex();
		index.setDocument('one.ts', 'typescript', 'const message = formatMessage(value);\nconst result = formatResult(value);');
		expect(index.complete({ languageId: 'typescript', prefix: 'const message', suffix: '' })).toBe(' = formatMessage(value);');
	});

	test('learns token continuations from the current buffer', () => {
		const index = new LocalRepositoryAutocompleteIndex();
		const prefix = 'if (ready) {\n\tstartServer();\n}\nif (ready)';
		expect(index.complete({ languageId: 'typescript', prefix, suffix: '' })).toContain(' {\n\tstartServer();');
	});

	test('does not duplicate text already after the cursor', () => {
		const index = new LocalRepositoryAutocompleteIndex();
		index.setDocument('one.ts', 'typescript', 'return calculate(value);\n');
		expect(index.complete({ languageId: 'typescript', prefix: 'return', suffix: ';\n' })).toBe(' calculate(value)');
	});

	test('completes frequent repository identifiers', () => {
		const index = new LocalRepositoryAutocompleteIndex();
		index.setDocument('one.ts', 'typescript', 'completionService completionService completionService');
		expect(index.complete({ languageId: 'typescript', prefix: 'comple', suffix: '' })).toBe('tionService');
	});
});
