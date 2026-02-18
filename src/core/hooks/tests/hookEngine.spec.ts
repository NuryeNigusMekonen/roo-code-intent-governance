import { describe, it, expect } from "vitest"

import { HookEngine } from "../HookEngine"

const createToolStartEvent = () => ({
	type: "tool_start" as const,
	taskId: "t",
	toolCallId: "id",
	toolName: "x",
	ts: new Date().toISOString(),
})

describe("HookEngine", () => {
	it("runs hooks in deterministic order (priority, then id)", async () => {
		const eng = new HookEngine()
		const seen: string[] = []

		eng.register("b", 10, () => {
			seen.push("b")
		})
		eng.register("a", 10, () => {
			seen.push("a")
		})
		eng.register("c", 20, () => {
			seen.push("c")
		})

		await eng.emit(createToolStartEvent())

		expect(seen).toEqual(["a", "b", "c"])
	})

	it("runs hooks sequentially (awaits each handler before next)", async () => {
		const eng = new HookEngine()
		const seen: string[] = []

		eng.register("first", 10, async () => {
			seen.push("first:start")
			await new Promise((resolve) => setTimeout(resolve, 20))
			seen.push("first:end")
		})

		eng.register("second", 20, () => {
			seen.push("second")
		})

		await eng.emit(createToolStartEvent())

		expect(seen).toEqual(["first:start", "first:end", "second"])
	})

	it("does not break if a hook throws (failure isolation)", async () => {
		const eng = new HookEngine()
		const seen: string[] = []

		eng.register("bad", 10, () => {
			throw new Error("x")
		})

		eng.register("good", 20, () => {
			seen.push("ok")
		})

		await eng.emit(createToolStartEvent())

		expect(seen).toEqual(["ok"])
	})
})
