/**
 * claude-memory - read-only. Inject the Claude Code project memory
 * (MEMORY.md and fact files) into the pi system prompt each turn. It never
 * writes: it registers no tools and no commands.
 *
 * Global memory (the user-wide ~/.claude/CLAUDE.md) is injected by the `pi`
 * shell wrapper via --append-system-prompt, not here.
 *
 * Config:
 *   PI_CCMEM  off -> do not inject anything.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { projectMemoryDir, readMemoryFiles, assembleMemoryBlock } from "./claude-memory-core.mjs";

export default function claudeMemory(pi: ExtensionAPI): void {
  if ((process.env.PI_CCMEM || "on").trim().toLowerCase() === "off") return;

  pi.on("before_agent_start", async (event: any) => {
    try {
      const cwd = event?.systemPromptOptions?.cwd ?? process.cwd();
      const block = assembleMemoryBlock(readMemoryFiles(projectMemoryDir(cwd)));
      if (!block) return;
      return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
    } catch {
      // Never let a read-only memory injection break a turn.
      return;
    }
  });
}
