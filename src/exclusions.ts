export function findInvalidRegex(patterns: string[]): string | undefined {
	return patterns.find((pattern) => {
		try {
			new RegExp(pattern);
			return false;
		} catch {
			return true;
		}
	});
}

export function matchesAnyRegex(value: string, patterns: string[]): boolean {
	return patterns.some((pattern) => {
		try {
			return new RegExp(pattern).test(value);
		} catch {
			return false;
		}
	});
}

function frontmatterValues(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter(
			(item: unknown): item is string => typeof item === 'string',
		);
	}
	return typeof value === 'string' ? [value] : [];
}

export function hasLinksmithDirective(
	frontmatter: Record<string, unknown> | undefined,
	directive: 'ignore' | 'ignore-headings',
): boolean {
	return frontmatterValues(frontmatter?.linksmith).some(
		(value) => value.trim().toLowerCase() === directive,
	);
}

export function getLinksmithExcludedTerms(
	frontmatter: Record<string, unknown> | undefined,
): Set<string> {
	return new Set(
		frontmatterValues(frontmatter?.linksmith_exclude_terms)
			.map((term) => term.trim().toLowerCase())
			.filter(Boolean),
	);
}

export function isLinksmithExcludedTerm(
	term: string,
	excludedTerms: Set<string>,
): boolean {
	return excludedTerms.has(term.trim().toLowerCase());
}
