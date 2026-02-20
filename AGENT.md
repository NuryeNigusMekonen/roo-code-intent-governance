Protocol

Select an intent before any write-like tool.

Only edit files inside owned_scope for the active intent.

For write_to_file include intent_id and mutation_class.

After edits, run the checks in acceptance_criteria.

Lessons Learned

If tool calls get interrupted, reload VS Code window, then retry select_active_intent.

If a write is blocked as stale, re-read the file, then retry.

Keep agent_trace.jsonl append-only.

Decisions

Store orchestration state in .orchestration.

Use content_hash for spatial independence when code moves.
