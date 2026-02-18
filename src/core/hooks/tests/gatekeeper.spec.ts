import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

import { HookEngine } from "../HookEngine"
import { registerDefaultHooks } from "../registerDefaultHooks"

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined,
	},
	window: {
		showWarningMessage: vi.fn(),
	},
}))

describe("intent gatekeeper hook", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roo-hooks-"))
		;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: tempDir } }]
		vi.mocked(vscode.window.showWarningMessage).mockReset()
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("blocks write/destructive tools when no active intent is selected", async () => {
		const engine = new HookEngine()
		const task: any = {
			activeIntentId: null,
			activeIntent: null,
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(typeof event.reason).toBe("string")
		expect((event as any).errorCode).toBe("SCOPE_VIOLATION")
	})

	it("allows gated tools when an active intent is selected", async () => {
		const engine = new HookEngine()
		const task: any = {
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "execute_command",
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(false)
		expect(event.reason).toBeUndefined()
	})

	it("never blocks select_active_intent itself", async () => {
		const engine = new HookEngine()
		const task: any = {
			activeIntentId: null,
			activeIntent: null,
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "select_active_intent",
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(false)
	})

	it("allows execute_command safe read operation without active intent", async () => {
		const engine = new HookEngine()
		const task: any = {
			activeIntentId: null,
			activeIntent: null,
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "execute_command",
			toolParams: {
				command: "ls -la",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(false)
		expect(event.reason).toBeUndefined()
	})

	it("blocks write_to_file when target path is outside owned_scope", async () => {
		const engine = new HookEngine()
		const task: any = {
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/owned/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			toolParams: {
				path: "src/outside/file.ts",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toContain("activeIntentId=INT-001")
		expect(event.reason).toContain("targetPath=src/outside/file.ts")
		expect(event.reason).toContain("owned_scope")
		expect(event.errorCode).toBe("SCOPE_VIOLATION")
	})

	it("allows write_to_file when target path is inside owned_scope glob", async () => {
		const engine = new HookEngine()
		const task: any = {
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			toolParams: {
				path: "src/ok/file.ts",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(false)
	})

	it("blocks write_to_file when target path is matched by .intentignore", async () => {
		await fs.writeFile(path.join(tempDir, ".intentignore"), "src/blocked/**\n", "utf-8")

		const engine = new HookEngine()
		const task: any = {
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			toolParams: {
				path: "src/blocked/file.ts",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toContain(".intentignore")
		expect(event.errorCode).toBe("SCOPE_VIOLATION")
	})

	it("blocks execute_command destructive operations when user does not approve", async () => {
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined)

		const engine = new HookEngine()
		const task: any = {
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "execute_command",
			toolParams: {
				command: "rm -rf src/tmp",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			"Destructive operation detected. Approve?",
			{ modal: true },
			"Approve",
		)
		expect(event.blocked).toBe(true)
		expect(event.reason).toBe("Destructive operation rejected by user.")
		expect(event.errorCode).toBe("HITL_REJECTED")
	})

	it("allows execute_command destructive operations when user approves", async () => {
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Approve" as any)

		const engine = new HookEngine()
		const task: any = {
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		const event: any = {
			type: "pre_tool_use",
			toolName: "execute_command",
			toolParams: {
				command: "git reset --hard HEAD~1",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(false)
		expect(event.reason).toBeUndefined()
	})
})
