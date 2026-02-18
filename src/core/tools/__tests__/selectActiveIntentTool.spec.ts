import { SelectActiveIntentTool } from "../selectActiveIntentTool"

vi.mock("../../intents/intentRegistry", () => ({
	loadActiveIntents: vi.fn(),
	getIntentById: vi.fn(),
}))

import { getIntentById, loadActiveIntents } from "../../intents/intentRegistry"

describe("selectActiveIntentTool", () => {
	const tool = new SelectActiveIntentTool()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("sets task active intent and returns structured result when intent exists", async () => {
		const mockSetActiveIntent = vi.fn()
		const mockTask: any = {
			cwd: "/tmp/workspace",
			setActiveIntent: mockSetActiveIntent,
			sayAndCreateMissingParamError: vi.fn(),
			recordToolError: vi.fn(),
			didToolFailInCurrentTurn: false,
			consecutiveMistakeCount: 0,
		}

		const intent = {
			title: "Build Weather API",
			description: "Add /forecast endpoint",
			owned_scope: ["src/weather/**"],
			constraints: ["No external HTTP calls in tests"],
		}

		vi.mocked(loadActiveIntents).mockResolvedValue({ "INT-001": intent } as any)
		vi.mocked(getIntentById).mockReturnValue(intent as any)

		const pushToolResult = vi.fn()
		const askApproval = vi.fn().mockResolvedValue(true)
		const handleError = vi.fn()

		await tool.execute({ intent_id: "INT-001" }, mockTask, {
			pushToolResult,
			askApproval,
			handleError,
		})

		expect(loadActiveIntents).toHaveBeenCalledWith()
		expect(getIntentById).toHaveBeenCalledWith({ "INT-001": intent }, "INT-001")
		expect(askApproval).toHaveBeenCalledTimes(1)
		expect(mockSetActiveIntent).toHaveBeenCalledWith("INT-001", intent)
		expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("ACTIVE_INTENT_SELECTED"))
	})

	it("returns error when intent is missing", async () => {
		const mockTask: any = {
			cwd: "/tmp/workspace",
			setActiveIntent: vi.fn(),
			sayAndCreateMissingParamError: vi.fn(),
			recordToolError: vi.fn(),
			didToolFailInCurrentTurn: false,
			consecutiveMistakeCount: 0,
		}

		vi.mocked(loadActiveIntents).mockResolvedValue({} as any)
		vi.mocked(getIntentById).mockReturnValue(undefined)

		const pushToolResult = vi.fn()
		const askApproval = vi.fn().mockResolvedValue(true)
		const handleError = vi.fn()

		await tool.execute({ intent_id: "INT-404" }, mockTask, {
			pushToolResult,
			askApproval,
			handleError,
		})

		expect(mockTask.recordToolError).toHaveBeenCalledWith("select_active_intent")
		expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Unknown intent_id"))
		expect(mockTask.setActiveIntent).not.toHaveBeenCalled()
	})
})
