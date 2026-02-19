import { HookEngine, HookEvent } from "./HookEngine"
import * as fs from "fs/promises"
import * as path from "path"
import type { Task } from "../task/Task"
import { createOwnedScopeEnforcer } from "./scopeEnforcer"
import { createDestructiveCommandApprovalHook } from "./commandApproval"
import { appendAgentTraceRecord } from "../trace/agentTraceLedger"
import type { MutationClass } from "../trace/agentTraceLedger"

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
	if (!toolParams || typeof toolParams !== "object") return null
	const command = (toolParams as { command?: unknown }).command
	return typeof command === "string" ? command : null
}

function isSafeReadCommand(command: string): boolean {
	return SAFE_READ_PATTERNS.some((pattern) => pattern.test(command))
}

function isDestructiveCommand(command: string): boolean {
	return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

function isWriteLikeTool(toolName: string): boolean {
	return ["write_to_file", "apply_diff", "edit_file", "apply_patch", "search_and_replace", "search_replace"].includes(
		toolName,
	)
}

type WriteParams = {
	path?: unknown
	filePath?: unknown
	file_path?: unknown
	intent_id?: unknown
	mutation_class?: unknown
	content?: unknown
	newContent?: unknown
}

const VALID_MUTATION_CLASSES: ReadonlySet<string> = new Set(["AST_REFACTOR", "INTENT_EVOLUTION"])

function extractWritePath(toolParams: unknown): string | null {
	if (!toolParams || typeof toolParams !== "object") {
		return null
	}

	const params = toolParams as WriteParams
	if (typeof params.path === "string" && params.path.length > 0) {
		return params.path
	}
	if (typeof params.filePath === "string" && params.filePath.length > 0) {
		return params.filePath
	}
	if (typeof params.file_path === "string" && params.file_path.length > 0) {
		return params.file_path
	}
	return null
}

function extractIntentId(toolParams: unknown): string | null {
	if (!toolParams || typeof toolParams !== "object") {
		return null
	}

	const intentId = (toolParams as WriteParams).intent_id
	return typeof intentId === "string" && intentId.length > 0 ? intentId : null
}

function extractMutationClass(toolParams: unknown): MutationClass | null {
	if (!toolParams || typeof toolParams !== "object") {
		return null
	}

	const value = (toolParams as WriteParams).mutation_class
	if (typeof value === "string" && VALID_MUTATION_CLASSES.has(value)) {
		return value as MutationClass
	}

	return null
}

function getDeterministicValidationError(toolName: string): string {
	return `Write-like tool '${toolName}' requires active intent handshake and valid params: intent_id must equal active intent, mutation_class must be AST_REFACTOR or INTENT_EVOLUTION.`
}

export function registerDefaultHooks(engine: HookEngine, task: Task) {
	engine.register("intent-gatekeeper", 5, (e: HookEvent) => {
		if (e.type !== "pre_tool_use") return

		if (e.toolName === "select_active_intent") return

		if (e.toolName === "execute_command") {
			const command = getCommandFromParams(e.toolParams)
			if (command && isSafeReadCommand(command)) return

			if (!isDestructiveCommand(command ?? "")) return

			if (!task.activeIntentId) {
				e.blocked = true
				e.reason =
					"Intent handshake required before destructive commands. Call select_active_intent(intent_id) first."
			}
			return
		}

		if (!isWriteLikeTool(e.toolName)) return

		if (!task.activeIntentId) {
			e.blocked = true
			e.reason = getDeterministicValidationError(e.toolName)
			e.errorCode = "SCOPE_VIOLATION"
			return
		}

		const intentId = extractIntentId(e.toolParams)
		if (!intentId || intentId !== task.activeIntentId) {
			e.blocked = true
			e.reason = getDeterministicValidationError(e.toolName)
			e.errorCode = "SCOPE_VIOLATION"
			return
		}

		const mutationClass = extractMutationClass(e.toolParams)
		if (!mutationClass) {
			e.blocked = true
			e.reason = getDeterministicValidationError(e.toolName)
			e.errorCode = "SCOPE_VIOLATION"
		}
	})

	engine.register("owned-scope-enforcer", 6, createOwnedScopeEnforcer(task))

	engine.register("destructive-command-approval", 7, createDestructiveCommandApprovalHook())

	engine.register("agent-trace", 10, async (e: HookEvent) => {
		try {
			await task?.appendAgentTrace?.(e)
		} catch (err) {
			console.warn("appendAgentTrace failed", err)
		}
	})

	engine.register("agent-trace-ledger", 11, async (e: HookEvent) => {
		if (e.type !== "tool_end" || e.ok !== true) {
			return
		}

		if (!isWriteLikeTool(e.toolName)) {
			return
		}

		const relPath = extractWritePath(e.toolParams)
		const intentId = extractIntentId(e.toolParams) ?? task.activeIntentId
		const mutationClass = extractMutationClass(e.toolParams) ?? "AST_REFACTOR"

		if (!relPath || !intentId) {
			return
		}

		let content: string | null = null
		if (e.toolParams && typeof e.toolParams === "object") {
			const params = e.toolParams as WriteParams
			if (typeof params.newContent === "string") {
				content = params.newContent
			} else if (typeof params.content === "string") {
				content = params.content
			}
		}

		if (content === null) {
			try {
				content = await fs.readFile(path.resolve(task.cwd, relPath), "utf-8")
			} catch {
				return
			}
		}

		try {
			await appendAgentTraceRecord({
				cwd: task.cwd,
				intent_id: intentId,
				mutation_class: mutationClass,
				files: [
					{
						relative_path: relPath,
						content,
					},
				],
			})
		} catch (err) {
			console.warn("appendAgentTraceRecord failed", err)
		}
	})
}
