import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { appendLesson } from "../lessons"

describe("appendLesson", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "roo-lessons-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("creates CLAUDE.md when missing and appends lesson entry", async () => {
		const task: any = { cwd: tempDir }

		await appendLesson(task, {
			intentId: "INT-004",
			command: "pnpm -C src test",
			errorSummary: "Exit code: 1\nTypecheck failed",
		})

		const target = path.join(tempDir, "CLAUDE.md")
		const content = await fs.readFile(target, "utf-8")

		expect(content).toContain("## Lesson")
		expect(content).toContain("intent_id: INT-004")
		expect(content).toContain("command: pnpm -C src test")
		expect(content).toContain("summary: Exit code: 1")
	})

	it("falls back to AGENT.md when CLAUDE.md does not exist", async () => {
		const agentPath = path.join(tempDir, "AGENT.md")
		await fs.writeFile(agentPath, "# Agent\n", "utf-8")

		const task: any = { cwd: tempDir }

		await appendLesson(task, {
			intentId: "INT-004",
			command: "turbo test",
			errorSummary: "Exit code: 2",
		})

		const content = await fs.readFile(agentPath, "utf-8")
		expect(content).toContain("# Agent")
		expect(content).toContain("## Lesson")
		expect(content).toContain("command: turbo test")
	})
})
