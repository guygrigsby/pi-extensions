import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PORT,
  fetchClipboardImage,
  isPng,
  resolvePort,
  saveTempImage,
  shouldTakeoverPaste,
} from "../extensions/image-paste-core.mjs";

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function serve(payload) {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      if (payload.length > 0) sock.write(payload);
      sock.end();
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("isPng recognizes the PNG magic and rejects everything else", () => {
  assert.equal(isPng(PNG), true);
  assert.equal(isPng(Buffer.from("hello clipboard")), false);
  assert.equal(isPng(Buffer.alloc(0)), false);
});

test("resolvePort honors PI_IMAGE_PASTE_PORT and falls back on junk", () => {
  assert.equal(resolvePort({}), DEFAULT_PORT);
  assert.equal(resolvePort({ PI_IMAGE_PASTE_PORT: "4242" }), 4242);
  assert.equal(resolvePort({ PI_IMAGE_PASTE_PORT: "nope" }), DEFAULT_PORT);
  assert.equal(resolvePort({ PI_IMAGE_PASTE_PORT: "70000" }), DEFAULT_PORT);
});

test("shouldTakeoverPaste follows ssh env with PI_IMAGE_PASTE override", () => {
  assert.equal(shouldTakeoverPaste({}), false);
  assert.equal(shouldTakeoverPaste({ SSH_CONNECTION: "1.2.3.4 5 6.7.8.9 22" }), true);
  assert.equal(shouldTakeoverPaste({ SSH_TTY: "/dev/pts/0" }), true);
  assert.equal(shouldTakeoverPaste({ PI_IMAGE_PASTE: "1" }), true);
  assert.equal(shouldTakeoverPaste({ PI_IMAGE_PASTE: "0", SSH_CONNECTION: "x" }), false);
});

test("fetchClipboardImage returns PNG bytes from the server", async () => {
  const { server, port } = await serve(PNG);
  try {
    const buf = await fetchClipboardImage(port);
    assert.deepEqual(buf, PNG);
  } finally {
    server.close();
  }
});

test("fetchClipboardImage resolves null on empty response (no image)", async () => {
  const { server, port } = await serve(Buffer.alloc(0));
  try {
    assert.equal(await fetchClipboardImage(port), null);
  } finally {
    server.close();
  }
});

test("fetchClipboardImage rejects non-PNG data", async () => {
  const { server, port } = await serve(Buffer.from("SSH-2.0-OpenSSH_9.7"));
  try {
    await assert.rejects(() => fetchClipboardImage(port), /non-PNG/);
  } finally {
    server.close();
  }
});

test("fetchClipboardImage rejects when nothing listens", async () => {
  const { server, port } = await serve(Buffer.alloc(0));
  server.close();
  await new Promise((r) => server.on("close", r));
  await assert.rejects(() => fetchClipboardImage(port));
});

test("fetchClipboardImage rejects oversize payloads", async () => {
  const { server, port } = await serve(Buffer.concat([PNG, Buffer.alloc(1024)]));
  try {
    await assert.rejects(() => fetchClipboardImage(port, { maxBytes: 64 }), /exceeds/);
  } finally {
    server.close();
  }
});

test("saveTempImage writes a pi-clipboard-*.png file with the bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "image-paste-test-"));
  try {
    const p = saveTempImage(PNG, dir);
    assert.match(p, /pi-clipboard-[0-9a-f-]+\.png$/);
    assert.deepEqual(readFileSync(p), PNG);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
