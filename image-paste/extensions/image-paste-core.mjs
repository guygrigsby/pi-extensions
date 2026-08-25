/**
 * image-paste core: fetch the Mac clipboard image over the ssh-forwarded
 * localhost port and land it in a temp file, mirroring pi's native paste.
 *
 * Protocol: connect, read to EOF. PNG bytes = image; empty = no image on the
 * clipboard. Anything else is an error (wrong service on the port).
 */

import net from "node:net";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_PORT = 17878;
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(buf) {
  return buf.length >= PNG_MAGIC.length && PNG_MAGIC.equals(buf.subarray(0, PNG_MAGIC.length));
}

export function resolvePort(env = process.env) {
  const raw = env.PI_IMAGE_PASTE_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/**
 * Claim ctrl+v only when pi is talking to a remote terminal: over ssh the
 * native paste reads the remote box's (empty) clipboard. PI_IMAGE_PASTE=1/0
 * forces it either way (tmux sessions can lose SSH_* env).
 */
export function shouldTakeoverPaste(env = process.env) {
  if (env.PI_IMAGE_PASTE === "1") return true;
  if (env.PI_IMAGE_PASTE === "0") return false;
  return Boolean(env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT);
}

/**
 * Fetch the clipboard image. Resolves a PNG Buffer, or null when the Mac
 * clipboard holds no image. Rejects on connection failure, timeout, oversize
 * or non-PNG data.
 */
export function fetchClipboardImage(port, options = {}) {
  const { host = "127.0.0.1", timeoutMs = 5000, maxBytes = MAX_IMAGE_BYTES } = options;
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

/** Same naming as pi's native clipboard paste so downstream handling matches. */
export function saveTempImage(bytes, dir = tmpdir()) {
  const filePath = join(dir, `pi-clipboard-${randomUUID()}.png`);
  writeFileSync(filePath, bytes);
  return filePath;
}
