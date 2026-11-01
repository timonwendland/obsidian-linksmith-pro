import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as esbuild from 'esbuild';

async function importProductionInternals() {
	const result = await esbuild.build({
		entryPoints: ['main.ts'],
		bundle: true,
		platform: 'node',
		format: 'esm',
		write: false,
		plugins: [
			{
				name: 'expose-linksmith-internals',
				setup(build) {
					build.onLoad({ filter: /main\.ts$/ }, async (args) => ({
						loader: 'ts',
						contents: `${await readFile(args.path, 'utf8')}\nexport { Indexer, RetroEngine, DEFAULT_SETTINGS };`,
					}));
				},
			},
			{
				name: 'obsidian-test-stub',
				setup(build) {
					build.onResolve({ filter: /^obsidian$/ }, () => ({
						path: 'obsidian',
						namespace: 'obsidian-test-stub',
					}));
					build.onLoad(
						{ filter: /.*/, namespace: 'obsidian-test-stub' },
						() => ({
							loader: 'js',
							contents: `
								export class Plugin {}
								export class TFile {}
								export class Notice {}
								export class EditorSuggest {}
								export class Modal {}
								export class ButtonComponent {}
								export class PluginSettingTab {}
								export class Setting {}
								export const debounce = (callback) => callback;
								export const parseFrontMatterAliases = (frontmatter) => {
									const aliases = frontmatter?.aliases ?? frontmatter?.alias ?? [];
									return Array.isArray(aliases) ? aliases : [aliases];
								};
							`,
						}),
					);
				},
			},
		],
	});
	const encoded = Buffer.from(result.outputFiles[0].text, 'utf8').toString(
		'base64',
	);
	return import(`data:text/javascript;base64,${encoded}`);
}

function markdownFile(path) {
	const name = path.slice(path.lastIndexOf('/') + 1, -3);
	return {
		path,
		basename: name,
		extension: 'md',
		stat: { mtime: 1 },
	};
}

test('production index and retro engines honor resilient exclusions together', async () => {
	const { DEFAULT_SETTINGS, Indexer, RetroEngine } =
		await importProductionInternals();
	const files = [
		markdownFile('Ignored.md'),
		markdownFile('Headings off.md'),
		markdownFile('Allowed Note.md'),
		markdownFile('Current.md'),
	];
	const cacheByPath = new Map([
		['Ignored.md', { frontmatter: { linksmith: 'ignore' } }],
		[
			'Headings off.md',
			{
				frontmatter: { linksmith: 'ignore-headings' },
				headings: [
					{
						heading: 'Must not be indexed',
						level: 2,
						position: { start: { line: 1 } },
					},
				],
			},
		],
		[
			'Allowed Note.md',
			{
				frontmatter: { aliases: ['Hidden Alias', 'Allowed Alias'] },
				headings: [
					{
						heading: 'Hidden Heading',
						level: 2,
						position: { start: { line: 2 } },
					},
				],
			},
		],
		[
			'Current.md',
			{
				frontmatter: {
					linksmith_exclude_terms: ['Hidden Alias', 'Hidden Heading'],
				},
			},
		],
	]);
	const plugin = {
		settings: {
			...DEFAULT_SETTINGS,
			excludedTitlePatterns: ['[legacy-invalid'],
			excludedHeadingPatterns: ['[legacy-invalid'],
			retroMinConfidence: 0.6,
			partialWordMatches: false,
		},
		app: {
			vault: {
				getMarkdownFiles: () => files,
				read: async () =>
					'Allowed Note, Hidden Alias, and Hidden Heading appear here.',
			},
			metadataCache: {
				getFileCache: (file) => cacheByPath.get(file.path),
				resolvedLinks: {},
			},
		},
	};
	plugin.indexer = new Indexer(plugin);

	await plugin.indexer.build();

	assert.equal(plugin.indexer.noteIndex.has('Ignored.md'), false);
	assert.equal(plugin.indexer.noteIndex.has('Headings off.md'), true);
	assert.equal(plugin.indexer.headingIndex.has('Headings off.md'), false);
	assert.deepEqual(
		plugin.indexer.headingIndex
			.get('Allowed Note.md')
			?.map((heading) => heading.heading),
		['Hidden Heading'],
	);

	const suggestions = await new RetroEngine(plugin).scanFile(files[3]);
	assert.deepEqual(
		suggestions.map((suggestion) => suggestion.span),
		['Allowed Note'],
	);
});
