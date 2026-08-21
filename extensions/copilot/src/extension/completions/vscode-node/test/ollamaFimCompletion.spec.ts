/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { buildFimPrompt, cleanFimCompletion } from '../ollamaFimCompletion';

describe('OllamaFimCompletion', () => {
	test('builds a Qwen fill-in-the-middle prompt', () => {
		expect(buildFimPrompt('const answer =', ';')).toBe('<|fim_prefix|>const answer =<|fim_suffix|>;<|fim_middle|>');
	});

	test('removes text already present in the suffix', () => {
		expect(cleanFimCompletion(' a + b;\n}', ';\n}')).toBe(' a + b');
	});

	test('removes leaked model control tokens', () => {
		expect(cleanFimCompletion(' value;<|fim_suffix|>ignored', '')).toBe(' value;');
	});
});
