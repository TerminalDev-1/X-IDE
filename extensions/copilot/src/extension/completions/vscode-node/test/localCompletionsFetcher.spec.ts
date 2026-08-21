/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { applyStops } from '../localCompletionsFetcher';

describe('LocalCompletionsFetcher', () => {
	test('applies the earliest completion stop', () => {
		expect(applyStops('first\nsecond\n\n\nthird', ['\n\n\n', '\n'])).toBe('first');
	});
});
