/**
 * header-core — pure formatting for the startup header.
 *
 * No pi/theme imports so it's unit-testable with plain strings. The .ts
 * extension supplies colors and the git/os lookups around these pieces.
 */

export function timeOfDay(hour) {
	if (hour < 5) return "late night";
	if (hour < 12) return "morning";
	if (hour < 18) return "afternoon";
	return "evening";
}

function firstToken(s) {
	return String(s ?? "").trim().split(/\s+/)[0] ?? "";
}

function capitalize(s) {
	return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The greeting name: first token of the first non-empty source, capitalized.
 * Sources in priority order, e.g. (PI_HEADER_NAME, git user.name, os username):
 *   "Guy J Grigsby" → "Guy",  "guygrigsby" → "Guygrigsby".
 */
export function greetingName(...sources) {
	for (const src of sources) {
		const tok = firstToken(src);
		if (tok) return capitalize(tok);
	}
	return "there";
}
