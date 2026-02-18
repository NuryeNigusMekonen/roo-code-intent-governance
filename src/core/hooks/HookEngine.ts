export type HookEvent =
	| {
			type: "pre_tool_use"
			taskId?: string
			toolCallId?: string
			toolName: string
			toolParams?: unknown
			blocked?: boolean
			reason?: string
			errorCode?: "SCOPE_VIOLATION" | "HITL_REJECTED" | string
			ts?: string
			[key: string]: unknown
	  }
	| {
			type: "tool_start" | "tool_end"
			taskId?: string
			toolCallId?: string
			toolName: string
			ok?: boolean
			ts?: string
			[key: string]: unknown
	  }
	| {
			type: "gatekeeper_block"
			taskId?: string
			toolCallId?: string
			toolName: string
			reason: string
			ts?: string
			[key: string]: unknown
	  }
	| {
			type: "file_write"
			taskId?: string
			mode: "direct" | "diffview"
			relPath: string
			bytes: number
			userEdited?: boolean
			ts?: string
			[key: string]: unknown
	  }

export type HookHandler = (e: HookEvent) => Promise<void> | void

type RegisteredHook = {
	id: string
	priority: number
	handler: HookHandler
}

export class HookEngine {
	private hooks: RegisteredHook[] = []

	register(id: string, priority: number, handler: HookHandler) {
		this.hooks.push({ id, priority, handler })
		this.hooks.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
	}

	async emit(e: HookEvent) {
		for (const h of this.hooks) {
			try {
				await h.handler(e)
			} catch {
				// hook failure must not break core flow
			}
		}
	}
}
