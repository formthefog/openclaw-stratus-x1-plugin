---
name: end
description: End the current JFL session gracefully with automatic merge and cleanup
triggers:
  - done
  - that's it
  - I'm finished
  - end session
  - /end
  - let's wrap up
  - all set for today
---

# /end - Session Reconciliation

End the current JFL session gracefully with work preservation, conflict resolution, and handoff visibility.

---

## Core Principle

**Session ending is a critical handoff point.** Poor UX here creates uncertainty ("Did my work get saved?"), risks lost work if errors aren't handled clearly, and loses context if journal entries aren't captured.

JFL's session architecture guarantees work preservation through multiple safety layers:

1. **Continuous auto-commit** - Background process commits every 2 minutes
2. **Stop hook** - Auto-commits and merges when terminal closes
3. **This skill** - User-initiated clean ending with full visibility

When you invoke `/end`, the user wants to:
- **Know what happened** - What commits merged? What changed?
- **Trust their work is saved** - No uncertainty about state
- **Understand next steps** - What should they or others do next?
- **Get handoff context** - Synopsis of work accomplished

This skill provides **comprehensive UX orchestration** around the solid `session-cleanup.sh` infrastructure. The script handles all git operations correctly - we wrap it with clear communication, pre-flight checks, and error guidance.

### What "Clean Ending" Means

A clean session end has these properties:

1. **All work committed** - No uncommitted changes left behind
2. **Merged to working branch** - Session branch integrated, not stranded
3. **Journal entry exists** - Future sessions understand what happened
4. **Conflicts resolved** - No manual cleanup required later
5. **Remote updated** - Team can see the work
6. **Synopsis shown** - Clear summary of accomplishments

This skill ensures all six properties are met, or guides the user to resolve issues that prevent them.

### Relationship to Other Safety Mechanisms

```
User working...
    │
    ├─ Auto-commit (every 2 minutes)
    │  └─ Prevents data loss during crashes
    │
    ├─ Stop hook (terminal close)
    │  └─ Automatic fallback if /end not called
    │
    └─ /end skill (user-initiated) ← YOU ARE HERE
       └─ Best UX: visibility + control
```

**When to use each:**
- **Auto-commit**: Runs automatically, you don't invoke it
- **Stop hook**: Triggered automatically on terminal close
- **This skill**: User explicitly says "done" → invoke this for best experience

---

## When to Use This Skill

### Explicit Triggers (HIGH CONFIDENCE)

User says any of these phrases → **immediately invoke this skill**:

| Phrase | Confidence | Action |
|--------|-----------|--------|
| "done" | 100% | Invoke immediately |
| "that's it" | 100% | Invoke immediately |
| "I'm finished" | 100% | Invoke immediately |
| "end session" | 100% | Invoke immediately |
| "/end" | 100% | Invoke immediately |
| "let's wrap up" | 95% | Invoke immediately |
| "all set for today" | 95% | Invoke immediately |
| "I'm out" | 90% | Invoke immediately |
| "good for now" | 85% | Invoke immediately |
| "ship it" | 80% | Check context - might mean commit, not end |

### Implicit Triggers (CONTEXT-DEPENDENT)

User says these in a concluding context → **consider invoking**:

| Phrase | When to Invoke | When NOT to Invoke |
|--------|---------------|-------------------|
| "looks good" | After reviewing final work | After reviewing one piece of ongoing work |
| "perfect" | At end of conversation | In middle of iteration |
| "thanks" | With no pending questions | After getting help mid-session |
| "bye" | Clear goodbye | Just casual acknowledgment |

**Test: Is this the end of the session or just the end of a task?**

```
User: "Great, the auth flow works. Thanks!"

→ NOT an ending (still building, just finished one feature)
→ Don't invoke /end

User: "Auth flow is done. That's all I needed today."

→ IS an ending (explicit scope closure)
→ Invoke /end
```

### When NOT to Use

**Do NOT invoke this skill if:**

1. **User is continuing work** - "That's done, let's do X next"
2. **In middle of iteration** - "Okay that works, but change the color to blue"
3. **Just answered a question** - "Got it, thanks" (not ending, just acknowledging)
4. **Unclear intent** - If unsure, ask: "Ready to end the session, or keep going?"

---

## Pre-Flight Check

Before executing cleanup, gather complete session state. This informs what to show the user and what prompts are needed.

### Step 1: Detect Session Mode

```bash
# Read worktree state
WORKTREE_PATH=$(cat .jfl/current-worktree.txt 2>/dev/null || echo "")

if [[ "$WORKTREE_PATH" == "direct" ]]; then
    MODE="direct"
    LOCATION=$(pwd)
elif [[ -n "$WORKTREE_PATH" ]]; then
    MODE="worktree"
    LOCATION="$WORKTREE_PATH"
else
    # Not in a session
    MODE="none"
fi
```

**What this tells you:**
- `direct` → Single session, working on branch directly
- `worktree` → Multiple concurrent sessions, isolated worktree
- `none` → Not in a JFL session (shouldn't happen, but handle gracefully)

### Step 1.5: Detect Service Context

After detecting session mode, check if running in a service:

```bash
# Read config to detect environment
CONFIG_TYPE=$(jq -r '.type // "unknown"' .jfl/config.json 2>/dev/null)

if [[ "$CONFIG_TYPE" == "service" ]]; then
    # Running in a service
    GTM_PARENT=$(jq -r '.gtm_parent // empty' .jfl/config.json)

    if [[ -z "$GTM_PARENT" ]]; then
        echo "⚠️  Service not linked to GTM workspace"
        echo ""
        echo "This service can still be cleaned up, but changes won't sync to a GTM."
        echo "To link: cd <gtm> && jfl services register $(pwd)"
        echo ""
    fi

    SERVICE_NAME=$(jq -r '.name' .jfl/config.json)
    SYNC_TO_GTM=true
    echo "📡 Service context detected: $SERVICE_NAME"
    echo "   GTM parent: $GTM_PARENT"
else
    # Running in GTM or standalone
    SYNC_TO_GTM=false
fi
```

**What this tells you:**
- If `SYNC_TO_GTM=true`: This is a service session, sync after cleanup
- If `GTM_PARENT` is empty: Service exists but not linked
- Otherwise: Regular GTM or standalone session

### Step 1.6: Validate Service Configuration (Services Only)

If running in a service (`SYNC_TO_GTM=true`), validate configuration before ending:

```bash
if [[ "$SYNC_TO_GTM" == "true" ]]; then
    echo ""
    echo "🔍 Validating service configuration..."

    # Run validation (non-blocking, just show warnings)
    if jfl services validate --json > /tmp/validation-result.json 2>/dev/null; then
        # Parse results
        ERRORS=$(jq -r '.summary.errors' /tmp/validation-result.json)
        WARNINGS=$(jq -r '.summary.warnings' /tmp/validation-result.json)

        if [[ "$ERRORS" -gt 0 ]]; then
            echo "⚠️  Service validation found $ERRORS error(s)"
            echo ""
            echo "Run 'jfl services validate' to see details"
            echo "Run 'jfl services validate --fix' to auto-repair"
            echo ""

            # Ask if they want to fix before ending
            read -p "Auto-fix issues now? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                jfl services validate --fix
            fi
        elif [[ "$WARNINGS" -gt 0 ]]; then
            echo "✓ Validation passed ($WARNINGS warning(s))"
        else
            echo "✓ Service configuration valid"
        fi
    fi

    rm -f /tmp/validation-result.json
fi
```

**What this does:**
- Validates service configuration before ending session
- Non-blocking: Shows warnings but doesn't prevent session end
- Offers to auto-fix issues if errors found
- Only runs for services, not GTM workspaces

**Why this matters:**
- Catches configuration issues before they cause problems
- Prevents services from ending in an invalid state
- Ensures hooks, journal, and GTM integration are correct

### Step 2: Get Branch Information

```bash
# Current session branch
BRANCH=$(cat .jfl/current-session-branch.txt 2>/dev/null || git branch --show-current 2>/dev/null || echo "")

# Working branch (where session merges to)
WORKING_BRANCH=$(jq -r '.working_branch // "main"' .jfl/config.json 2>/dev/null || echo "main")

# Verify session branch format
if [[ ! "$BRANCH" =~ ^session- ]]; then
    echo "⚠ Not on a session branch (current: $BRANCH)"
    echo "Session branches start with 'session-'"
    echo ""
    echo "You might already be on $WORKING_BRANCH."
    echo "No cleanup needed."
    exit 0
fi
```

**What this tells you:**
- `BRANCH` → Current session being worked on
- `WORKING_BRANCH` → Where work will merge (usually `main` or `develop`)

### Step 3: Check for Uncommitted Changes

```bash
# Check working directory and staging area
if ! git diff --quiet || ! git diff --cached --quiet; then
    UNCOMMITTED=true
    UNCOMMITTED_COUNT=$(git status --porcelain | wc -l | tr -d ' ')
else
    UNCOMMITTED=false
    UNCOMMITTED_COUNT=0
fi
```

**What this tells you:**
- `true` → User has uncommitted changes, need to prompt
- `false` → Clean working directory, can proceed

### Step 4: Check for Journal Entry

```bash
# Session journal file
JOURNAL_FILE=".jfl/journal/${BRANCH}.jsonl"

if [[ -s "$JOURNAL_FILE" ]]; then
    JOURNAL_EXISTS=true
    JOURNAL_ENTRY_COUNT=$(wc -l < "$JOURNAL_FILE" | tr -d ' ')
else
    JOURNAL_EXISTS=false
    JOURNAL_ENTRY_COUNT=0
fi
```

**What this tells you:**
- `true` → Session is documented, good handoff
- `false` → No journal entry, should warn user

### Step 5: Count Session Work

```bash
# Commits in this session (since branching from working branch)
COMMIT_COUNT=$(git rev-list --count $WORKING_BRANCH..HEAD 2>/dev/null || echo "0")

# Files changed in this session
FILES_CHANGED=$(git diff --name-only $WORKING_BRANCH..HEAD 2>/dev/null | wc -l | tr -d ' ')

# Lines changed (rough metric)
LINES_ADDED=$(git diff --numstat $WORKING_BRANCH..HEAD 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
LINES_REMOVED=$(git diff --numstat $WORKING_BRANCH..HEAD 2>/dev/null | awk '{sum+=$2} END {print sum+0}')
```

**What this tells you:**
- How much work will be merged
- Whether session had any meaningful work
- Context for journal warning (lots of work, no journal = bad)

### Step 6: Calculate Session Duration

```bash
# First commit in session (timestamp)
SESSION_START=$(git log --format=%ct --reverse $WORKING_BRANCH..HEAD 2>/dev/null | head -1)

if [[ -n "$SESSION_START" ]]; then
    NOW=$(date +%s)
    DURATION_SECONDS=$((NOW - SESSION_START))
    DURATION_HOURS=$((DURATION_SECONDS / 3600))
    DURATION_MINUTES=$(((DURATION_SECONDS % 3600) / 60))
else
    # No commits yet
    DURATION_HOURS=0
    DURATION_MINUTES=0
fi
```

**What this tells you:**
- How long user has been working
- Used for synopsis timeframe (show last N hours)

### Complete Pre-Flight Check Script

Here's the full pattern to gather all session state:

```bash
#!/bin/bash

# Pre-flight check - gather complete session state

echo "Gathering session state..."

# 1. Detect mode
WORKTREE_PATH=$(cat .jfl/current-worktree.txt 2>/dev/null || echo "")
if [[ "$WORKTREE_PATH" == "direct" ]]; then
    MODE="direct"
elif [[ -n "$WORKTREE_PATH" ]]; then
    MODE="worktree"
else
    MODE="none"
fi

# 2. Get branches
BRANCH=$(cat .jfl/current-session-branch.txt 2>/dev/null || git branch --show-current 2>/dev/null || echo "")
WORKING_BRANCH=$(jq -r '.working_branch // "main"' .jfl/config.json 2>/dev/null || echo "main")

# Verify this is a session
if [[ ! "$BRANCH" =~ ^session- ]]; then
    echo "⚠ Not in a JFL session"
    exit 1
fi

# 3. Check uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    UNCOMMITTED=true
    UNCOMMITTED_COUNT=$(git status --porcelain | wc -l | tr -d ' ')
else
    UNCOMMITTED=false
    UNCOMMITTED_COUNT=0
fi

# 4. Check journal
JOURNAL_FILE=".jfl/journal/${BRANCH}.jsonl"
if [[ -s "$JOURNAL_FILE" ]]; then
    JOURNAL_EXISTS=true
    JOURNAL_ENTRY_COUNT=$(wc -l < "$JOURNAL_FILE" | tr -d ' ')
else
    JOURNAL_EXISTS=false
    JOURNAL_ENTRY_COUNT=0
fi

# 5. Count work
COMMIT_COUNT=$(git rev-list --count $WORKING_BRANCH..HEAD 2>/dev/null || echo "0")
FILES_CHANGED=$(git diff --name-only $WORKING_BRANCH..HEAD 2>/dev/null | wc -l | tr -d ' ')
LINES_ADDED=$(git diff --numstat $WORKING_BRANCH..HEAD 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
LINES_REMOVED=$(git diff --numstat $WORKING_BRANCH..HEAD 2>/dev/null | awk '{sum+=$2} END {print sum+0}')

# 6. Calculate duration
SESSION_START=$(git log --format=%ct --reverse $WORKING_BRANCH..HEAD 2>/dev/null | head -1)
if [[ -n "$SESSION_START" ]]; then
    NOW=$(date +%s)
    DURATION_SECONDS=$((NOW - SESSION_START))
    DURATION_HOURS=$((DURATION_SECONDS / 3600))
    DURATION_MINUTES=$(((DURATION_SECONDS % 3600) / 60))
else
    DURATION_HOURS=0
    DURATION_MINUTES=0
fi

# Export for use by skill
echo "MODE=$MODE"
echo "BRANCH=$BRANCH"
echo "WORKING_BRANCH=$WORKING_BRANCH"
echo "UNCOMMITTED=$UNCOMMITTED"
echo "UNCOMMITTED_COUNT=$UNCOMMITTED_COUNT"
echo "JOURNAL_EXISTS=$JOURNAL_EXISTS"
echo "JOURNAL_ENTRY_COUNT=$JOURNAL_ENTRY_COUNT"
echo "COMMIT_COUNT=$COMMIT_COUNT"
echo "FILES_CHANGED=$FILES_CHANGED"
echo "LINES_ADDED=$LINES_ADDED"
echo "LINES_REMOVED=$LINES_REMOVED"
echo "DURATION_HOURS=$DURATION_HOURS"
echo "DURATION_MINUTES=$DURATION_MINUTES"
```

You can run this and parse the output, or inline the checks directly in your skill logic.

---

## User Experience Flows

### Scenario 1: Clean State (Happy Path)

**State:** No uncommitted changes, journal exists, clean merge expected

**What user sees:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ending Session
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session: session-goose-20260210-1430-a1b2c3
Mode: worktree
Merging to: main

Changes:
  • 8 commits
  • 12 files modified
  • +234 / -67 lines

✓ Journal entry exists (3 entries)
✓ No uncommitted changes

Executing cleanup...
  ✓ Merged to main
  ✓ Pushed to origin
  ✓ Removed worktree
  ✓ Deleted session branch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Work Summary (2h 15m session)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Synopsis output here...]

✓ Session ended successfully
```

**Implementation:**

```bash
# After pre-flight check shows clean state

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Ending Session"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Session: $BRANCH"
echo "Mode: $MODE"
echo "Merging to: $WORKING_BRANCH"
echo ""
echo "Changes:"
echo "  • $COMMIT_COUNT commits"
echo "  • $FILES_CHANGED files modified"
echo "  • +$LINES_ADDED / -$LINES_REMOVED lines"
echo ""
echo "✓ Journal entry exists ($JOURNAL_ENTRY_COUNT entries)"
echo "✓ No uncommitted changes"
echo ""
echo "Executing cleanup..."

# Call session-cleanup.sh
./scripts/session/session-cleanup.sh 2>&1 | while IFS= read -r line; do
    # Filter output to show only key steps
    if [[ "$line" =~ ^✓ ]] || [[ "$line" =~ ^⚠ ]] || [[ "$line" =~ "Merged" ]] || [[ "$line" =~ "Pushed" ]]; then
        echo "  $line"
    fi
done

EXIT_CODE=${PIPESTATUS[0]}

if [[ $EXIT_CODE -eq 0 ]]; then
    # Show synopsis
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Work Summary (${DURATION_HOURS}h ${DURATION_MINUTES}m session)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    jfl synopsis $((DURATION_HOURS + 1))  # Round up to next hour
    echo ""
    echo "✓ Session ended successfully"
else
    echo ""
    echo "⚠ Session cleanup encountered issues"
    echo "See log: .jfl/logs/session-cleanup.log"
fi
```

### Scenario 2: Uncommitted Changes

**State:** User has uncommitted changes (forgot to commit before ending)

**What user sees:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Uncommitted Changes Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have 5 uncommitted changes:

  M  src/lib/auth.ts
  M  src/components/LoginForm.tsx
  A  src/lib/session-manager.ts
  ?? src/lib/types.ts
  M  README.md

Options:
  1. Auto-commit these changes (recommended)
  2. Show me the diff first
  3. Discard these changes (⚠ cannot be undone)
  4. Cancel (stay in session)

What would you like to do? [1-4]:
```

**Implementation:**

```bash
# After detecting UNCOMMITTED=true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Uncommitted Changes Detected"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "You have $UNCOMMITTED_COUNT uncommitted changes:"
echo ""
git status --porcelain | head -10 | sed 's/^/  /'
if [[ $UNCOMMITTED_COUNT -gt 10 ]]; then
    echo "  ... and $((UNCOMMITTED_COUNT - 10)) more"
fi
echo ""
```

**Then present options to the user via AskUserQuestion tool:**

```json
{
  "questions": [
    {
      "question": "What would you like to do with uncommitted changes?",
      "header": "Uncommitted",
      "multiSelect": false,
      "options": [
        {
          "label": "Auto-commit (Recommended)",
          "description": "Automatically commit all changes with message 'session: end'. Safe and fast."
        },
        {
          "label": "Show diff first",
          "description": "Review changes before deciding. Lets you see exactly what will be committed."
        },
        {
          "label": "Discard changes",
          "description": "⚠ Permanently delete uncommitted changes. Cannot be undone. Only use if you're sure."
        },
        {
          "label": "Cancel",
          "description": "Stay in the session. Commit changes manually, then run /end again."
        }
      ]
    }
  ]
}
```

**Handle each choice:**

**Choice 1: Auto-commit**
```bash
echo "Auto-committing changes..."
git add -A
git commit -m "session: end $(date +%Y-%m-%d\ %H:%M)"
echo "✓ Changes committed"
echo ""
# Continue to cleanup
```

**Choice 2: Show diff**
```bash
echo "Changes to be committed:"
echo ""
git diff HEAD
echo ""
echo "What now?"
echo "  1. Commit these changes"
echo "  2. Discard these changes"
echo "  3. Cancel"
# Prompt again
```

**Choice 3: Discard**
```bash
echo "⚠ WARNING: This will permanently delete all uncommitted changes."
echo ""
echo "Type 'discard' to confirm: "
# Wait for user confirmation
# If confirmed:
git reset --hard HEAD
git clean -fd
echo "✓ Changes discarded"
# Continue to cleanup
```

**Choice 4: Cancel**
```bash
echo "Session still active."
echo "Commit your changes, then run /end again."
exit 0
```

### Scenario 3: No Journal Entry

**State:** Session has substantial work but no journal entry

**What user sees:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Missing Journal Entry
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This session has work, but no journal entry:
  • 8 commits
  • 12 files changed
  • 2h 15m duration

Journal entries help you (and others) understand what
happened when resuming work later.

Would you like to:
  1. Write a quick journal entry now (30 seconds)
  2. Skip (not recommended, but allowed)

Choice [1-2]:
```

**Implementation:**

```bash
# After detecting JOURNAL_EXISTS=false and COMMIT_COUNT > 0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Missing Journal Entry"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This session has work, but no journal entry:"
echo "  • $COMMIT_COUNT commits"
echo "  • $FILES_CHANGED files changed"
echo "  • ${DURATION_HOURS}h ${DURATION_MINUTES}m duration"
echo ""
echo "Journal entries help you (and others) understand what"
echo "happened when resuming work later."
echo ""
```

**Present options:**

```json
{
  "questions": [
    {
      "question": "Would you like to write a journal entry?",
      "header": "Journal",
      "multiSelect": false,
      "options": [
        {
          "label": "Write entry (Recommended)",
          "description": "Quick 30-second entry. Just a title and summary of what you did."
        },
        {
          "label": "Skip",
          "description": "Not recommended. Future sessions won't have context for this work."
        }
      ]
    }
  ]
}
```

**If write entry:**

Prompt for minimal info:

```
What did you work on? (one sentence):
```

Wait for user input, then write basic journal entry:

```bash
TITLE="$USER_INPUT"
SUMMARY="Session work (auto-generated)"
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Get files changed
FILES=$(git diff --name-only $WORKING_BRANCH..HEAD | jq -R -s -c 'split("\n") | map(select(length > 0))')

# Write entry
cat >> "$JOURNAL_FILE" << EOF
{"v":1,"ts":"$TS","session":"$BRANCH","type":"session-end","status":"complete","title":"$TITLE","summary":"$SUMMARY","files":$FILES}
EOF

echo "✓ Journal entry created"
```

**If skip:**

```bash
echo "⚠ Proceeding without journal entry"
echo "Note: This makes handoffs harder for future sessions"
echo ""
# Continue to cleanup
```

### Scenario 4: Merge Conflicts

**State:** Cleanup script detects conflicts that can't be auto-resolved

**What user sees:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Merge Conflicts Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Conflicts in:
  • src/lib/auth.ts
  • src/components/LoginForm.tsx

Your session branch has been preserved: session-goose-20260210-1430-a1b2c3

To resolve manually:

1. Review changes:
   git log main..session-goose-20260210-1430-a1b2c3

2. Merge manually:
   git checkout main
   git merge session-goose-20260210-1430-a1b2c3

3. Resolve conflicts in your editor

4. Complete merge:
   git add .
   git commit
   git push origin main

5. Delete session branch:
   git branch -D session-goose-20260210-1430-a1b2c3

Need help? Ask Claude to guide you through conflict resolution.
```

**Implementation:**

```bash
# session-cleanup.sh handles conflict detection
# If it exits with conflicts, parse output and guide user

EXIT_CODE=${PIPESTATUS[0]}

if [[ $EXIT_CODE -ne 0 ]]; then
    # Check if conflicts were the issue
    if grep -q "Merge conflicts remain" .jfl/logs/session-cleanup.log; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Merge Conflicts Detected"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Conflicts in:"
        grep "Cannot auto-resolve:" .jfl/logs/session-cleanup.log | sed 's/^.*: /  • /'
        echo ""
        echo "Your session branch has been preserved: $BRANCH"
        echo ""
        echo "To resolve manually:"
        echo ""
        echo "1. Review changes:"
        echo "   git log $WORKING_BRANCH..$BRANCH"
        echo ""
        echo "2. Merge manually:"
        echo "   git checkout $WORKING_BRANCH"
        echo "   git merge $BRANCH"
        echo ""
        echo "3. Resolve conflicts in your editor"
        echo ""
        echo "4. Complete merge:"
        echo "   git add ."
        echo "   git commit"
        echo "   git push origin $WORKING_BRANCH"
        echo ""
        echo "5. Delete session branch:"
        echo "   git branch -D $BRANCH"
        echo ""
        echo "Need help? Ask Claude to guide you through conflict resolution."
    fi
fi
```

---

## Implementation Steps

### Complete Execution Flow

Here's the full implementation pattern for the `/end` skill:

```bash
#!/bin/bash

# /end skill implementation

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Preparing to End Session"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================
# STEP 1: Pre-Flight Check
# ============================================================

echo "Running pre-flight checks..."
echo ""

# Detect mode
WORKTREE_PATH=$(cat .jfl/current-worktree.txt 2>/dev/null || echo "")
if [[ "$WORKTREE_PATH" == "direct" ]]; then
    MODE="direct"
elif [[ -n "$WORKTREE_PATH" ]]; then
    MODE="worktree"
else
    MODE="none"
fi

# Get branches
BRANCH=$(cat .jfl/current-session-branch.txt 2>/dev/null || git branch --show-current 2>/dev/null || echo "")
WORKING_BRANCH=$(jq -r '.working_branch // "main"' .jfl/config.json 2>/dev/null || echo "main")

# Verify session
if [[ ! "$BRANCH" =~ ^session- ]]; then
    echo "⚠ Not in a JFL session (current branch: ${BRANCH:-none})"
    echo ""
    echo "You might already be on $WORKING_BRANCH."
    echo "Session branches start with 'session-'."
    echo ""
    echo "No cleanup needed."
    exit 0
fi

# Check uncommitted
if ! git diff --quiet || ! git diff --cached --quiet; then
    UNCOMMITTED=true
    UNCOMMITTED_COUNT=$(git status --porcelain | wc -l | tr -d ' ')
else
    UNCOMMITTED=false
    UNCOMMITTED_COUNT=0
fi

# Check journal
JOURNAL_FILE=".jfl/journal/${BRANCH}.jsonl"
if [[ -s "$JOURNAL_FILE" ]]; then
    JOURNAL_EXISTS=true
    JOURNAL_ENTRY_COUNT=$(wc -l < "$JOURNAL_FILE" | tr -d ' ')
else
    JOURNAL_EXISTS=false
    JOURNAL_ENTRY_COUNT=0
fi

# Count work
COMMIT_COUNT=$(git rev-list --count $WORKING_BRANCH..HEAD 2>/dev/null || echo "0")
FILES_CHANGED=$(git diff --name-only $WORKING_BRANCH..HEAD 2>/dev/null | wc -l | tr -d ' ')
LINES_ADDED=$(git diff --numstat $WORKING_BRANCH..HEAD 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
LINES_REMOVED=$(git diff --numstat $WORKING_BRANCH..HEAD 2>/dev/null | awk '{sum+=$2} END {print sum+0}')

# Calculate duration
SESSION_START=$(git log --format=%ct --reverse $WORKING_BRANCH..HEAD 2>/dev/null | head -1)
if [[ -n "$SESSION_START" ]]; then
    NOW=$(date +%s)
    DURATION_SECONDS=$((NOW - SESSION_START))
    DURATION_HOURS=$((DURATION_SECONDS / 3600))
    DURATION_MINUTES=$(((DURATION_SECONDS % 3600) / 60))
else
    DURATION_HOURS=0
    DURATION_MINUTES=0
fi

# ============================================================
# STEP 2: Display Session Summary
# ============================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Session Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Session: $BRANCH"
echo "Mode: $MODE"
echo "Merging to: $WORKING_BRANCH"
echo "Duration: ${DURATION_HOURS}h ${DURATION_MINUTES}m"
echo ""
echo "Changes:"
echo "  • $COMMIT_COUNT commits"
echo "  • $FILES_CHANGED files modified"
echo "  • +$LINES_ADDED / -$LINES_REMOVED lines"
echo ""

# ============================================================
# STEP 3: Handle Uncommitted Changes
# ============================================================

if [[ "$UNCOMMITTED" == "true" ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Uncommitted Changes Detected"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "You have $UNCOMMITTED_COUNT uncommitted changes:"
    echo ""
    git status --porcelain | head -10 | sed 's/^/  /'
    if [[ $UNCOMMITTED_COUNT -gt 10 ]]; then
        echo "  ... and $((UNCOMMITTED_COUNT - 10)) more"
    fi
    echo ""

    # Use AskUserQuestion tool here in actual implementation
    # For script, prompt directly:
    echo "Options:"
    echo "  1. Auto-commit (recommended)"
    echo "  2. Show diff first"
    echo "  3. Discard changes (⚠ cannot undo)"
    echo "  4. Cancel"
    echo ""
    read -p "Choice [1-4]: " CHOICE

    case $CHOICE in
        1)
            echo "Auto-committing changes..."
            git add -A
            git commit -m "session: end $(date +%Y-%m-%d\ %H:%M)"
            echo "✓ Changes committed"
            echo ""
            ;;
        2)
            git diff HEAD
            echo ""
            echo "Commit these changes? [y/n]"
            read -p "> " CONFIRM
            if [[ "$CONFIRM" =~ ^[Yy] ]]; then
                git add -A
                git commit -m "session: end $(date +%Y-%m-%d\ %H:%M)"
                echo "✓ Changes committed"
            else
                echo "Cancelled."
                exit 0
            fi
            ;;
        3)
            echo "⚠ WARNING: Permanently delete uncommitted changes?"
            read -p "Type 'discard' to confirm: " CONFIRM
            if [[ "$CONFIRM" == "discard" ]]; then
                git reset --hard HEAD
                git clean -fd
                echo "✓ Changes discarded"
            else
                echo "Cancelled."
                exit 0
            fi
            ;;
        4)
            echo "Session still active."
            echo "Commit your changes, then run /end again."
            exit 0
            ;;
    esac
fi

# ============================================================
# STEP 4: Handle Missing Journal
# ============================================================

if [[ "$JOURNAL_EXISTS" == "false" ]] && [[ $COMMIT_COUNT -gt 0 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Missing Journal Entry"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "This session has work, but no journal entry:"
    echo "  • $COMMIT_COUNT commits"
    echo "  • $FILES_CHANGED files changed"
    echo "  • ${DURATION_HOURS}h ${DURATION_MINUTES}m duration"
    echo ""
    echo "Journal entries help future sessions understand this work."
    echo ""
    echo "Options:"
    echo "  1. Write quick entry (30 seconds)"
    echo "  2. Skip (not recommended)"
    echo ""
    read -p "Choice [1-2]: " CHOICE

    if [[ "$CHOICE" == "1" ]]; then
        echo ""
        read -p "What did you work on? (one sentence): " TITLE
        SUMMARY="Session work"
        TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
        FILES=$(git diff --name-only $WORKING_BRANCH..HEAD | jq -R -s -c 'split("\n") | map(select(length > 0))')

        mkdir -p .jfl/journal
        cat >> "$JOURNAL_FILE" << EOF
{"v":1,"ts":"$TS","session":"$BRANCH","type":"session-end","status":"complete","title":"$TITLE","summary":"$SUMMARY","files":$FILES}
EOF

        echo "✓ Journal entry created"
        echo ""
    else
        echo "⚠ Proceeding without journal entry"
        echo ""
    fi
else
    echo "✓ Journal entry exists ($JOURNAL_ENTRY_COUNT entries)"
fi

if [[ "$UNCOMMITTED" == "false" ]]; then
    echo "✓ No uncommitted changes"
fi

# ============================================================
# STEP 5: Execute Cleanup
# ============================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Executing Cleanup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create logs directory
mkdir -p .jfl/logs

# Run session-cleanup.sh and capture output
./scripts/session/session-cleanup.sh 2>&1 | tee .jfl/logs/session-cleanup.log | while IFS= read -r line; do
    # Filter to show only key steps
    if [[ "$line" =~ ^✓ ]] || [[ "$line" =~ ^⚠ ]] || [[ "$line" =~ "Merged" ]] || [[ "$line" =~ "Pushed" ]] || [[ "$line" =~ "Removing" ]] || [[ "$line" =~ "Deleting" ]]; then
        echo "  $line"
    fi
done

EXIT_CODE=${PIPESTATUS[0]}

# ============================================================
# STEP 5.5: Sync to GTM (if in service)
# ============================================================

if [[ "$SYNC_TO_GTM" == "true" && -n "$GTM_PARENT" ]]; then
    echo ""
    echo "📡 Syncing to GTM workspace..."

    # Validate GTM parent exists
    if [[ ! -d "$GTM_PARENT" ]]; then
        echo "⚠️  GTM parent not found: $GTM_PARENT"
        echo "Skipping sync. Session cleaned up locally."
    else
        # Validate it's actually a GTM
        GTM_TYPE=$(jq -r '.type // empty' "$GTM_PARENT/.jfl/config.json" 2>/dev/null)
        if [[ "$GTM_TYPE" != "gtm" ]]; then
            echo "⚠️  Parent is not a GTM workspace (type: $GTM_TYPE)"
            echo "Skipping sync. Session cleaned up locally."
        else
            # 1. Sync journal entries
            mkdir -p "$GTM_PARENT/.jfl/journal"

            SYNCED_COUNT=0
            for journal in .jfl/journal/*.jsonl; do
                if [[ -f "$journal" ]]; then
                    BASENAME=$(basename "$journal")
                    TARGET="$GTM_PARENT/.jfl/journal/service-${SERVICE_NAME}-${BASENAME}"

                    # Copy journal with preserved permissions
                    cp "$journal" "$TARGET"
                    ((SYNCED_COUNT++))
                    echo "  ✓ Synced: $BASENAME"
                fi
            done

            # 2. Update GTM's last_sync timestamp
            cd "$GTM_PARENT"
            TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

            # Use jq to update the timestamp (create registered_services if needed)
            jq --arg name "$SERVICE_NAME" \
               --arg ts "$TIMESTAMP" \
               '(.registered_services // []) |= (
                 if any(.name == $name) then
                   map(if .name == $name then .last_sync = $ts else . end)
                 else
                   . + [{"name": $name, "last_sync": $ts}]
                 end
               )' \
               .jfl/config.json > .jfl/config.json.tmp && \
               mv .jfl/config.json.tmp .jfl/config.json

            # 3. Create sync entry in GTM journal
            GTM_SESSION=$(git branch --show-current 2>/dev/null || echo "main")
            GTM_JOURNAL=".jfl/journal/${GTM_SESSION}.jsonl"

            cat >> "$GTM_JOURNAL" << EOF
{"v":1,"ts":"$TIMESTAMP","session":"$GTM_SESSION","type":"sync","title":"Service sync: $SERVICE_NAME","summary":"Synced $SYNCED_COUNT journal file(s) from $SERVICE_NAME","service":"$SERVICE_NAME","files_synced":$SYNCED_COUNT}
EOF

            echo "  ✓ Updated GTM registry"
            echo ""
            echo "✅ Sync complete ($SYNCED_COUNT journal file(s) → GTM)"
        fi
    fi
fi

# ============================================================
# STEP 6: Report Results
# ============================================================

echo ""

if [[ $EXIT_CODE -eq 0 ]]; then
    # Check if merge happened or if conflicts remained
    if grep -q "Merge conflicts remain" .jfl/logs/session-cleanup.log; then
        # Conflicts - branch preserved
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Merge Conflicts Detected"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Conflicts in:"
        grep "Cannot auto-resolve:" .jfl/logs/session-cleanup.log | sed 's/^.*: /  • /'
        echo ""
        echo "Your session branch has been preserved: $BRANCH"
        echo ""
        echo "To resolve manually:"
        echo ""
        echo "1. Review changes:"
        echo "   git log $WORKING_BRANCH..$BRANCH"
        echo ""
        echo "2. Merge manually:"
        echo "   git checkout $WORKING_BRANCH"
        echo "   git merge $BRANCH"
        echo ""
        echo "3. Resolve conflicts in your editor"
        echo ""
        echo "4. Complete merge:"
        echo "   git add ."
        echo "   git commit"
        echo "   git push origin $WORKING_BRANCH"
        echo ""
        echo "5. Delete session branch:"
        echo "   git branch -D $BRANCH"
        echo ""
        echo "Need help? Ask Claude to guide you through conflict resolution."
    else
        # Success - show synopsis
        echo "✓ Session ended successfully"

        # ============================================================
        # STEP 7: Show Synopsis
        # ============================================================

        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Work Summary (${DURATION_HOURS}h ${DURATION_MINUTES}m session)"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        # Round up duration for synopsis
        SYNOPSIS_HOURS=$((DURATION_HOURS + 1))
        if [[ $SYNOPSIS_HOURS -lt 1 ]]; then
            SYNOPSIS_HOURS=1
        fi

        # Run synopsis command
        if command -v jfl >/dev/null 2>&1; then
            jfl synopsis $SYNOPSIS_HOURS 2>/dev/null || echo "Synopsis not available (jfl command not found or synopsis failed)"
        else
            echo "Synopsis not available (jfl command not in PATH)"
        fi

        echo ""
        echo "✓ All changes merged to $WORKING_BRANCH and pushed to origin"
    fi
else
    # Generic failure
    echo "⚠ Session cleanup encountered issues"
    echo ""
    echo "Check the log for details:"
    echo "  cat .jfl/logs/session-cleanup.log"
    echo ""
    echo "Your session branch is preserved: $BRANCH"
    echo "No work has been lost."
    echo ""
    echo "Common issues:"
    echo "  • Push failed → retry: git push origin $WORKING_BRANCH"
    echo "  • Merge conflicts → see conflict resolution steps above"
    echo "  • Other errors → check log and ask for help"
fi

echo ""
```

---

## Error Handling

### Error Pattern 1: Not in a Session

**Detection:**
```bash
if [[ ! "$BRANCH" =~ ^session- ]]; then
    # Not in a session
fi
```

**Message:**
```
⚠ Not in a JFL session

Current branch: main

You're already on your working branch.
Session branches start with 'session-'.

No cleanup needed.
```

**Recovery:** None needed, gracefully exit.

### Error Pattern 2: Cleanup Script Fails

**Detection:**
```bash
EXIT_CODE=${PIPESTATUS[0]}
if [[ $EXIT_CODE -ne 0 ]]; then
    # Cleanup failed
fi
```

**Message:**
```
⚠ Session cleanup encountered issues

Check the log for details:
  cat .jfl/logs/session-cleanup.log

Your session branch is preserved: session-goose-20260210-1430-a1b2c3
No work has been lost.

Common issues:
  • Push failed → retry: git push origin main
  • Merge conflicts → see conflict resolution guide
  • Other errors → share log with Claude for help
```

**Recovery:** Guide user to check log, provide common solutions.

### Error Pattern 3: Push Fails

**Detection:**
```bash
if grep -q "Push failed" .jfl/logs/session-cleanup.log; then
    # Push to remote failed
fi
```

**Message:**
```
✓ Merged to main locally
⚠ Push to origin failed

Your work is merged locally but not on GitHub yet.

To retry push:
  git push origin main

Common causes:
  • No network connection
  • Remote has new commits → fetch and merge first
  • Authentication issue → check git credentials
```

**Recovery:** Provide retry command, list common causes.

### Error Pattern 4: Synopsis Command Fails

**Detection:**
```bash
if ! jfl synopsis $HOURS 2>/dev/null; then
    # Synopsis failed
fi
```

**Handling:**
```bash
# Don't fail the entire skill if synopsis fails
jfl synopsis $HOURS 2>/dev/null || echo "Synopsis not available"
```

**Message:**
```
Synopsis not available (jfl command failed)

But your session ended successfully:
  ✓ Merged to main
  ✓ Pushed to origin
```

**Recovery:** Session end still successful, synopsis is nice-to-have.

### Error Pattern 5: Journal Write Fails

**Detection:**
```bash
if ! cat >> "$JOURNAL_FILE" << EOF ...; then
    # Journal write failed
fi
```

**Handling:**
```bash
# Try to write journal, but don't block session end if it fails
if ! cat >> "$JOURNAL_FILE" << EOF
...
EOF
then
    echo "⚠ Failed to write journal entry (file permissions?)"
    echo "Continuing with session end anyway..."
fi
```

**Message:**
```
⚠ Failed to write journal entry

Possible causes:
  • .jfl/journal/ directory doesn't exist
  • Permission issue

Session ending anyway (journal is recommended but not required).
```

**Recovery:** Session ends, user can manually add journal later.

---

## Synopsis Integration

**Always run synopsis after successful session end.** This provides handoff context for future sessions.

### Calculating Duration

```bash
# Get first commit timestamp in session
SESSION_START=$(git log --format=%ct --reverse $WORKING_BRANCH..HEAD 2>/dev/null | head -1)

if [[ -n "$SESSION_START" ]]; then
    NOW=$(date +%s)
    DURATION_SECONDS=$((NOW - SESSION_START))
    DURATION_HOURS=$((DURATION_SECONDS / 3600))
    DURATION_MINUTES=$(((DURATION_SECONDS % 3600) / 60))
else
    # No commits yet (shouldn't happen at session end, but handle gracefully)
    DURATION_HOURS=0
    DURATION_MINUTES=0
fi

# Round up for synopsis (show at least last hour)
SYNOPSIS_HOURS=$((DURATION_HOURS + 1))
if [[ $SYNOPSIS_HOURS -lt 1 ]]; then
    SYNOPSIS_HOURS=1
fi
```

### Calling Synopsis

```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Work Summary (${DURATION_HOURS}h ${DURATION_MINUTES}m session)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Call jfl synopsis command
if command -v jfl >/dev/null 2>&1; then
    jfl synopsis $SYNOPSIS_HOURS 2>/dev/null || {
        echo "Synopsis command failed"
        echo ""
        echo "Manual summary:"
        echo "  Commits: $COMMIT_COUNT"
        echo "  Files: $FILES_CHANGED"
        echo "  Lines: +$LINES_ADDED / -$LINES_REMOVED"
        echo ""
        git log --oneline $WORKING_BRANCH..HEAD~10 2>/dev/null | head -10
    }
else
    echo "Synopsis not available (jfl not in PATH)"
    echo ""
    echo "Manual summary:"
    echo "  Commits: $COMMIT_COUNT"
    echo "  Files: $FILES_CHANGED"
    echo "  Lines: +$LINES_ADDED / -$LINES_REMOVED"
    echo ""
    echo "Recent commits:"
    git log --oneline $WORKING_BRANCH..HEAD~10 2>/dev/null | head -10
fi
```

### Fallback if Synopsis Unavailable

If `jfl synopsis` fails, show manual summary:

```
Manual summary:
  Commits: 8
  Files: 12
  Lines: +234 / -67

Recent commits:
  a1b2c3d feat: add session manager
  e4f5g6h fix: auth token refresh
  i7j8k9l docs: update README
  m1n2o3p style: format code
  ...
```

---

## Integration Points

### 1. session-cleanup.sh

**Location:** `scripts/session/session-cleanup.sh`

**What it does:**
- Stops background processes (auto-commit, context-hub)
- Auto-commits uncommitted changes
- Detects worktree vs direct mode
- Pre-merge cleanup (removes session metadata)
- Merges session branch to working branch with `-X ours`
- Auto-resolves common conflicts (.jfl files, submodules)
- Pushes to remote
- Removes worktrees and deletes session branches
- Notifies jfl-services API

**How skill uses it:**
- Calls it after pre-flight checks and user prompts
- Captures output to show key steps
- Parses exit code and output for error handling
- Logs full output to `.jfl/logs/session-cleanup.log`

### 2. Journal System

**Location:** `.jfl/journal/*.jsonl`

**Format:** One JSON object per line (JSONL)

**Example entry:**
```json
{
  "v": 1,
  "ts": "2026-02-10T14:30:00.000Z",
  "session": "session-goose-20260210-1430-a1b2c3",
  "type": "session-end",
  "status": "complete",
  "title": "Session management enhancements",
  "summary": "Enhanced /end skill with comprehensive UX",
  "files": ["SKILL.md", "session-cleanup.sh"]
}
```

**How skill uses it:**
- Checks if file exists: `[[ -s ".jfl/journal/${BRANCH}.jsonl" ]]`
- Counts entries: `wc -l < "$JOURNAL_FILE"`
- Warns if missing and offers to create
- Creates minimal entry if user agrees

### 3. Synopsis Command

**Location:** `src/commands/synopsis.ts` (TypeScript)

**Usage:** `jfl synopsis [hours] [author]`

**What it returns:**
- Journal entries from all sessions/worktrees
- Git commits from all branches
- File headers (@purpose, @spec tags)
- Time audit with category breakdown
- Health checks and next steps

**How skill uses it:**
- Called after successful cleanup
- Duration calculated from session start time
- Rounds up to next hour (e.g., 2h 15m → 3 hours)
- Fallback to manual summary if command fails

### 4. Session State Files

**Location:** `.jfl/`

| File | Purpose |
|------|---------|
| `current-session-branch.txt` | Current session branch name |
| `current-worktree.txt` | Worktree path or "direct" |
| `config.json` | Project config (working_branch, etc.) |
| `logs/session-cleanup.log` | Last cleanup output |

**How skill uses it:**
- Reads to detect mode and branch info
- Used by pre-flight check
- cleanup.sh removes metadata files before merge

### 5. Working Branch Config

**Location:** `.jfl/config.json`

**Format:**
```json
{
  "name": "project-name",
  "working_branch": "develop"
}
```

**How skill uses it:**
- Reads working_branch (defaults to "main")
- Shows in summary: "Merging to: develop"
- Passed to session-cleanup.sh

---

## Dependencies & Testing

### Required Commands

The skill requires these commands to be available:

| Command | Purpose | Fallback if Missing |
|---------|---------|-------------------|
| `git` | Version control | **REQUIRED** - skill cannot run |
| `jq` | JSON parsing | Use sed/awk for simple parsing |
| `jfl` | Synopsis command | Show manual summary |
| `bash` | Shell execution | **REQUIRED** - skill runs in bash |

**Checking dependencies:**

```bash
# Check git
if ! command -v git >/dev/null 2>&1; then
    echo "Error: git is required"
    exit 1
fi

# Check jq (optional but recommended)
if ! command -v jq >/dev/null 2>&1; then
    echo "Warning: jq not found, using basic parsing"
    USE_JQ=false
else
    USE_JQ=true
fi

# Check jfl (optional)
if ! command -v jfl >/dev/null 2>&1; then
    echo "Warning: jfl not found, synopsis unavailable"
    USE_SYNOPSIS=false
else
    USE_SYNOPSIS=true
fi
```

### Required Files

| File | Purpose | What if Missing |
|------|---------|----------------|
| `scripts/session/session-cleanup.sh` | Core cleanup | **CRITICAL** - skill fails |
| `.jfl/config.json` | Working branch | Use "main" as default |
| `.jfl/current-session-branch.txt` | Session info | Read from git |

### Testing Checklist

Test these scenarios to verify the skill works correctly:

#### 1. Happy Path (Clean State)
- [ ] No uncommitted changes
- [ ] Journal entry exists
- [ ] Merges cleanly to working branch
- [ ] Pushes to origin successfully
- [ ] Shows synopsis
- [ ] Success message displayed

#### 2. Uncommitted Changes → Auto-commit
- [ ] Make changes without committing
- [ ] Choose "auto-commit" option
- [ ] Changes committed automatically
- [ ] Merge succeeds
- [ ] Synopsis shows all work

#### 3. Uncommitted Changes → Show Diff
- [ ] Make changes without committing
- [ ] Choose "show diff" option
- [ ] Diff displayed correctly
- [ ] Prompted for next action
- [ ] Can commit or cancel

#### 4. Uncommitted Changes → Discard
- [ ] Make changes without committing
- [ ] Choose "discard" option
- [ ] Warning shown
- [ ] Confirmation required
- [ ] Changes discarded (verified)
- [ ] Merge proceeds

#### 5. Uncommitted Changes → Cancel
- [ ] Make changes without committing
- [ ] Choose "cancel" option
- [ ] Session stays active
- [ ] No cleanup performed
- [ ] Can continue working

#### 6. No Journal → Write Entry
- [ ] End session without journal
- [ ] Prompted to write entry
- [ ] Choose "write entry"
- [ ] Provide title
- [ ] Entry created (verified in .jfl/journal/)
- [ ] Merge proceeds

#### 7. No Journal → Skip
- [ ] End session without journal
- [ ] Prompted to write entry
- [ ] Choose "skip"
- [ ] Warning shown
- [ ] Merge proceeds anyway

#### 8. Worktree Mode
- [ ] Start second concurrent session (creates worktree)
- [ ] Make commits in worktree
- [ ] End worktree session
- [ ] Worktree removed (verified)
- [ ] Branch deleted
- [ ] Main repo untouched

#### 9. Direct Mode
- [ ] Start single session (no worktree)
- [ ] Make commits
- [ ] End session
- [ ] Merges on same branch
- [ ] No worktree cleanup needed

#### 10. Merge Conflicts
- [ ] Create intentional conflict (modify same line in session and working branch)
- [ ] End session
- [ ] Conflicts detected
- [ ] Branch preserved (not deleted)
- [ ] Clear resolution guidance shown
- [ ] Can resolve manually

#### 11. Synopsis Display
- [ ] Work for 10+ minutes
- [ ] Make several commits
- [ ] Write journal entries
- [ ] End session
- [ ] Synopsis shows commits, files, journal entries
- [ ] Time breakdown displayed

#### 12. Not in Session
- [ ] Checkout main branch manually
- [ ] Try to invoke /end
- [ ] Graceful message shown
- [ ] Explains not in session
- [ ] No errors thrown

### Success Criteria

The skill is working correctly if:

- ✅ All 12 test scenarios pass
- ✅ User always knows what's happening at each step
- ✅ No work is lost in any scenario
- ✅ Error messages provide clear recovery steps
- ✅ Synopsis integrates cleanly after successful cleanup
- ✅ Session ends in < 30 seconds (without conflicts)
- ✅ Journal compliance encouraged without being blocking

---

## Notes for Claude

### When to Invoke This Skill

**Immediate invocation (HIGH CONFIDENCE):**
- User says "done", "that's it", "I'm finished", "end session", "/end"
- User says "wrap up", "all set", "good for now" in concluding context

**Check context first:**
- User says "thanks", "looks good", "perfect" → Is this end of session or just task?
- If unclear, ask: "Ready to end the session, or keep working?"

### What You Should Do

When you invoke this skill:

1. **Don't run commands yourself** - The skill script handles everything
2. **Present prompts to user** - Use AskUserQuestion for uncommitted/journal decisions
3. **Parse script output** - Show key steps, not full git output
4. **Guide on errors** - If conflicts, walk user through resolution
5. **Always show synopsis** - User chose "always show" preference

### What You Should NOT Do

- ❌ Don't manually run `git commit`, `git merge`, etc. - Let the script do it
- ❌ Don't skip uncommitted change check - User must decide what to do
- ❌ Don't force journal entries - Encourage but allow skip
- ❌ Don't hide errors - Parse and explain clearly

### User Preferences (From Plan)

| Setting | User Choice | How to Handle |
|---------|-------------|---------------|
| Synopsis | Always show | Run synopsis after every session end |
| Journal | Warn if missing | Prompt to write or skip, don't block |
| Verbosity | Balanced | Show summary + key steps, not full output |
| Auto-commit | Prompt | Ask what to do with uncommitted changes |

### Common User Questions

**"Did my work get saved?"**
→ Yes! Show what merged: "✓ 8 commits, 12 files merged to main and pushed"

**"What if I made a mistake?"**
→ On main, you can: `git revert <commit>` or `git reset --hard HEAD~1` (before push)

**"Can I undo the session end?"**
→ If merge happened: No, but commits are on main, can revert. If conflicts: Yes, branch preserved.

**"Where did my session branch go?"**
→ Deleted after successful merge (work is on main now). If conflicts: Preserved for manual resolution.

---

## Summary

This skill provides comprehensive UX orchestration for session ending:

1. ✅ **Pre-flight checks** - Gather complete state (mode, branches, uncommitted, journal, work stats)
2. ✅ **User prompts** - Handle uncommitted changes and missing journal gracefully
3. ✅ **Execute cleanup** - Call session-cleanup.sh with clear progress display
4. ✅ **Error handling** - Guide user through conflicts and failures
5. ✅ **Synopsis** - Always show work summary for handoff context

**Key principle:** Wrap solid infrastructure (session-cleanup.sh) with excellent UX.
