import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import * as lockfile from "proper-lockfile"

/**
 * Safely appends a single JSON line to a file (JSONL).
 * - Ensures parent directory exists
 * - Ensures the target file exists (creates if missing)
 * - Uses `proper-lockfile` to acquire an inter-process advisory lock
 * - Appends exactly one JSON line (terminated with `\n`)
 * - Releases the lock even on errors
 *
 * @param filePath Absolute or relative path to the JSONL file
 * @param event Any JSON-serializable value to append as a single line
 */
async function safeAppendJsonl(filePath: string, event: unknown): Promise<void> {
	const absoluteFilePath = path.resolve(filePath)
	let releaseLock = async () => {}

	const dirPath = path.dirname(absoluteFilePath)

	// Ensure directory exists
	try {
		await fs.mkdir(dirPath, { recursive: true })
		await fs.access(dirPath)
	} catch (err: any) {
		console.error(`Failed to create or access directory for ${absoluteFilePath}:`, err)
		throw err
	}

	// Ensure file exists (create empty file if missing)
	try {
		await fs.access(absoluteFilePath)
	} catch (accessErr: any) {
		if (accessErr.code === "ENOENT") {
			try {
				// create an empty file via append (works across platforms)
				await fs.appendFile(absoluteFilePath, "", { encoding: "utf8" })
			} catch (createErr) {
				console.error(`Failed to create file ${absoluteFilePath}:`, createErr)
				throw createErr
			}
		} else {
			throw accessErr
		}
	}

	// Acquire lock with same conservative options as safeWriteJson
	try {
		releaseLock = await lockfile.lock(absoluteFilePath, {
			stale: 31000,
			update: 10000,
			realpath: false,
			retries: {
				retries: 5,
				factor: 2,
				minTimeout: 100,
				maxTimeout: 1000,
			},
			onCompromised: (err) => {
				console.error(`Lock at ${absoluteFilePath} was compromised:`, err)
				throw err
			},
		})
	} catch (lockErr) {
		console.error(`Failed to acquire lock for ${absoluteFilePath}:`, lockErr)
		throw lockErr
	}

	try {
		// Serialize the event to JSON. Let stringify throw if unsupported (circular).
		const line = JSON.stringify(event === undefined ? null : event)
		// Append a single line with newline
		await fs.appendFile(absoluteFilePath, line + "\n", { encoding: "utf8" })
	} catch (err) {
		console.error(`Failed to append JSONL to ${absoluteFilePath}:`, err)
		throw err
	} finally {
		try {
			await releaseLock()
		} catch (unlockErr) {
			console.error(`Failed to release lock for ${absoluteFilePath}:`, unlockErr)
		}
	}
}

export { safeAppendJsonl }
