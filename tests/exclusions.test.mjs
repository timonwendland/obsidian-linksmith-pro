import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import * as esbuild from 'esbuild';

async function importExclusions() {
	const result = await esbuild.build({
		entryPoints: ['src/exclusions.ts'],
		bundle: true,
		platform: 'node',
		format: 'esm',
		write: false,
	});
	const encoded = Buffer.from(result.outputFiles[0].text, 'utf8').toString(
		'base64',
	);
	return import(`data:text/javascript;base64,${encoded}`);
}

test('invalid saved regex patterns are ignored without hiding valid matches', async () => {
	const { findInvalidRegex, matchesAnyRegex } = await importExclusions();

	assert.equal(findInvalidRegex(['^Draft', '[broken']), '[broken');
	assert.equal(matchesAnyRegex('Draft note', ['[broken', '^Draft']), true);
	assert.equal(
		matchesAnyRegex('Published note', ['[broken', '^Draft']),
		false,
	);
});

test('frontmatter exclusions accept scalar and list directives', async () => {
	const {
		getLinksmithExcludedTerms,
		hasLinksmithDirective,
		isLinksmithExcludedTerm,
	} = await importExclusions();

	assert.equal(
		hasLinksmithDirective({ linksmith: 'IGNORE' }, 'ignore'),
		true,
	);
	assert.equal(
		hasLinksmithDirective(
			{ linksmith: ['ignore-headings', 'ignore'] },
			'ignore-headings',
		),
		true,
	);
	const excludedTerms = getLinksmithExcludedTerms({
		linksmith_exclude_terms: [' Term One ', 'HEADING', 42],
	});
	assert.deepEqual(excludedTerms, new Set(['term one', 'heading']));
	assert.equal(isLinksmithExcludedTerm('term ONE', excludedTerms), true);
	assert.equal(
		isLinksmithExcludedTerm('term one extra', excludedTerms),
		false,
	);
});
