import * as fs from "fs/promises"
import * as path from "path"

import type { Task } from "../task/Task"
import { fileExistsAtPath } from "../../utils/fs"

type AppendLessonInput = {
	intentId: string
	command: string
	errorSummary: string
}

const VERIFICATION_COMMAND_PATTERNS: RegExp[] = [
	/^\s*pnpm\s+test\b/i,
	/^\s*pnpm\s+-C\s+src\s+test\b/i,
	/^\s*turbo\s+test\b/i,
	/^\s*tsc\b/i,
	/^\s*check-types\b/i,
	/^\s*lint\b/i,
]

export function isVerificationCommand(command: string): boolean {
	return VERIFICATION_COMMAND_PATTERNS.some((pattern) => pattern.test(command))
}

async function getTargetLessonFile(cwd: string): Promise<string> {
	const claudePath = path.join(cwd, "CLAUDE.md")
	if (await fileExistsAtPath(claudePath)) {
		return claudePath
	}

	const agentPath = path.join(cwd, "AGENT.md")
	if (await fileExistsAtPath(agentPath)) {
		return agentPath
	}

	return claudePath
}

function trimSummary(summary: string): string[] {
	const lines = summary
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)

	if (lines.length === 0) {
		return ["No error summary provided."]
	}

	return lines.slice(0, 3)
}

export async function appendLesson(task: Task, input: AppendLessonInput): Promise<void> {
	const targetFile = await getTargetLessonFile(task.cwd)
	const summaryLines = trimSummary(input.errorSummary)

	const entry = [
		"",
		"## Lesson",
		`- date: ${new Date().toISOString()}`,
		`- intent_id: ${input.intentId}`,
		`- command: ${input.command}`,
		...summaryLines.map((line) => `- summary: ${line}`),
		"",
	].join("\n")

	await fs.appendFile(targetFile, entry, "utf-8")
}
