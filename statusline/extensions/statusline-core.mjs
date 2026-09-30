/**
 * statusline-core — pure composition for the one-line footer.
 *
 * The line is: model icon + provider:model, repo name, branch icon + branch.
 * Nothing here imports pi or a theme, so every rule (including how it degrades
 * in a narrow terminal) is unit-testable; index.ts only applies colors and
 * registers the footer.
 */

/** Nerd Font cube — the model marker. */
export const MODEL_ICON = "\uF1B2";
/** Nerd Font powerline branch — the git marker. */
export const BRANCH_ICON = "\uE0A0";
/** Two spaces between segments; one space between an icon and its text. */
export const SEPARATOR = "  ";

/**
 * Basename of the session cwd. In a normal checkout that is the repo name;
 * trailing slashes and the root directory fall back to "" (segment dropped).
 */
export function repoName(cwd) {
	const trimmed = String(cwd ?? "").trim().replace(/\/+$/, "");
	const cut = trimmed.lastIndexOf("/");
	return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}

/**
 * `provider:model`, e.g. aperture-completions:z-ai/glm-5.3. The colon is the
 * separator because model ids routinely contain slashes.
 */
export function modelLabel(model) {
	if (!model) return "";
	const id = String(model.id ?? model.name ?? "").trim();
	if (!id) return "";
	return model.provider ? `${model.provider}:${id}` : id;
}

/** Display order, empties dropped: model, repo, branch. */
export function statusParts(model, repo, branch) {
	const parts = [];
	if (model) parts.push({ kind: "model", icon: MODEL_ICON, text: model });
	if (repo) parts.push({ kind: "repo", text: repo });
	if (branch) parts.push({ kind: "branch", icon: BRANCH_ICON, text: branch });
	return parts;
}

/** One segment as plain text: "icon text", or just the text. */
export function partText(part) {
	return part.icon ? `${part.icon} ${part.text}` : part.text;
}

/** Plain uncolored line — used for width accounting and in tests. */
export function joinParts(parts) {
	return parts.map(partText).join(SEPARATOR);
}

/**
 * Fit to the terminal: drop the repo first (it is the most recoverable), then
 * the branch, then trim the model label. Length is used as the width proxy —
 * every glyph and label here is single-width ASCII plus one-width Nerd Font
 * icons, so they agree.
 */
export function fitParts(parts, width) {
	if (!(width > 0)) return [];
	if (joinParts(parts).length <= width) return parts;

	const withoutRepo = parts.filter((part) => part.kind !== "repo");
	if (withoutRepo.length > 0 && joinParts(withoutRepo).length <= width) return withoutRepo;

	const modelOnly = withoutRepo.filter((part) => part.kind !== "branch");
	if (modelOnly.length > 0 && joinParts(modelOnly).length <= width) return modelOnly;

	const model = parts.find((part) => part.kind === "model");
	if (!model) return [];
	const room = width - (model.icon ? MODEL_ICON.length + 1 : 0);
	if (room <= 0) return [];
	const text = model.text.slice(0, room);
	return text ? [{ ...model, text }] : [];
}

/** The colored line pi renders: model muted, repo and branch dim. */
export function renderStatusline(theme, { model, repo, branch }, width) {
	return fitParts(statusParts(model, repo, branch), width)
		.map((part) => {
			const text = partText(part);
			return part.kind === "model" ? theme.fg("muted", text) : theme.fg("dim", text);
		})
		.join(SEPARATOR);
}
