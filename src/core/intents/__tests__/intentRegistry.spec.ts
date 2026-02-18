import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined,
	},
	Uri: {
		joinPath: vi.fn(),
	},
}))

import { getIntentById, loadActiveIntents } from "../intentRegistry"

describe("intentRegistry", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roo-intents-"))

		vi.mocked(vscode.Uri.joinPath).mockImplementation((base: any, ...segments: string[]) => {
			const fsPath = path.join(base.fsPath, ...segments)
			return { fsPath } as vscode.Uri
		})
		;(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: tempDir } }]
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("returns empty registry when active_intents.yaml does not exist", async () => {
		await expect(loadActiveIntents()).resolves.toEqual({})
	})

	it("loads valid intents and skips invalid entries", async () => {
		await fs.writeFile(
			path.join(tempDir, "active_intents.yaml"),
			`INT-001:\n  title: Build Weather API\n  description: Add endpoint\n  owned_scope:\n    - src/weather/**\n  constraints:\n    - Keep tests local\nINT-BAD:\n  title: Missing fields\n`,
			"utf-8",
		)

		const intents = await loadActiveIntents()

		expect(Object.keys(intents)).toEqual(["INT-001"])
		expect(intents["INT-001"]).toEqual({
			title: "Build Weather API",
			description: "Add endpoint",
			owned_scope: ["src/weather/**"],
			constraints: ["Keep tests local"],
		})
	})

	it("getIntentById returns the matching intent", async () => {
		await fs.writeFile(
			path.join(tempDir, "active_intents.yaml"),
			`INT-002:\n  title: Refactor Trace Writer\n  description: Improve performance\n  owned_scope:\n    - src/core/task/**\n  constraints:\n    - Keep schema stable\n`,
			"utf-8",
		)

		const intents = await loadActiveIntents()
		expect(getIntentById(intents, "INT-002")?.title).toBe("Refactor Trace Writer")
		expect(getIntentById(intents, "INT-404")).toBeUndefined()
	})

	it("prefers .orchestration/active_intents.yaml over root active_intents.yaml", async () => {
		await fs.mkdir(path.join(tempDir, ".orchestration"), { recursive: true })
		await fs.writeFile(
			path.join(tempDir, ".orchestration", "active_intents.yaml"),
			`INT-ORCH:\n  title: Orchestration Intent\n  description: preferred\n  owned_scope:\n    - src/orch/**\n  constraints:\n    - orchestration first\n`,
			"utf-8",
		)
		await fs.writeFile(
			path.join(tempDir, "active_intents.yaml"),
			`INT-ROOT:\n  title: Root Intent\n  description: fallback\n  owned_scope:\n    - src/root/**\n  constraints:\n    - root fallback\n`,
			"utf-8",
		)

		const intents = await loadActiveIntents()
		expect(Object.keys(intents)).toEqual(["INT-ORCH"])
		expect(intents["INT-ORCH"].title).toBe("Orchestration Intent")
	})

	it("falls back to root active_intents.yaml when .orchestration file does not exist", async () => {
		await fs.writeFile(
			path.join(tempDir, "active_intents.yaml"),
			`INT-ROOT:\n  title: Root Intent\n  description: fallback\n  owned_scope:\n    - src/root/**\n  constraints:\n    - root fallback\n`,
			"utf-8",
		)

		const intents = await loadActiveIntents()
		expect(Object.keys(intents)).toEqual(["INT-ROOT"])
		expect(intents["INT-ROOT"].title).toBe("Root Intent")
	})

	it("throws a clear error when workspaceFolders is missing", async () => {
		;(vscode.workspace as any).workspaceFolders = undefined

		await expect(loadActiveIntents()).rejects.toThrow(
			"No workspace folder is open. Cannot resolve active intents file.",
		)
	})
})
