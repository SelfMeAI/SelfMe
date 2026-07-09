# Runtime Resume Scenario Matrix

This note defines how SelfMe should expand continuation and resume coverage for interrupted coding tasks.

## Purpose

We do not want to keep growing `src/smoke/agent-regression.ts` by copying isolated user transcripts forever.

Real transcripts are still valid input signals, but they must be converted into generalized scenario coverage.

The target is a small state matrix:

- what kind of task was in flight
- how that task was interrupted
- what kind of follow-up the user sent
- what concrete target should be resumed
- what must not regress

If a new failure does not add a new axis combination or a new invariant, it usually should not become a brand-new smoke family.

An equally important boundary goes the other way:

- a vague or affirmative follow-up may resume the interrupted task
- a clear new actionable request must replace the interrupted task instead of being rewritten as a resume

## Current Rule

When a task is already in flight and the interruption context is still actionable, broad follow-ups should usually resume the current task instead of restarting top-level exploration.

That rule especially applies to:

- `还能继续吗`
- `帮我优化下`
- `帮我看看项目`
- bare affirmative follow-ups after an approved proposal or approval wait

## Scenario Axes

### 1. Task type

- inspect: project or file inspection only
- mutate: direct edit/create/delete work without external verification
- verify: edit plus exact-output verification
- multi-target: multiple files or staged project work
- proposal-driven: task begins from an assistant proposal that later gets approved
- command-only: pending next step is a shell command, not a file read or edit

### 2. Interruption type

- manual stop
- tool-step slice limit
- assistant-pass slice limit
- repeated tool-recovery failure
- repeated assistant stall
- repeated shell stall
- approval wait
- verifier shift

### 3. Follow-up type

- explicit resume: `还能继续吗`
- broad optimize: `帮我优化下`
- broad inspect: `帮我看看项目`
- bare affirmative: `可以`
- ambiguous continuation
  examples: `继续`, `继续吧`, `继续 继续 干`
- genuinely new request

### 4. Resume target

- pending file read
- pending edit target
- pending verification command
- latest failure point
- latest editable working file
- pending approval action
- approved proposal as the active underlying task

## Core Invariants

Every scenario family should make the relevant subset of these assertions.

- Do not restart broad warmup once the working target is already known.
- Do not drift back to an older failure point if a newer one is more concrete.
- Do not reinterpret a broad follow-up as a brand-new task when the prior task is still in flight.
- Do not reinterpret a clear new actionable request as a resume of the older interrupted task.
- Do not lose pending approval context across stop/resume.
- Do not reread already-settled files when the pending target is narrower.
- Do not let continuation wrapper text become the new actual task.
- Do not stop after one tool if the task still has a concrete next step.
- Do not surface old hard-stop errors when slice continuation should bridge the task.

## Coverage Map

Current smoke coverage in `src/smoke/agent-regression.ts` is strong in these families:

- step-limit resume to pending file
- step-limit resume to pending command
- multi-slice advancing step-limit chains
- assistant-pass resume to pending file
- assistant-pass resume to pending command
- tool-recovery resume to pending file
- tool-recovery resume to pending command
- repeated-stall resume families
- mixed assistant-pass + tool-recovery + repeated-stall families
- proposal approval resume families
- verifier-shift resume families
- project-driven broad optimization resume families
- explicit new-task cutover after interrupted direct tasks
- explicit new-task cutover after interrupted approved-proposal execution tasks
- explicit new-task cutover after interrupted approval-wait tasks
- explicit new-task cutover after interrupted verifier-shift tasks
- explicit new-task cutover after interrupted verifier-approval tasks
- explicit new-task cutover after interrupted approved-proposal approval-wait tasks
- explicit new-task cutover after interrupted approved-proposal verifier-shift tasks
- explicit new-task cutover after interrupted approved-proposal verifier-approval tasks
- explicit new-task cutover after interrupted command-stage pending-command tasks
- explicit new-task cutover after interrupted step-limit command-only tasks
- explicit new-task cutover after interrupted assistant-pass command-only tasks
- explicit new-task cutover after interrupted tool-recovery command-only tasks

Broad follow-up parity is now intentionally covered for most stop/resume families:

- `还能继续吗`
- `帮我优化下`
- selected project-inspection follow-ups such as `帮我看看项目`

That coverage now exists across three layers:

- routing and transcript-level smoke
- context-compaction state reconstruction
- terminal-loop end-to-end interruption and follow-up behavior

## How To Add A New Regression

1. Identify the failing transcript segment.
2. Extract the abstract state:
   task type, interruption type, follow-up type, resume target.
3. Check whether an existing family already covers that state.
4. If yes, extend that family with a new parameter or assertion.
5. If no, add one new family with explicit invariants.
6. Only change `src/runtime/agent.ts` if the structured smoke exposes a semantic hole.

## Near-Term Gaps

These are the next likely worthwhile areas, in order:

1. ambiguous continuation follow-ups that are not explicit resume words but still clearly mean "keep going"
2. remaining explicit-new cutover gaps in deeper command-only interruption variants, mainly repeated-stall chains
3. longer real-project mutation chains that mix inspect, edit, verify, and approval inside one resumed task
4. targeted runtime cleanup only if new smoke exposes duplicated routing paths or inconsistent interruption anchors

## Non-Goals

This matrix is not meant to:

- define product UX
- define tool rendering policy
- replace end-to-end real manual testing
- justify runtime behavior expansion without a failing structured scenario

## Working Principle

Transcript-first discovery is fine.
Transcript-shaped implementation is not.

We use real transcripts to discover missing states, then we encode those states as reusable scenario coverage.
