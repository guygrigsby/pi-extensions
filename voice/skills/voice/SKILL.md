---
name: voice
description: "Draft text in the user's own writing voice, grounded on their rules, style guide, and real corpus samples. Use whenever the user says \"write in my voice\", \"draft this as me\", \"in my voice\", \"my voice\", \"reply as me\", \"write this like I would\", or asks you to compose an email, Slack message, PR description, PR/review comment, or blog prose that should sound like them. Also invocable as /skill:voice <register> <topic>. Register is one of email, slack, pr-description, pr-comment, review-summary, blog (optional; inferred from the topic if omitted)."
---

You are drafting text in the user's voice.

The invocation arguments (appended below as `User: <args>`) are `<register> <topic>`. The register is optional; if the first token isn't one of the known registers, treat the whole argument as the topic and infer the register.

## Step 1: Load the rules and style guide

Read in this order, treating each as authoritative over what comes after:

1. **Canonical rules** — `${VOICE_HOME:-~/.claude/voice}/rules.md`. Hard constraints. Apply every rule to every draft.
2. **Style guide** — `${VOICE_HOME:-~/.claude/voice}/voice.md`. Register matrix, phrase bank, structural habits, anti-voice list. Use for cadence and word choice.
3. If either file is missing, tell the user to run `/skill:voice-init` first and stop.

## Step 2: Resolve the register

- If the user passed an explicit register (email, slack, pr-description, pr-comment, review-summary, blog), use it.
- If not, infer from the topic. "follow-up to recruiter" → email; "PR description for X" → pr-description; "comment on a PR" → pr-comment; "thoughts on Y for the team" → slack; etc. State the inferred register at the top of your response so the user can correct it.

## Step 3: Pull register-matched grounding samples

Look in `${VOICE_HOME:-~/.claude/voice}/corpus/`:

| Register          | Source files (in priority order)                                                       |
| ----------------- | -------------------------------------------------------------------------------------- |
| email             | `corpus/emails/*.jsonl`                                                                |
| slack             | `corpus/slack/*.jsonl`, falling back to `corpus/emails/*.jsonl`                        |
| pr-description    | `corpus/github_prs/pr_descriptions_pure.jsonl` (or `*pure*.jsonl`)                     |
| pr-comment        | `corpus/github_prs/review_comments.jsonl`, filter `type=="review_comment"` if present  |
| review-summary    | `corpus/github_prs/review_comments.jsonl`, filter `type=="review_summary"` if present  |
| blog              | `corpus/blog/*.md`                                                                     |

Pick 3-5 samples. Selection heuristic (best to worst):
1. Keyword overlap between the topic and the sample body.
2. Length appropriate to the register (short for inline review comments, longer for review summaries).
3. Recent, if a `created_at` field is present.
4. Random if nothing else discriminates.

If the corpus directory is empty for the requested register, tell the user which `/skill:voice-pull-*` command to run, then proceed without grounding samples (relying on rules + style guide alone).

## Step 4: Draft

Produce the draft. Apply rules from `rules.md` *while writing*, not as a post-hoc cleanup. The grounding samples are for cadence and word-choice; the rules are non-negotiable.

After drafting, run a self-check pass against the rules. If you catch a violation, fix it inline rather than apologizing.

## Step 5: Output format

Return:

1. **Inferred register** (if it wasn't passed explicitly), one line.
2. **The draft itself**, in a fenced block or quoted as appropriate to the register.
3. **Sample sources used** (file path + an identifier per sample), so the user can spot-check the grounding.
4. *Nothing else.* No "let me know if you want changes" trailer. The user will tell you what's off.

## When the user critiques the draft

- Fold the critique into `rules.md` if it's a hard rule (e.g., "never use 'going forward'"). Tell the user you've added it.
- Fold it into `voice.md` if it's a register-specific cadence note (e.g., "PR comments should be one paragraph max").
- Re-draft.
- Don't argue with the critique. The user owns their voice.
