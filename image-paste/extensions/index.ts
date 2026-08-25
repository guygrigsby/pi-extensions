/**
 * image-paste - paste Mac clipboard images into pi over ssh.
 *
 * A launchd socket service on the Mac serves the clipboard image as PNG on
 * 127.0.0.1:17878 (see mac/install.sh); an ssh RemoteForward exposes that port
 * on the remote box. Over ssh this extension claims ctrl+v (extension
 * shortcuts run before pi's native paste, which would read the remote's empty
 * clipboard), pulls the PNG through the tunnel, writes it to a temp file and
 * inserts the path - exactly what pi's native image paste does, so pi attaches
 * the image as usual. /paste-image does the same for terminals where ctrl+v
 * doesn't reach pi. Local (non-ssh) sessions keep native paste.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  fetchClipboardImage,
  resolvePort,
  saveTempImage,
  shouldTakeoverPaste,
} from "./image-paste-core.mjs";

export default function imagePaste(pi: ExtensionAPI): void {
  const port = resolvePort();

  const paste = async (ctx: ExtensionContext): Promise<void> => {
    try {
      const bytes = await fetchClipboardImage(port);
      if (!bytes) {
        ctx.ui.notify("No image on the Mac clipboard.", "info");
        return;
      }
      ctx.ui.pasteToEditor(saveTempImage(bytes));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(
        `image-paste: ${msg} - is the tunnel up? Needs RemoteForward 127.0.0.1:${port} and the Mac launchd service (see @guygrigsby/pi-image-paste README).`,
        "warning",
      );
    }
  };

  if (shouldTakeoverPaste()) {
    pi.registerShortcut("ctrl+v", {
      description: "Paste image from the local Mac clipboard through the ssh tunnel",
      handler: paste,
    });
  }

  pi.registerCommand("paste-image", {
    description: "Fetch the Mac clipboard image through the ssh tunnel and attach it",
    handler: async (_args: string, ctx: ExtensionContext) => paste(ctx),
  });
}
