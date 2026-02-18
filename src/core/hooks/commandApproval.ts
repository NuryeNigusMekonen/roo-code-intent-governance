import * as vscode from "vscode"

import type { HookEvent, HookHandler } from "./HookEngine"

const DESTRUCTIVE_PATTERNS: RegExp[] = [
	/^\s*rm\b/i,
	/^\s*git\s+reset\s+--hard\b/i,
	/^\s*git\s+clean\b/i,
	/^\s*mkfs(?:\.[\w-]+)?\b/i,
	/^\s*dd\b/i,
]

function isDestructiveCommand(command: string): boolean {
	return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command))
}

function getCommandFromParams(toolParams: unknown): string | null {
	if (!toolParams || typeof toolParams !== "object") {
		return null
	}

	const command = (toolParams as { command?: unknown }).command
	return typeof command === "string" ? command : null
}

export function createDestructiveCommandApprovalHook(): HookHandler {
	return async (e: HookEvent) => {
		if (e.type !== "pre_tool_use") {
			return
		}

		if (e.toolName !== "execute_command") {
			return
		}

		if (e.blocked) {
			return
		}

		const command = getCommandFromParams(e.toolParams)
		if (!command || !isDestructiveCommand(command)) {
			return
		}

		const approval = await vscode.window.showWarningMessage(
			"Destructive operation detected. Approve?",
			{ modal: true },
			"Approve",
		)

		if (approval !== "Approve") {
			e.blocked = true
			e.reason = "Destructive operation rejected by user."
			e.errorCode = "HITL_REJECTED"
		}
	}
}
