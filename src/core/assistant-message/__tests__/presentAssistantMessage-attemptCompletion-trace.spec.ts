// npx vitest src/core/assistant-message/__tests__/presentAssistantMessage-attemptCompletion-trace.spec.ts

import { describe, expect, test, vi } from "vitest"

import { presentAssistantMessage } from "../presentAssistantMessage"

vi.mock("../../task/Task")
vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn((toolName: string) =>
		["list_files", "attempt_completion", "ask_followup_question", "read_file", "write_to_file"].includes(toolName),
	),
}))
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureToolUsage: vi.fn(),
			captureConsecutiveMistakeError: vi.fn(),
			captureTaskCompleted: vi.fn(),
		},
	},
}))
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((_key: string, defaultValue: any) => defaultValue),
		})),
	},
}))

describe("presentAssistantMessage - attempt_completion tool tracing", () => {
	const waitForTraceCalls = async (predicate: () => void, retries = 25, delayMs = 10): Promise<void> => {
		let lastError: unknown
		for (let i = 0; i < retries; i++) {
			try {
				predicate()
				return
			} catch (error) {
				lastError = error
				await new Promise((resolve) => setTimeout(resolve, delayMs))
			}
		}
		throw lastError
	}

	test("writes tool_start and tool_end exactly once for successful attempt_completion with ok=true", async () => {
		const toolCallId = "call_attempt_completion_1"

		const mockTask: any = {
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			loopPhase: "execute",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [
				{
					type: "tool_use",
					id: toolCallId,
					name: "attempt_completion",
					params: { result: "Completed" },
					nativeArgs: { result: "Completed" },
					partial: false,
				},
			],
			pendingToolUses: [],
			userMessageContent: [],
			didCompleteReadingStream: false,
			didRejectTool: false,
			didAlreadyUseTool: false,
			didToolFailInCurrentTurn: false,
			consecutiveMistakeCount: 0,
			clineMessages: [],
			toolUsage: {},
			api: {
				getModel: () => ({ id: "test-model", info: {} }),
			},
			providerRef: {
				deref: () => ({
					getState: vi.fn().mockResolvedValue({
						mode: "code",
						customModes: [],
						experiments: {},
					}),
				}),
			},
			toolRepetitionDetector: {
				check: vi.fn().mockReturnValue({ allowExecution: true }),
			},
			recordToolUsage: vi.fn(),
			recordToolError: vi.fn(),
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked", text: "", images: [] }),
			emitFinalTokenUsageUpdate: vi.fn(),
			emit: vi.fn(),
			getTokenUsage: vi.fn().mockReturnValue({}),
			hooks: {
				emit: vi.fn().mockResolvedValue(undefined),
			},
			pushToolResultToUserContent: vi.fn().mockImplementation((toolResult: any) => {
				const exists = mockTask.userMessageContent.find(
					(block: any) => block.type === "tool_result" && block.tool_use_id === toolResult.tool_use_id,
				)
				if (exists) {
					return false
				}
				mockTask.userMessageContent.push(toolResult)
				return true
			}),
		}

		mockTask.pendingToolUses = mockTask.assistantMessageContent
		await presentAssistantMessage(mockTask)

		const traceCalls = mockTask.hooks.emit.mock.calls.map((call: any[]) => call[0])
		const toolStartCalls = traceCalls.filter((event: any) => event.type === "tool_start")
		const toolEndCalls = traceCalls.filter((event: any) => event.type === "tool_end")

		expect(toolStartCalls).toHaveLength(1)
		expect(toolStartCalls[0]).toMatchObject({
			type: "tool_start",
			toolCallId,
			toolName: "attempt_completion",
		})

		expect(toolEndCalls).toHaveLength(1)
		expect(toolEndCalls[0]).toMatchObject({
			type: "tool_end",
			toolCallId,
			toolName: "attempt_completion",
			ok: true,
		})
	})

	test("writes one matching tool_start/tool_end pair for list_files and attempt_completion", async () => {
		const listFilesToolCallId = "call_list_files_1"
		const attemptCompletionToolCallId = "call_attempt_completion_2"

		const mockTask: any = {
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			loopPhase: "execute",
			abort: false,
			cwd: process.cwd(),
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [
				{
					type: "tool_use",
					id: listFilesToolCallId,
					name: "list_files",
					params: { path: ".", recursive: false },
					nativeArgs: { path: ".", recursive: false },
					partial: false,
				},
				{
					type: "tool_use",
					id: attemptCompletionToolCallId,
					name: "attempt_completion",
					params: { result: "Completed" },
					nativeArgs: { result: "Completed" },
					partial: false,
				},
			],
			pendingToolUses: [],
			userMessageContent: [],
			didCompleteReadingStream: false,
			didRejectTool: false,
			didAlreadyUseTool: false,
			didToolFailInCurrentTurn: false,
			consecutiveMistakeCount: 0,
			clineMessages: [],
			toolUsage: {},
			api: {
				getModel: () => ({ id: "test-model", info: {} }),
			},
			providerRef: {
				deref: () => ({
					getState: vi.fn().mockResolvedValue({
						mode: "code",
						customModes: [],
						experiments: {},
						showRooIgnoredFiles: false,
					}),
				}),
			},
			toolRepetitionDetector: {
				check: vi.fn().mockReturnValue({ allowExecution: true }),
			},
			recordToolUsage: vi.fn(),
			recordToolError: vi.fn(),
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked", text: "", images: [] }),
			emitFinalTokenUsageUpdate: vi.fn(),
			emit: vi.fn(),
			getTokenUsage: vi.fn().mockReturnValue({}),
			hooks: {
				emit: vi.fn().mockResolvedValue(undefined),
			},
			pushToolResultToUserContent: vi.fn().mockImplementation((toolResult: any) => {
				const exists = mockTask.userMessageContent.find(
					(block: any) => block.type === "tool_result" && block.tool_use_id === toolResult.tool_use_id,
				)
				if (exists) {
					return false
				}
				mockTask.userMessageContent.push(toolResult)
				return true
			}),
		}

		mockTask.pendingToolUses = mockTask.assistantMessageContent
		await presentAssistantMessage(mockTask)

		await waitForTraceCalls(() => {
			const traceCalls = mockTask.hooks.emit.mock.calls.map((call: any[]) => call[0])
			const listFilesStarts = traceCalls.filter(
				(event: any) =>
					event.type === "tool_start" &&
					event.toolCallId === listFilesToolCallId &&
					event.toolName === "list_files",
			)
			const listFilesEnds = traceCalls.filter(
				(event: any) =>
					event.type === "tool_end" &&
					event.toolCallId === listFilesToolCallId &&
					event.toolName === "list_files",
			)
			const attemptStarts = traceCalls.filter(
				(event: any) =>
					event.type === "tool_start" &&
					event.toolCallId === attemptCompletionToolCallId &&
					event.toolName === "attempt_completion",
			)
			const attemptEnds = traceCalls.filter(
				(event: any) =>
					event.type === "tool_end" &&
					event.toolCallId === attemptCompletionToolCallId &&
					event.toolName === "attempt_completion",
			)

			expect(listFilesStarts).toHaveLength(1)
			expect(listFilesEnds).toHaveLength(1)
			expect(attemptStarts).toHaveLength(1)
			expect(attemptEnds).toHaveLength(1)
			expect(attemptEnds[0].ok).toBe(true)
		})
	})
})
