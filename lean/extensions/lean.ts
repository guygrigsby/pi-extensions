/**
 * lean — the single entry point. pi lists one extension per file in
 * pi.extensions, so registering the sub-modules here (instead of listing each
 * in package.json) makes "lean" show up once, not six times.
 *
 * Each sub-module is a plain ExtensionAPI factory; loading order is preserved.
 * Split across files only for readability — see each for what it does:
 *   lean-tools     one-line, dark-gray tool blocks (the seven built-ins)
 *   lean-anytool   collapse every other tool's box to one line
 *   lean-prose     terse-output system-prompt layer
 *   lean-usermsg   thin one-line user-message bar
 *   lean-spacing   strip inter-block blank lines
 *   lean-thinking  remove the "Thinking..." label
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import leanTools from "./lean-tools";
import leanAnyTool from "./lean-anytool";
import leanProse from "./lean-prose";
import leanUsermsg from "./lean-usermsg";
import leanSpacing from "./lean-spacing";
import leanThinking from "./lean-thinking";

export default function lean(pi: ExtensionAPI): void {
	leanTools(pi);
	leanAnyTool(pi);
	leanProse(pi);
	leanUsermsg(pi);
	leanSpacing(pi);
	leanThinking(pi);
}
