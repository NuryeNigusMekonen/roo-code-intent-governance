import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

import { HookEngine } from "../HookEngine"
import { registerDefaultHooks } from "../registerDefaultHooks"
import { sha256 } from "../../trace/agentTraceLedger"

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined,
	},
	window: {
		showWarningMessage: vi.fn(),
	},
}))

describe("optimistic locking stale write protection", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roo-optimistic-locking-"))
		;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: tempDir } }]
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	function createTaskStub() {
		const lastReadHashByPath: Record<string, string> = {}

		return {
			cwd: tempDir,
			activeIntentId: "INT-001",
			activeIntent: {
				title: "Intent",
				description: "desc",
				owned_scope: ["src/**"],
				constraints: [],
			},
			appendAgentTrace: vi.fn(),
			recordFileRead: (relativePath: string, content: string) => {
				lastReadHashByPath[relativePath] = sha256(content)
			},
			getLastReadHash: (relativePath: string) => lastReadHashByPath[relativePath],
		}
	}

	it("blocks when no prior read hash recorded", async () => {
		const engine = new HookEngine()
		const task = createTaskStub()
		registerDefaultHooks(engine, task as any)

		await fs.mkdir(path.join(tempDir, "src"), { recursive: true })
		await fs.writeFile(path.join(tempDir, "src/file.ts"), "const x = 1\n", "utf-8")

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			toolParams: {
				path: "src/file.ts",
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
				content: "const x = 2\n",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toBe("Stale write protection: no prior read recorded for this file. Read it first.")
	})

	it("blocks when disk hash does not match recorded hash", async () => {
		const engine = new HookEngine()
		const task = createTaskStub()
		registerDefaultHooks(engine, task as any)

		await fs.mkdir(path.join(tempDir, "src"), { recursive: true })
		const targetFile = path.join(tempDir, "src/file.ts")
		await fs.writeFile(targetFile, "const x = 1\n", "utf-8")
		task.recordFileRead("src/file.ts", "const x = 1\n")
		await fs.writeFile(targetFile, "const x = 2\n", "utf-8")

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			toolParams: {
				path: "src/file.ts",
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
				content: "const x = 3\n",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(true)
		expect(event.reason).toBe("Stale write protection: file changed since last read. Re-read and retry.")
	})

	it("allows write when recorded hash matches current disk hash", async () => {
		const engine = new HookEngine()
		const task = createTaskStub()
		registerDefaultHooks(engine, task as any)

		await fs.mkdir(path.join(tempDir, "src"), { recursive: true })
		const targetFile = path.join(tempDir, "src/file.ts")
		await fs.writeFile(targetFile, "const x = 1\n", "utf-8")
		task.recordFileRead("src/file.ts", "const x = 1\n")

		const event: any = {
			type: "pre_tool_use",
			toolName: "write_to_file",
			toolParams: {
				path: "src/file.ts",
				intent_id: "INT-001",
				mutation_class: "AST_REFACTOR",
				content: "const x = 2\n",
			},
			blocked: false,
		}

		await engine.emit(event)

		expect(event.blocked).toBe(false)
		expect(event.reason).toBeUndefined()
	})
})
