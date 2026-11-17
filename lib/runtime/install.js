/**
 * runtime/install.js —— 通过 Microsoft Store 安装 PowerShell 7（UI Automation）。
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPANION_RECOMMENDATION, INSTALL_KIND, INSTALL_TICK_MS, MANUAL_STORE_STEPS, PROBE_MAX_BYTES, RECHECK_ATTEMPTS, RECHECK_DELAY_MS, STORE_UI_LOAD_TIMEOUT_MS, STORE_UI_SCRIPT } from "./constants.js";
import { detect } from "./detect.js";
import { labelOf } from "./probe.js";
import { circuitBreakerReport, recordInstallFailure, resetInstallFailures, runtimeState } from "./state.js";
import { describe } from "./util.js";

/**
 * Run `pwsh7_install`: skip when an acceptable PowerShell 7 is already in place (an ordinary
 * file or the Store family alias). Otherwise start the install as a **background job** and return
 * at once, so an install that needs many minutes is visible, cancellable, and readable through the
 * platform's own `job_output` instead of blocking the call with no output. The user must confirm the
 * VPN is off first; the Store window itself then shows a notice before the script clicks Install.
 * @param ctx - the row's Host context.
 * @param config - the resolved row configuration.
 * @param exec - the tool execution, for the job's owner.
 * @param options - `{ vpnOffConfirmed?: boolean, userConfirmedFixed?: boolean }`.
 * @returns the report text.
 */
export async function runInstall(ctx, config, exec, options = {}) {
  const before = await detect(ctx, config)
  if (before.chosen !== undefined) {
    resetInstallFailures(ctx)
    return `PowerShell ${before.chosen.version} is already in place (${before.chosen.path}, ${labelOf(before.chosen)}); nothing to install.`
  }
  if (runtimeState(ctx).installFailures >= 3 && options?.userConfirmedFixed !== true) {
    return circuitBreakerReport()
  }
  if (options?.vpnOffConfirmed !== true) {
    return [
      'Install not started. First ask the user: is a VPN active on this machine?',
      'If yes, ask them to disconnect it, fully quit and restart Microsoft Store, then retry.',
      'When the user confirms the VPN is off, call pwsh7_install again with vpnOffConfirmed: true.',
      'Tell the user that a Microsoft Store window will open and the script will click Install — do not close that window; closing it aborts the install.',
      `Manual install: ${MANUAL_STORE_STEPS}.`,
    ].join(' ')
  }
  if (options?.userConfirmedFixed === true) resetInstallFailures(ctx)

  return startStoreUiInstall(ctx, config, exec)
}

/**
 * Spawn the Store-page UI automation script through Windows PowerShell 5.1.
 *
 * The script is written to a temporary `.ps1` with a UTF-8 BOM. Passing it through `-EncodedCommand`
 * was not reliable here: the 5.1 host decoded the text as ANSI on the tested machine and the Chinese
 * strings turned into parser errors. A BOM-prefixed file is read as UTF-8 by 5.1 regardless of the
 * console code page, so the notice text and the localized Install labels stay intact.
 */
export function spawnStoreUi(ctx) {
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const directory = mkdtempSync(join(tmpdir(), 'dsh-pwshx-store-ui-'))
  const scriptPath = join(directory, 'install.ps1')
  writeFileSync(scriptPath, `\uFEFF${STORE_UI_SCRIPT}`, 'utf8')
  try {
    const handle = ctx.subprocess.spawn({
      argv: [executable, '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: PROBE_MAX_BYTES },
        stderr: { maxBytes: PROBE_MAX_BYTES },
      },
      graceMs: STORE_UI_LOAD_TIMEOUT_MS + 30000,
    })
    handle.storeUiDirectory = directory
    return handle
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

/** Remove the temporary script directory once the job has settled. */
export function cleanupStoreUi(handle) {
  try {
    if (handle?.storeUiDirectory !== undefined) rmSync(handle.storeUiDirectory, { recursive: true, force: true })
  } catch { /* best effort */ }
}

/**
 * The job spec for the Store-UI install. The script opens the Store product page and invokes its
 * Install button; the job reports the click, then re-validates the runtime. A Store download can
 * continue after the click, so an uninstalled runtime is reported as "started", not failed.
 */
export function storeUiJobSpec(ctx, config, exec) {
  let handle
  const startedAt = Date.now()
  const elapsed = () => `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`
  return {
    kind: INSTALL_KIND,
    label: 'PowerShell 7 install (Microsoft Store UI)',
    ...(exec?.agent?.id === undefined ? {} : { owner: exec.agent.id }),
    output: [
      { channel: 'stdout', read: (from) => readStream(handle?.collected?.stdout, from) },
      { channel: 'stderr', read: (from) => readStream(handle?.collected?.stderr, from) },
    ],
    run(job) {
      try {
        handle = spawnStoreUi(ctx)
      } catch (error) {
        const detail = `could not open Microsoft Store: ${describe(error)}`
        recordInstallFailure(ctx)
        job.updateProgress(detail)
        job.append(`${detail}\n`)
        return { cancel() {}, done: Promise.resolve({ status: 'failed', detail, result: detail }) }
      }
      let cancelled = false
      const progress = () => job.updateProgress(`opening the Microsoft Store page and clicking Install — ${elapsed()}`)
      const timer = setInterval(progress, INSTALL_TICK_MS)
      timer.unref?.()
      progress()
      return {
        cancel() {
          cancelled = true
          clearInterval(timer)
          handle?.terminate()
        },
        done: (async () => {
          try {
            const outcome = await handle.done
            cleanupStoreUi(handle)
            clearInterval(timer)
            if (cancelled) {
              const detail = 'the Store UI install was cancelled'
              job.append(`\n${detail}\n`)
              return { status: 'failed', detail, result: detail }
            }
            const text = handle.collected?.stdout?.readFrom(0).text ?? ''
            const clicked = /STORE_UI_CLICKED(?:_LEGACY)?:/u.test(text)
            const after = clicked ? await awaitRuntime(ctx, config, job, () => cancelled) : { chosen: undefined }
            const installed = after.chosen !== undefined
            let verdict
            if (!clicked) {
              recordInstallFailure(ctx)
              const reason = outcome.exitCode === 2
                ? 'the Microsoft Store page did not load, or its Install button was not found'
                : outcome.exitCode === 5
                  ? 'the install was cancelled at the Store notice'
                  : outcome.exitCode === 3
                    ? 'the Store page was found, but its Install button could not be invoked'
                    : outcome.exitCode === 4
                      ? 'the Microsoft Store page could not be opened'
                      : `the Store UI script exited with code ${outcome.exitCode}`
              verdict = [
                `${reason}.`,
                'First ask the user: is a VPN active? If yes, have them disconnect it, fully quit and restart Microsoft Store, then retry. Do not start another install until they answer.',
                `Manual install: ${MANUAL_STORE_STEPS}.`,
              ]
            } else if (installed) {
              resetInstallFailures(ctx)
              verdict = [
                `PowerShell ${after.chosen.version} is now installed (${after.chosen.path}, ${labelOf(after.chosen)}); the pwsh tool is ready.`,
                COMPANION_RECOMMENDATION,
              ]
            } else {
              verdict = [
                'The Store page opened and Install was clicked. Microsoft Store is downloading/installing in the background.',
                'Do not retry; poll pwsh7_status until it reports PowerShell 7.',
                'If it stays Queued, open Microsoft Store → Downloads/Library and pause/resume the PowerShell entry; if the page was opened under a VPN, disconnect it and restart Microsoft Store.',
                `Manual install: ${MANUAL_STORE_STEPS}.`,
              ]
            }
            runtimeState(ctx).gate.at = 0
            job.append(`\n${verdict.join('\n')}\n`)
            return {
              status: clicked ? 'completed' : 'failed',
              detail: clicked ? 'Microsoft Store Install clicked' : verdict[0],
              result: verdict.join('\n'),
            }
          } catch (error) {
            clearInterval(timer)
            recordInstallFailure(ctx)
            const detail = `the Store UI install failed: ${describe(error)}`
            job.append(`\n${detail}\n`)
            return { status: 'failed', detail, result: detail }
          }
        })(),
      }
    },
  }
}

/** Start (or inline-run) the Store-page install and return the immediate report. */
export async function startStoreUiInstall(ctx, config, exec) {
  const jobs = ctx.get('jobs')
  if (jobs === undefined || typeof jobs.start !== 'function') {
    let handle
    try {
      handle = spawnStoreUi(ctx)
    } catch (error) {
      recordInstallFailure(ctx)
      return `Could not open Microsoft Store: ${describe(error)}. Manual install: ${MANUAL_STORE_STEPS}.`
    }
    const outcome = await handle.done
    cleanupStoreUi(handle)
    const clicked = /STORE_UI_CLICKED(?:_LEGACY)?:/u.test(handle.collected?.stdout?.readFrom(0).text ?? '')
    if (!clicked) {
      recordInstallFailure(ctx)
      return [
        'The Microsoft Store page did not expose an Install button.',
        'First ask the user: is a VPN active? If yes, have them disconnect it, fully quit and restart Microsoft Store, then retry.',
        `Manual install: ${MANUAL_STORE_STEPS}.`,
      ].join(' ')
    }
    return [
      'Microsoft Store opened and Install was clicked; the Store is downloading/installing in the background.',
      'Poll pwsh7_status until it reports PowerShell 7.',
      `Manual install: ${MANUAL_STORE_STEPS}.`,
    ].join(' ')
  }
  let id
  try {
    id = jobs.start(storeUiJobSpec(ctx, config, exec))
  } catch (error) {
    return [
      `The job registry refused to start the Store UI install (${describe(error)}).`,
      `Manual install: ${MANUAL_STORE_STEPS}.`,
    ].join(' ')
  }
  return [
    `Opening Microsoft Store and clicking Install for PowerShell 7 in the background as job ${id}.`,
    'A Microsoft Store window will open after a short notice. Leave it open — the script clicks Install; closing it aborts the install.',
    'This is the same Store product page and Install button a human would use.',
    'Read progress in 30-second rounds: job_output(wait:true, timeout_ms:30000), then job_list; a wait aborted is not a failure.',
    'If the page does not load, disconnect any VPN, fully quit and restart Microsoft Store, then retry.',
    `Manual install: ${MANUAL_STORE_STEPS}.`,
  ].join('\n')
}

/**
 * Wait, bounded, for the runtime to appear after the Store click. The Store finishes the install
 * in another process, so a click alone is not proof; the plugin keeps re-probing and says so on
 * the job's progress line while it does.
 * @param ctx - the row's Host context.
 * @param config - the resolved row configuration.
 * @param job - the job handle, for progress reporting.
 * @param isCancelled - consulted before every probe, so a `job_kill` during the re-probe stops it.
 * @returns the first detection that found a candidate, or the last one.
 */
export async function awaitRuntime(ctx, config, job, isCancelled) {
  let result = await detect(ctx, config)
  for (let attempt = 1; result.chosen === undefined && attempt <= RECHECK_ATTEMPTS; attempt += 1) {
    if (isCancelled?.() === true) break
    job?.updateProgress(`Store click sent; re-checking whether the install lands anyway (${attempt}/${RECHECK_ATTEMPTS})`)
    // Not unref'd: this await is the work, and an unref'd timer lets the loop exit under it.
    await new Promise((resolve) => { setTimeout(resolve, RECHECK_DELAY_MS) })
    // Checked again after the wait: a cancel that lands *during* it must not be followed by one more
    // probe, which is what "stop the loop" has to mean.
    if (isCancelled?.() === true) break
    result = await detect(ctx, config)
  }
  return result
}

/**
 * Adapt one collected subprocess stream to a job output source. The subprocess reader is already
 * offset-based and non-consuming, so the job ring and the plugin's own reads never disturb each
 * other; a source whose process has not started yet simply reads nothing.
 * @param reader - the subprocess output reader, when the process exists.
 * @param from - the byte offset to read from.
 * @returns the job source read.
 */
export function readStream(reader, from) {
  if (reader === undefined) return { text: '', nextOffset: from, lossy: false }
  const read = reader.readFrom(from)
  return { text: read.text, nextOffset: read.nextOffset, lossy: read.lossy }
}
