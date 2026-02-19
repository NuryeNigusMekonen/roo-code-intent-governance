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
			toolParams: {
				path: "src/file.ts",
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
			},
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
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
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
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
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
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
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

	it("blocks write_to_file when intent_id is missing", async () => {
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
				mutation_class: "AST_REFACTOR",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toContain("requires active intent handshake and valid params")
		expect(event.errorCode).toBe("SCOPE_VIOLATION")
	})

	it("blocks write_to_file when intent_id does not match active intent", async () => {
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
				intent_id: "INT-999",
				mutation_class: "AST_REFACTOR",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toContain("requires active intent handshake and valid params")
		expect(event.errorCode).toBe("SCOPE_VIOLATION")
	})

	it("blocks write_to_file when mutation_class is invalid", async () => {
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
				intent_id: "INT-001",
				mutation_class: "INVALID",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toContain("requires active intent handshake and valid params")
		expect(event.errorCode).toBe("SCOPE_VIOLATION")
	})

	it("appends ledger record after successful write_to_file tool_end", async () => {
		const engine = new HookEngine()
		const task: any = {
			cwd: tempDir,
			activeIntentId: "INT-003",
			activeIntent: {
				title: "Intent",
				description: "Desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
		}

		registerDefaultHooks(engine, task)

		await engine.emit({
			type: "tool_end",
			toolName: "write_to_file",
			ok: true,
			toolParams: {
				path: "src/ok/file.ts",
				content: "const x = 1\n",
				intent_id: "INT-003",
				mutation_class: "AST_REFACTOR",
			},
		} as any)

		const ledgerPath = path.join(tempDir, ".orchestration", "agent_trace.jsonl")
		const content = await fs.readFile(ledgerPath, "utf-8")
		const lines = content.trim().split("\n")
		expect(lines.length).toBeGreaterThan(0)

		const last = JSON.parse(lines[lines.length - 1])
		expect(last.intent_id).toBe("INT-003")
		expect(last.files[0].conversations[0].ranges[0].content_hash).toMatch(/^sha256:/)
	})
})
