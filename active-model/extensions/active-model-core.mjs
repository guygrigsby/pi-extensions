// active-model-core - pure formatting of the active-model call-out.
// No pi imports, so this is unit-testable in plain node.

// Build the block that tells the orchestrator which model it is running.
// Empty string if the model is unknown.
export function activeModelBlock(model) {
  if (!model || !model.provider || !model.id) return "";
  return (
    `<active-model>\n` +
    `You are currently running: ${model.provider}/${model.id}. This is your live ` +
    `identity and it updates if the model is switched mid-session. Orchestrate ` +
    `relative to it: if this is already a cheap or local model, do the work ` +
    `yourself instead of fanning out to subagents.\n` +
    `</active-model>`
  );
}
