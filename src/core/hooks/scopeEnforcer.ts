import * as fs from "fs/promises"
import * as path from "path"
import ignore from "ignore"
import micromatch from "micromatch"
import * as vscode from "vscode"

import { fileExistsAtPath } from "../../utils/fs"
import type { Task } from "../task/Task"
import type { HookEvent, HookHandler } from "./HookEngine"

const toPosix = (value: string) => value.replace(/\\/g, "/")

function extractTargetPath(toolParams: unknown): string | null {
	if (!toolParams || typeof toolParams !== "object") {
		return null
	}

	const targetPath = (toolParams as { path?: unknown }).path
	return typeof targetPath === "string" && targetPath.length > 0 ? targetPath : null
}

function isPathInsideWorkspace(workspaceRoot: string, targetAbsPath: string): boolean {
	const relative = path.relative(workspaceRoot, targetAbsPath)
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function matchesOwnedScope(targetRelPathPosix: string, ownedScope: string[]): boolean {
	if (!Array.isArray(ownedScope) || ownedScope.length === 0) {
		return false
	}

	return micromatch.isMatch(targetRelPathPosix, ownedScope.map(toPosix), { dot: true })
}

function blockWithScopeViolation(
	e: Extract<HookEvent, { type: "pre_tool_use" }>,
	activeIntentId: string | null | undefined,
	targetPath: string,
	reason: string,
) {
	e.blocked = true
	e.reason = `[owned_scope] activeIntentId=${activeIntentId ?? "null"} targetPath=${targetPath}: ${reason}`
	e.errorCode = "SCOPE_VIOLATION"
}

export function createOwnedScopeEnforcer(task: Task): HookHandler {
	return async (e: HookEvent) => {
		if (e.type !== "pre_tool_use") {
			return
		}

		if (e.toolName !== "write_to_file") {
			return
		}

		const targetPath = extractTargetPath(e.toolParams) ?? "(unknown)"
		const activeIntentId = task.activeIntentId

		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!workspaceRoot) {
			blockWithScopeViolation(e, activeIntentId, targetPath, "No workspace folder is open.")
			return
		}

		if (!task.activeIntent || !activeIntentId) {
			blockWithScopeViolation(e, activeIntentId, targetPath, "No active intent selected.")
			return
		}

		const targetAbsPath = path.isAbsolute(targetPath)
			? path.normalize(targetPath)
			: path.resolve(workspaceRoot, targetPath)

		if (!isPathInsideWorkspace(workspaceRoot, targetAbsPath)) {
			blockWithScopeViolation(e, activeIntentId, targetPath, "Target path is outside the workspace.")
			return
		}

		const targetRelPathPosix = toPosix(path.relative(workspaceRoot, targetAbsPath))

		const intentIgnorePath = path.join(workspaceRoot, ".intentignore")
		if (await fileExistsAtPath(intentIgnorePath)) {
			const content = await fs.readFile(intentIgnorePath, "utf-8")
			const matcher = ignore().add(content)

			if (matcher.ignores(targetRelPathPosix)) {
				blockWithScopeViolation(e, activeIntentId, targetPath, "Target path is blocked by .intentignore.")
				return
			}
		}

		if (!matchesOwnedScope(targetRelPathPosix, task.activeIntent.owned_scope)) {
			blockWithScopeViolation(
				e,
				activeIntentId,
				targetPath,
				"Target path is outside the active intent owned_scope.",
			)
		}
	}
}
