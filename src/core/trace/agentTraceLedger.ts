import * as fs from "fs/promises"
import * as path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import crypto from "crypto"

import { safeAppendJsonl } from "../../utils/safeAppendJsonl"

const execFileAsync = promisify(execFile)

export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

export type AgentTraceRecord = {
	id: string
	timestamp: string
	vcs: {
		revision_id: string | null
	}
	intent_id: string
	mutation_class: MutationClass
	files: Array<{
		relative_path: string
		conversations: Array<{
			url: string
			contributor: {
				entity_type: "AI"
				model_identifier: string
			}
			ranges: Array<{
				start_line: number
				end_line: number
				content_hash: string
			}>
			related: Array<{
				type: "intent"
				value: string
			}>
		}>
	}>
}

export type AppendAgentTraceRecordArgs = {
	cwd: string
	intent_id: string
	mutation_class: MutationClass
	files: Array<{
		relative_path: string
		content: string
		url?: string
		model_identifier?: string
	}>
}

function countLines(content: string): number {
	if (content.length === 0) {
		return 1
	}

	return content.split(/\r\n|\n/).length
}

export function sha256(content: string): string {
	const digest = crypto.createHash("sha256").update(content).digest("hex")
	return `sha256:${digest}`
}

export async function getGitHeadSha(cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd })
		const sha = stdout.trim()
		return sha.length > 0 ? sha : null
	} catch {
		return null
	}
}

export function nowRfc3339(): string {
	return new Date().toISOString()
}

export async function ensureOrchestrationDir(cwd: string): Promise<void> {
	await fs.mkdir(path.join(cwd, ".orchestration"), { recursive: true })
}

export async function appendAgentTraceRecord(args: AppendAgentTraceRecordArgs): Promise<void> {
	await ensureOrchestrationDir(args.cwd)

	const record: AgentTraceRecord = {
		id: crypto.randomUUID(),
		timestamp: nowRfc3339(),
		vcs: {
			revision_id: await getGitHeadSha(args.cwd),
		},
		intent_id: args.intent_id,
		mutation_class: args.mutation_class,
		files: args.files.map((file) => ({
			relative_path: file.relative_path,
			conversations: [
				{
					url: file.url ?? "",
					contributor: {
						entity_type: "AI",
						model_identifier: file.model_identifier ?? "unknown",
					},
					ranges: [
						{
							start_line: 1,
							end_line: countLines(file.content),
							content_hash: sha256(file.content),
						},
					],
					related: [
						{
							type: "intent",
							value: args.intent_id,
						},
					],
				},
			],
		})),
	}

	await safeAppendJsonl(path.join(args.cwd, ".orchestration", "agent_trace.jsonl"), record)
}
