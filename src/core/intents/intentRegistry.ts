import * as fs from "fs/promises"
import * as yaml from "yaml"
import * as vscode from "vscode"

import { fileExistsAtPath } from "../../utils/fs"

export interface IntentDef {
	title: string
	description: string
	owned_scope: string[]
	constraints: string[]
}

export type IntentRegistry = Record<string, IntentDef>

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export async function loadActiveIntents(): Promise<IntentRegistry> {
	const workspaceRootUri = vscode.workspace.workspaceFolders?.[0]?.uri

	if (!workspaceRootUri) {
		throw new Error("No workspace folder is open. Cannot resolve active intents file.")
	}

	const orchestrationIntentUri = vscode.Uri.joinPath(workspaceRootUri, ".orchestration", "active_intents.yaml")
	const rootIntentUri = vscode.Uri.joinPath(workspaceRootUri, "active_intents.yaml")

	const intentFilePath = (await fileExistsAtPath(orchestrationIntentUri.fsPath))
		? orchestrationIntentUri.fsPath
		: (await fileExistsAtPath(rootIntentUri.fsPath))
			? rootIntentUri.fsPath
			: null

	if (!intentFilePath) {
		return {}
	}

	const content = await fs.readFile(intentFilePath, "utf-8")
	const parsed = yaml.parse(content)

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return {}
	}

	const registry: IntentRegistry = {}

	for (const [intentId, rawIntent] of Object.entries(parsed as Record<string, unknown>)) {
		if (!rawIntent || typeof rawIntent !== "object" || Array.isArray(rawIntent)) {
			continue
		}

		const intentRecord = rawIntent as Record<string, unknown>
		const title = intentRecord.title
		const description = intentRecord.description
		const ownedScope = intentRecord.owned_scope
		const constraints = intentRecord.constraints

		if (
			typeof title !== "string" ||
			typeof description !== "string" ||
			!isStringArray(ownedScope) ||
			!isStringArray(constraints)
		) {
			continue
		}

		registry[intentId] = {
			title,
			description,
			owned_scope: ownedScope,
			constraints,
		}
	}

	return registry
}

export function getIntentById(intents: IntentRegistry, id: string): IntentDef | undefined {
	return intents[id]
}
