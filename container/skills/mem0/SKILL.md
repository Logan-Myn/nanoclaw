---
name: mem0
description: Persistent memory — remember facts, recall context, and list memories across sessions. Use proactively when you learn something important or need context from past interactions.
allowed-tools: Bash(mem0:*)
---

# Mem0 — Persistent Memory

You have persistent memory that survives across sessions. Use it to remember important facts about the user, project decisions, and team context.

## Commands

```bash
# Remember something
mem0 remember "The user prefers dark mode and uses TypeScript"

# Remember with explicit scope
mem0 remember "Logan likes concise responses" --user logan
mem0 remember "We decided to use PostgreSQL for the new service" --user team

# Recall relevant memories
mem0 recall "user preferences"
mem0 recall "database decisions" --user team

# List all memories
mem0 list
mem0 list --user logan
mem0 list --user team
```

## When to use

**Remember** when you learn:
- User preferences or habits
- Project decisions or constraints
- Important facts about people or the team
- Recurring patterns or requests

**Recall** when:
- Starting a new conversation (check for relevant context)
- The user references past discussions
- You need context about prior decisions
- Working on something that may have history

## Scoping

- Default `user_id` is `logan` (the human)
- Use `--user team` for shared team knowledge
- Your `agent_id` is set automatically from your agent identity
