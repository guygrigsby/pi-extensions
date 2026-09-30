// statusline/extensions/statusline-core.mjs
var MODEL_ICON = "\uF1B2";
var BRANCH_ICON = "\uE0A0";
var SEPARATOR = "  ";
function repoName(cwd) {
  const trimmed = String(cwd ?? "").trim().replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
}
function modelLabel(model) {
  if (!model) return "";
  const id = String(model.id ?? model.name ?? "").trim();
  if (!id) return "";
  return model.provider ? `${model.provider}:${id}` : id;
}
function statusParts(model, repo, branch) {
  const parts = [];
  if (model) parts.push({ kind: "model", icon: MODEL_ICON, text: model });
  if (repo) parts.push({ kind: "repo", text: repo });
  if (branch) parts.push({ kind: "branch", icon: BRANCH_ICON, text: branch });
  return parts;
}
function partText(part) {
  return part.icon ? `${part.icon} ${part.text}` : part.text;
}
function joinParts(parts) {
  return parts.map(partText).join(SEPARATOR);
}
function fitParts(parts, width) {
  if (!(width > 0)) return [];
  if (joinParts(parts).length <= width) return parts;
  const withoutRepo = parts.filter((part) => part.kind !== "repo");
  if (withoutRepo.length > 0 && joinParts(withoutRepo).length <= width) return withoutRepo;
  const modelOnly = withoutRepo.filter((part) => part.kind !== "branch");
  if (modelOnly.length > 0 && joinParts(modelOnly).length <= width) return modelOnly;
  const model = parts.find((part) => part.kind === "model");
  if (!model) return [];
  const room = width - (model.icon ? MODEL_ICON.length + 1 : 0);
  if (room <= 0) return [];
  const text = model.text.slice(0, room);
  return text ? [{ ...model, text }] : [];
}
function renderStatusline(theme, { model, repo, branch }, width) {
  return fitParts(statusParts(model, repo, branch), width).map((part) => {
    const text = partText(part);
    return part.kind === "model" ? theme.fg("muted", text) : theme.fg("dim", text);
  }).join(SEPARATOR);
}

// statusline/extensions/index.ts
function statusline(pi) {
  if ((process.env.PI_STATUSLINE || "on").trim().toLowerCase() === "off") return;
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    setTimeout(() => {
      ctx.ui.setFooter((_tui, theme, footerData) => ({
        render(width) {
          return [
            renderStatusline(
              theme,
              {
                model: modelLabel(ctx.model),
                repo: repoName(ctx.cwd),
                branch: footerData.getGitBranch() ?? ""
              },
              width
            )
          ];
        },
        invalidate() {
        },
        dispose() {
        }
      }));
    }, 0);
  });
}
export {
  statusline as default
};
