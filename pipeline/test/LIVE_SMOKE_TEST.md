# Live Smoke Test — Pipeline v2

Manual procedure to verify the pipeline end-to-end with real CLI calls.

## Prerequisites

- Claude Code CLI installed and authenticated
- Codex CLI installed and authenticated
- Pipeline compiled: `npm run pipeline:build`

## Steps

1. **Copy test fixture to pipeline directory:**

   ```bash
   cp -r pipeline/test/fixtures/milestones/m99 .pipeline/milestones/m99
   ```

2. **Re-initialize state to pick up the new milestone:**

   ```bash
   npm run pipeline -- init --force
   ```

3. **Run the pipeline:**

   ```bash
   npm run pipeline -- run
   ```

4. **Verify results:**
   - Both tasks should complete successfully
   - Check artifacts exist:

     ```bash
     ls .pipeline/milestones/m99/phases/p01/tasks/t01/
     ls .pipeline/milestones/m99/phases/p01/tasks/t02/
     ```

   - Each task directory should contain: `plan-v1.md`, `feedback-v1.md`, `plan-locked.md`, `impl-notes-v1.md`, `review-v1.md`
   - Check state.json shows all tasks completed:

     ```bash
     cat .pipeline/state.json | python3 -m json.tool
     ```

5. **Clean up:**

   ```bash
   rm -rf .pipeline/milestones/m99
   npm run pipeline -- init --force
   ```

## Expected Outcome

The pipeline should:

- Plan each task (Opus drafts, Opus challenges)
- Implement each task (Codex implements, Codex reviews)
- Mark both tasks as completed
- Exit with code 0

If any task blocks, review the artifacts and use `npm run pipeline -- unblock` to continue.
