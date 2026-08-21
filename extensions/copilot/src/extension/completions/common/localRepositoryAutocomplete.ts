/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface LocalAutocompleteRequest {
	readonly languageId: string;
	readonly prefix: string;
	readonly suffix: string;
}

interface IndexedDocument {
	readonly id: string;
	readonly languageId: string;
	readonly text: string;
	readonly tokenEntries: readonly (readonly [string, string])[];
	readonly lineEntries: readonly (readonly [string, string])[];
	readonly identifiers: readonly string[];
}

interface Candidate {
	readonly value: string;
	readonly score: number;
}

interface Token {
	readonly value: string;
	readonly start: number;
	readonly end: number;
}

const MAX_CANDIDATE_LENGTH = 240;
const MAX_TOKEN_KEYS = 50_000;
const MAX_LINE_KEYS = 30_000;
const MAX_VALUES_PER_KEY = 6;
const TOKEN_CONTEXT_SIZE = 3;

/**
 * A deterministic repository completion index. It learns repeated continuations
 * from source text and never sends code outside the process.
 */
export class LocalRepositoryAutocompleteIndex {
	private readonly documents = new Map<string, IndexedDocument>();
	private readonly tokenContinuations = new Map<string, Map<string, number>>();
	private readonly lineContinuations = new Map<string, Map<string, number>>();
	private readonly identifiers = new Map<string, number>();

	setDocument(id: string, languageId: string, text: string): void {
		const existing = this.documents.get(id);
		if (existing?.text === text && existing.languageId === languageId) {
			return;
		}
		if (existing) {
			this.removeDocumentContributions(existing);
		}
		const document = this.indexDocument(id, languageId, text);
		this.documents.set(id, document);
	}

	deleteDocument(id: string): void {
		const document = this.documents.get(id);
		if (document) {
			this.removeDocumentContributions(document);
			this.documents.delete(id);
		}
	}

	complete(request: LocalAutocompleteRequest): string {
		const candidates: Candidate[] = [];
		const currentLine = request.prefix.slice(request.prefix.lastIndexOf('\n') + 1).trimStart();
		const lineMatches = this.lineContinuations.get(lineKey(request.languageId, currentLine));
		for (const [value, count] of lineMatches ?? []) {
			candidates.push({ value, score: 2_000 + currentLine.length * 8 + Math.min(count, 20) * 4 });
		}

		const currentTokens = tokenize(request.prefix);
		if (currentTokens.length >= TOKEN_CONTEXT_SIZE) {
			const key = tokenKey(currentTokens.slice(-TOKEN_CONTEXT_SIZE));
			for (const [value, count] of this.tokenContinuations.get(languageKey(request.languageId, key)) ?? []) {
				candidates.push({ value, score: 1_000 + Math.min(count, 30) * 5 });
			}
			for (const [value, count] of collectTokenContinuations(request.prefix, key)) {
				candidates.push({ value, score: 1_500 + Math.min(count, 20) * 5 });
			}
		}

		const identifierPrefix = request.prefix.match(/[A-Za-z_$][\w$]*$/)?.[0];
		if (identifierPrefix && identifierPrefix.length >= 2) {
			for (const [identifier, count] of this.identifiers) {
				if (identifier.length > identifierPrefix.length && identifier.startsWith(identifierPrefix)) {
					candidates.push({ value: identifier.slice(identifierPrefix.length), score: 200 + Math.min(count, 50) });
				}
			}
		}

		return chooseCandidate(candidates, request.suffix);
	}

	private indexDocument(id: string, languageId: string, text: string): IndexedDocument {
		const tokens = tokenize(text);
		const identifierEntries: string[] = [];
		const tokenEntries: [string, string][] = [];
		const lineEntries: [string, string][] = [];
		for (const token of tokens) {
			if (/^[A-Za-z_$][\w$]*$/.test(token.value)) {
				this.identifiers.set(token.value, (this.identifiers.get(token.value) ?? 0) + 1);
				identifierEntries.push(token.value);
			}
		}
		for (let index = TOKEN_CONTEXT_SIZE - 1; index < tokens.length - 1; index++) {
			const key = tokenKey(tokens.slice(index - TOKEN_CONTEXT_SIZE + 1, index + 1));
			const continuation = takeContinuation(text, tokens[index].end);
			const fullKey = languageKey(languageId, key);
			if (addCount(this.tokenContinuations, fullKey, continuation, MAX_TOKEN_KEYS)) {
				tokenEntries.push([fullKey, continuation]);
			}
		}
		for (const line of text.split(/\r?\n/)) {
			const trimmed = line.trimStart();
			if (!trimmed) {
				continue;
			}
			const lineTokens = tokenize(trimmed);
			for (let index = 0; index < Math.min(lineTokens.length, 8); index++) {
				const prefixEnd = lineTokens[index].end;
				const prefix = trimmed.slice(0, prefixEnd);
				const continuation = trimmed.slice(prefixEnd);
				const fullKey = lineKey(languageId, prefix);
				if (addCount(this.lineContinuations, fullKey, continuation, MAX_LINE_KEYS)) {
					lineEntries.push([fullKey, continuation]);
				}
			}
		}
		return { id, languageId, text, tokenEntries, lineEntries, identifiers: identifierEntries };
	}

	private removeDocumentContributions(document: IndexedDocument): void {
		for (const [key, value] of document.tokenEntries) {
			removeCount(this.tokenContinuations, key, value);
		}
		for (const [key, value] of document.lineEntries) {
			removeCount(this.lineContinuations, key, value);
		}
		for (const identifier of document.identifiers) {
			const count = (this.identifiers.get(identifier) ?? 0) - 1;
			if (count > 0) {
				this.identifiers.set(identifier, count);
			} else {
				this.identifiers.delete(identifier);
			}
		}
	}
}

function collectTokenContinuations(text: string, desiredKey: string): Map<string, number> {
	const matches = new Map<string, number>();
	const tokens = tokenize(text);
	for (let index = TOKEN_CONTEXT_SIZE - 1; index < tokens.length - 1; index++) {
		if (tokenKey(tokens.slice(index - TOKEN_CONTEXT_SIZE + 1, index + 1)) === desiredKey && index < tokens.length - TOKEN_CONTEXT_SIZE) {
			const continuation = takeContinuation(text, tokens[index].end);
			if (continuation) {
				matches.set(continuation, (matches.get(continuation) ?? 0) + 1);
			}
		}
	}
	return matches;
}

function chooseCandidate(candidates: readonly Candidate[], suffix: string): string {
	const ranked = new Map<string, number>();
	for (const candidate of candidates) {
		const value = removeSuffixOverlap(limitLines(candidate.value), suffix);
		if (!value || !/[^\s]/.test(value) || value.length > MAX_CANDIDATE_LENGTH) {
			continue;
		}
		ranked.set(value, Math.max(ranked.get(value) ?? Number.NEGATIVE_INFINITY, candidate.score));
	}
	return [...ranked].sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)[0]?.[0] ?? '';
}

function removeSuffixOverlap(value: string, suffix: string): string {
	const maximum = Math.min(value.length, suffix.length, 160);
	for (let length = maximum; length > 0; length--) {
		if (value.endsWith(suffix.slice(0, length))) {
			return value.slice(0, -length);
		}
	}
	return value;
}

function limitLines(value: string): string {
	const lines = value.split('\n');
	return lines.length > 3 ? lines.slice(0, 3).join('\n') : value;
}

function takeContinuation(text: string, start: number): string {
	let end = Math.min(text.length, start + MAX_CANDIDATE_LENGTH);
	const blankLine = text.indexOf('\n\n', start);
	if (blankLine >= 0) {
		end = Math.min(end, blankLine);
	}
	return text.slice(start, end).trimEnd();
}

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	const pattern = /[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|\+=|-=|\*\*|[^\s]/g;
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		tokens.push({ value: match[0], start: match.index, end: pattern.lastIndex });
	}
	return tokens;
}

function tokenKey(tokens: readonly Token[]): string {
	return tokens.map(token => token.value).join('\u0000');
}

function languageKey(languageId: string, key: string): string {
	return `${languageId}\u0001${key}`;
}

function lineKey(languageId: string, prefix: string): string {
	return languageKey(languageId, prefix);
}

function addCount(target: Map<string, Map<string, number>>, key: string, value: string, maximumKeys: number): boolean {
	if (!value || !/[^\s]/.test(value)) {
		return false;
	}
	let values = target.get(key);
	if (!values) {
		if (target.size >= maximumKeys) {
			return false;
		}
		values = new Map();
		target.set(key, values);
	}
	if (!values.has(value) && values.size >= MAX_VALUES_PER_KEY) {
		return false;
	}
	values.set(value, (values.get(value) ?? 0) + 1);
	return true;
}

function removeCount(target: Map<string, Map<string, number>>, key: string, value: string): void {
	const values = target.get(key);
	if (!values) {
		return;
	}
	const count = (values.get(value) ?? 0) - 1;
	if (count > 0) {
		values.set(value, count);
	} else {
		values.delete(value);
	}
	if (values.size === 0) {
		target.delete(key);
	}
}
