// image-paste/extensions/image-paste-core.mjs
import net from "node:net";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
var DEFAULT_PORT = 17878;
var MAX_IMAGE_BYTES = 32 * 1024 * 1024;
var PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function isPng(buf) {
  return buf.length >= PNG_MAGIC.length && PNG_MAGIC.equals(buf.subarray(0, PNG_MAGIC.length));
}
function resolvePort(env = process.env) {
  const raw = env.PI_IMAGE_PASTE_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}
function shouldTakeoverPaste(env = process.env) {
  if (env.PI_IMAGE_PASTE === "1") return true;
  if (env.PI_IMAGE_PASTE === "0") return false;
  return Boolean(env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT);
}
function fetchClipboardImage(port, options = {}) {
  const { host = "127.0.0.1", timeoutMs = 5e3, maxBytes = MAX_IMAGE_BYTES } = options;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const sock = net.connect({ host, port });
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      fn(value);
    };
    sock.setTimeout(timeoutMs, () => finish(reject, new Error(`timed out after ${timeoutMs}ms`)));
    sock.on("error", (err) => finish(reject, err));
    sock.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        finish(reject, new Error(`clipboard image exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    sock.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) {
        finish(resolve, null);
      } else if (isPng(buf)) {
        finish(resolve, buf);
      } else {
        finish(reject, new Error(`port ${port} returned ${buf.length} non-PNG bytes; is something else listening?`));
      }
    });
  });
}
function saveTempImage(bytes, dir = tmpdir()) {
  const filePath = join(dir, `pi-clipboard-${randomUUID()}.png`);
  writeFileSync(filePath, bytes);
  return filePath;
}

// image-paste/extensions/index.ts
function imagePaste(pi) {
  const port = resolvePort();
  const paste = async (ctx) => {
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
        "warning"
      );
    }
  };
  if (shouldTakeoverPaste()) {
    pi.registerShortcut("ctrl+v", {
      description: "Paste image from the local Mac clipboard through the ssh tunnel",
      handler: paste
    });
  }
  pi.registerCommand("paste-image", {
    description: "Fetch the Mac clipboard image through the ssh tunnel and attach it",
    handler: async (_args, ctx) => paste(ctx)
  });
}
export {
  imagePaste as default
};
