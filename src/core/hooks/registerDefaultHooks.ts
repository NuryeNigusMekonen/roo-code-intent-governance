import { HookEngine, HookEvent } from "./HookEngine"
import type { Task } from "../task/Task"
import { createOwnedScopeEnforcer } from "./scopeEnforcer"
import { createDestructiveCommandApprovalHook } from "./commandApproval"

const SAFE_READ_PATTERNS: RegExp[] = [
	/^\s*pwd\b/i,
	/^\s*ls\b/i,
	/^\s*cat\b/i,
	/^\s*sed\b/i,
	/^\s*rg\b/i,
	/^\s*find\b/i,
	/^\s*head\b/i,
	/^\s*tail\b/i,
	/^\s*git\s+status\b/i,
	/^\s*git\s+diff\b/i,
	/^\s*git\s+log\b/i,
]

const DESTRUCTIVE_COMMAND_PATTERNS: RegExp[] = [
	/^\s*rm\b/i,
	/^\s*git\s+reset\s+--hard\b/i,
	/^\s*git\s+clean\b/i,
	/^\s*mkfs(?:\.[\w-]+)?\b/i,
	/^\s*dd\b/i,
]

function getCommandFromParams(toolParams: unknown): string | null {
	if (!toolParams || typeof toolParams !== "object") {
		return null
	}

	const command = (toolParams as { command?: unknown }).command
	return typeof command === "string" ? command : null
}

function isSafeReadCommand(command: string): boolean {
	return SAFE_READ_PATTERNS.some((pattern) => pattern.test(command))
}

function isDestructiveCommand(command: string): boolean {
	return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

export function registerDefaultHooks(engine: HookEngine, task: Task) {
	engine.register("intent-gatekeeper", 5, (e: HookEvent) => {
		if (e.type !== "pre_tool_use") {
			return
		}

		if (e.toolName === "select_active_intent") {
			return
		}

		if (e.toolName === "execute_command") {
			const command = getCommandFromParams(e.toolParams)
			if (command && isSafeReadCommand(command)) {
				return
			}

			if (!command || !isDestructiveCommand(command)) {
				return
			}
		}

		if (e.toolName !== "write_to_file" && e.toolName !== "execute_command") {
			return
		}

		if (!task.activeIntentId) {
			e.blocked = true
			e.reason =
				`Intent handshake required before using ${e.toolName}. ` + `Call select_active_intent(intent_id) first.`
		}
	})

	engine.register("owned-scope-enforcer", 6, createOwnedScopeEnforcer(task))

	engine.register("destructive-command-approval", 7, createDestructiveCommandApprovalHook())

	engine.register("agent-trace", 10, async (e: HookEvent) => {
		await task.appendAgentTrace(e)
	})
}
