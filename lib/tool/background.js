/**
 * 后台任务适配层 —— 从官方 @deepseek-ai/dsh-tool-pwsh/src/background.ts 裁剪而来。
 *
 * 只保留 pwsh_safe 需要的部分：job hooks / 输出源 / 结果映射。
 * 不 import 官方包的内部路径（避免版本升级断裂），只依赖 @deepseek-ai/dsh-jobs 的运行时契约：
 *   JobSpec.run(JobHandle) -> JobHooks { done, cancel }
 *   JobOutputSource { channel, read(fromByte) -> { text, nextOffset, lossy } }
 *   JobOutcome { status: 'completed' | 'killed' | 'failed', detail, result? }
 */

/*
 * Start the work after job admission; the starter receives the job's AbortSignal and must
 * return a ShellProcess (ShellExecution extends ShellProcess).
 * @param {(signal: AbortSignal) => Promise<any>} start
 * @param {(process: any) => {status: string, detail: string, result?: string}} outcome
 * @returns {{cancel: (reason?: string) => void, done: Promise<any>, failure: () => {error: unknown} | undefined}}
 */
export function processJob(start, outcome) {
  const controller = new AbortController()
  let process
  let failure
  const done = (async () => {
    try {
      process = await start(controller.signal)
      try {
        if (controller.signal.aborted) process.kill()
      } finally {
        await process.done
      }
      return outcome(process)
    } catch (error) {
      const killed = controller.signal.aborted && process === undefined
      if (!killed) failure = { error }
      return {
        status: killed ? 'killed' : 'failed',
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  })()
  return {
    cancel: (reason) => {
      if (controller.signal.aborted) return
      controller.abort(reason)
      process?.kill()
    },
    done,
    failure: () => failure,
  }
}

/**
 * The process's non-consuming stream readers as registry pull sources.
 * The process is spawned inside the starter, after the registry admitted the job,
 * so the getter binds lazily.
 * @param {() => any} proc - returns the live ShellProcess once spawned.
 * @returns {Array<{channel: 'stdout'|'stderr', read: (fromByte: number) => any}>}
 */
export function processSources(proc) {
  const source = (channel) => ({
    channel,
    read: (fromByte) => {
      const live = proc()
      return live === undefined
        ? { text: '', nextOffset: fromByte, lossy: false }
        : live.observed[channel].readFrom(fromByte)
    },
  })
  return [source('stdout'), source('stderr')]
}

/**
 * Map a settled process onto the generic job-outcome vocabulary.
 * `killed` stays `killed`; everything else is `completed` with the exit code as detail.
 * Sandbox denial is appended as a plain note (no escalation markers in this plugin).
 * @param {any} proc - the settled process handle.
 * @returns {{status: string, detail: string}}
 */
export function processOutcome(proc) {
  const base = proc.status === 'killed'
    ? { status: 'killed', detail: proc.signal !== null ? 'signal: ' + proc.signal : 'killed before exit' }
    : { status: 'completed', detail: 'exit code: ' + (proc.exitCode ?? 0) }
  if (proc.sandbox?.denied === true) {
    return { ...base, detail: base.detail + '; [sandbox: file access denied under ' + proc.sandbox.mode + ' mode]' }
  }
  if (proc.sandbox?.runnerFailed === true) {
    return { ...base, detail: base.detail + '; [sandbox: the sandbox runner itself failed under ' + proc.sandbox.mode + ' mode]' }
  }
  return base
}

/**
 * The ring chunks of one consuming registry read as the shell tools render a process read:
 * stdout chunks in order, then every stderr chunk in one `[stderr]` section.
 * @param {Array<{channel: string, text: string}>} chunks
 * @returns {string}
 */
export function ringDelta(chunks) {
  const out = chunks.filter((chunk) => chunk.channel !== 'stderr').map((chunk) => chunk.text).join('')
  const err = chunks.filter((chunk) => chunk.channel === 'stderr').map((chunk) => chunk.text).join('')
  const separator = out.length > 0 && !out.endsWith('\n') ? '\n' : ''
  return out + (err.length > 0 ? separator + '[stderr]\n' + err : '')
}