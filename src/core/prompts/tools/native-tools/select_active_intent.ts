import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION = `Select the active intent handshake before any write/destructive actions. This tool must be called first in a turn before edit/command-changing tools.`

const INTENT_ID_PARAMETER_DESCRIPTION = `The intent identifier from active_intents.yaml (e.g., INT-001)`

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: INTENT_ID_PARAMETER_DESCRIPTION,
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
