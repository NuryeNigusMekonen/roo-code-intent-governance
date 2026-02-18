import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { getIntentById, loadActiveIntents } from "../intents/intentRegistry"

interface SelectActiveIntentParams {
	intent_id: string
}

function formatIntentSelectionResult(
	intentId: string,
	intent: { title: string; description: string; owned_scope: string[]; constraints: string[] },
): string {
	const ownedScope = intent.owned_scope.map((scope) => `- ${scope}`).join("\n")
	const constraints = intent.constraints.map((constraint) => `- ${constraint}`).join("\n")

	return [
		"ACTIVE_INTENT_SELECTED",
		`intent_id: ${intentId}`,
		`title: ${intent.title}`,
		`description: ${intent.description}`,
		"owned_scope:",
		ownedScope,
		"constraints:",
		constraints,
	].join("\n")
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const intentId = params.intent_id
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!intentId) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("select_active_intent", "intent_id"))
				return
			}

			const intents = await loadActiveIntents()
			const resolvedIntent = getIntentById(intents, intentId)

			if (!resolvedIntent) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`Unknown intent_id '${intentId}'. Ensure it exists in active_intents.yaml and try again.`,
					),
				)
				return
			}

			const approvalMessage = JSON.stringify({
				tool: "selectActiveIntent",
				intentId,
				title: resolvedIntent.title,
				description: resolvedIntent.description,
				ownedScope: resolvedIntent.owned_scope,
				constraints: resolvedIntent.constraints,
			})

			const didApprove = await askApproval("tool", approvalMessage)
			if (!didApprove) {
				return
			}

			task.setActiveIntent(intentId, resolvedIntent)
			task.consecutiveMistakeCount = 0
			pushToolResult(formatIntentSelectionResult(intentId, resolvedIntent))
		} catch (error) {
			await handleError("selecting active intent", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"select_active_intent">): Promise<void> {
		const intentId = block.params.intent_id
		const partialMessage = JSON.stringify({
			tool: "selectActiveIntent",
			intentId: intentId ?? "",
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
