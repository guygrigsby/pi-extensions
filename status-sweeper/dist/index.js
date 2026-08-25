// status-sweeper/extensions/index.ts
var SWEEP_INTERVAL_MS = 1e3;
function statusSweeper(pi) {
  if ((process.env.PI_STATUS_SWEEPER || "on").trim().toLowerCase() === "off") return;
  let provider;
  let lastCtx;
  let timer;
  function captureProvider(ctx) {
    if (provider || ctx?.mode !== "tui" || !ctx.ui?.setFooter) return;
    ctx.ui.setFooter((_tui, _theme, footerData) => {
      provider = footerData;
      return { render: () => [], invalidate() {
      }, dispose() {
      } };
    });
    ctx.ui.setFooter(void 0);
  }
  function sweep(ctx) {
    const c = ctx ?? lastCtx;
    if (!provider || !c?.ui?.setStatus) return;
    for (const key of provider.getExtensionStatuses().keys()) {
      c.ui.setStatus(key, void 0);
    }
  }
  function sweepSoon(ctx) {
    lastCtx = ctx;
    setTimeout(() => sweep(ctx), 0);
  }
  pi.on("session_start", async (_event, ctx) => {
    if (ctx?.mode !== "tui") return;
    lastCtx = ctx;
    captureProvider(ctx);
    sweepSoon(ctx);
    if (!timer) {
      timer = setInterval(() => sweep(), SWEEP_INTERVAL_MS);
      timer.unref?.();
    }
  });
  pi.on("agent_start", async (_event, ctx) => sweepSoon(ctx));
  pi.on("agent_end", async (_event, ctx) => sweepSoon(ctx));
  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = void 0;
    provider = void 0;
  });
}
export {
  statusSweeper as default
};
