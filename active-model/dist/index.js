// active-model/extensions/active-model-core.mjs
function activeModelBlock(model) {
  if (!model || !model.provider || !model.id) return "";
  return `<active-model>
You are currently running: ${model.provider}/${model.id}. This is your live identity and it updates if the model is switched mid-session. Orchestrate relative to it: if this is already a cheap or local model, do the work yourself instead of fanning out to subagents.
</active-model>`;
}

// active-model/extensions/index.ts
function activeModel(pi) {
  pi.on("before_agent_start", async (event, ctx) => {
    const block = activeModelBlock(ctx?.model);
    if (!block) return;
    return { systemPrompt: `${event.systemPrompt}

${block}` };
  });
}
export {
  activeModel as default
};
