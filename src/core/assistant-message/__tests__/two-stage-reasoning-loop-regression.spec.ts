import { readFileSync } from "fs"
import { fileURLToPath } from "url"

import { describe, expect, test, vi } from "vitest"

import { presentAssistantMessage } from "../presentAssistantMessage"

vi.mock("../../task/Task")
vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn((toolName: string) => ["attempt_completion"].includes(toolName)),
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

describe("two-stage reasoning loop regression", () => {
	test("Task invokes presenter once and only after stream-complete marker", () => {
		const taskFilePath = fileURLToPath(new URL("../../task/Task.ts", import.meta.url))
		const source = readFileSync(taskFilePath, "utf8")

		const calls = [...source.matchAll(/presentAssistantMessage\(this\)/g)]
		expect(calls).toHaveLength(1)

		const streamingSwitchIndex = source.indexOf("switch (chunk.type)")
		const streamCompleteIndex = source.indexOf("this.didCompleteReadingStream = true")
		const callIndex = calls[0].index ?? -1

		expect(streamingSwitchIndex).toBeGreaterThan(-1)
		expect(streamCompleteIndex).toBeGreaterThan(streamingSwitchIndex)
		expect(callIndex).toBeGreaterThan(streamCompleteIndex)

		const streamingSlice = source.slice(streamingSwitchIndex, streamCompleteIndex)
		expect(streamingSlice).not.toContain("presentAssistantMessage(this)")
	})

	test("presentAssistantMessage executes only in execute phase and drains queued tools once", async () => {
		const toolCallId = "call_two_stage_1"

		const mockTask: any = {
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			loopPhase: "decide",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [
				{
					type: "tool_use",
					id: toolCallId,
					name: "attempt_completion",
					params: { result: "Done" },
					nativeArgs: { result: "Done" },
					partial: false,
				},
			],
			pendingToolUses: [],
			userMessageContent: [],
			didCompleteReadingStream: true,
			didRejectTool: false,
			didAlreadyUseTool: false,
			didToolFailInCurrentTurn: false,
			consecutiveMistakeCount: 0,
			clineMessages: [],
			toolUsage: {},
			apiConfiguration: { apiProvider: "anthropic" },
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
		expect(mockTask.hooks.emit).not.toHaveBeenCalled()
		expect(mockTask.currentStreamingContentIndex).toBe(0)

		mockTask.loopPhase = "execute"
		await presentAssistantMessage(mockTask)

		const hookCalls = mockTask.hooks.emit.mock.calls.map((call: any[]) => call[0])
		const starts = hookCalls.filter((e: any) => e.type === "tool_start")
		const ends = hookCalls.filter((e: any) => e.type === "tool_end")

		expect(starts).toHaveLength(1)
		expect(ends).toHaveLength(1)
		expect(starts[0]).toMatchObject({ type: "tool_start", toolCallId, toolName: "attempt_completion" })
		expect(ends[0]).toMatchObject({ type: "tool_end", toolCallId, toolName: "attempt_completion" })
		expect(mockTask.currentStreamingContentIndex).toBe(1)
		expect(mockTask.userMessageContentReady).toBe(true)
	})
})
