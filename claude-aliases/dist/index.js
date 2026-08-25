// claude-aliases/extensions/index.ts
function claudeAliases(pi) {
  pi.registerCommand("exit", {
    description: "Exit pi",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    }
  });
  pi.registerCommand("clear", {
    description: "Clear context (start a new session)",
    handler: async (_args, ctx) => {
      await ctx.newSession();
    }
  });
}
export {
  claudeAliases as default
};
