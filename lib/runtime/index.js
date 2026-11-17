/**
 * runtime/index.js —— 运行时层的编排入口：只做组装，不含业务细节。
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import { mountUtf8ConsoleBridge } from "../bridge/utf8-console.js";
import { GATE_TTL_MS, HINT_SECTION } from "./constants.js";
import { detect } from "./detect.js";
import { Pwsh7Dispatch } from "./dispatch.js";
import { denialText, refreshGate } from "./version-guard.js";
import { runInstall } from "./install.js";
import { createProbeCache } from "./probe.js";
import { readRowConfig, runtimeState, setHostContext } from "./state.js";
import { reportOutput, renderStatus } from "./status.js";
import { describe, flattenReport } from "./util.js";

/**
 * Activate: sweep once (detect, install when configured, log the verdict), then publish the
 * two tools.
 * @param ctx - the row's Host context.
 * @param config - the resolved row configuration.
 */
export function applyRuntime(ctx, config) {
  if (process.platform !== 'win32') return

  // The row config is read live on every call, so edits from the configure card (a
  // volatile write through configForms) take effect without a restart.
  const current = () => readRowConfig(ctx, config)
  setHostContext(ctx)
  const state = runtimeState(ctx)

  // Transitional, removable: delete this mount and lib/utf8-console-bridge.js once the Host
  // pins the console code page itself. The README records the removal contract.
  ctx.effect(() => mountUtf8ConsoleBridge(ctx, current), 'dsh-pwshx: pin the Windows console code page for pwsh output')

  ctx.effect(() => {
    void activationSweep(ctx, current()).then((report) => {
      ctx.logger?.info?.('dsh-pwshx: %s', flattenReport(report))
    }, (error) => {
      ctx.logger?.warn?.('dsh-pwshx: %s', describe(error))
    })
  }, 'dsh-pwshx: detect PowerShell 7 (install the Store package when configured)')

  ctx.effect(() => {
    try {
      return ctx.systemPrompt.section({
        name: HINT_SECTION,
        // Beside the shipped `tool:pwsh` note, from the centrally owned placement table.
        order: ctx.systemPrompt.getSectionOrder('TOOL_PWSH'),
        text: () => state.runtimeNote,
      })
    } catch (error) {
      ctx.logger?.warn?.('dsh-pwshx: could not register the prompt section: %s', describe(error))
      return
    }
  }, 'dsh-pwshx: tell the model which PowerShell pwsh_safe runs')

  ctx.effect(() => {
    const cleanups = []
    try {
      cleanups.push(ctx.tools.register(defineTool({
        name: 'pwsh7_status',
        description:
          'Report which PowerShell pwsh_safe runs on or can be pointed at on this Windows machine, ' +
          'and produce the exact profile patch for a pinnable one: an ordinary pwsh.exe or the version-stable ' +
          'Microsoft Store family alias, never a version-numbered Store path. ' +
          'Use it when PowerShell commands fail in unexpected ways, or before relying on `&&`.',
        parameters: {
          path: {
            type: 'string',
            description:
              'Validate this explicit pwsh.exe path. When it is usable and pinnable — an ordinary file, or the ' +
              'version-stable Store family alias — the suggested profile patch points at it.',
          },
        },
        output: reportOutput(),
        execute: async (args) => {
          const config = current()
          const cache = createProbeCache()
          const status = await detect(ctx, config, cache)
          const report = await renderStatus(ctx, config, { status, explicitPath: args?.path, cache })
          return { report }
        }
      })))
      cleanups.push(ctx.tools.register(defineTool({
        name: 'pwsh7_install',
        description:
          'Install PowerShell 7 from the Microsoft Store and return a background job id at once: read progress ' +
          'with job_output, stop it with job_kill. It opens the Microsoft Store product page and clicks Install ' +
          'with Windows UI Automation — the same page and button a human would use. If the Store page does not ' +
          'load within about 90 seconds, the report asks the user to disconnect any VPN and fully restart ' +
          'Microsoft Store, then retry or use the manual Win+R path. Before it starts, the user must confirm that ' +
          'no VPN is active (pass vpnOffConfirmed: true); a Store window will open with an explicit notice and ' +
          'must stay open until the install starts. Only run it when the user explicitly asks to install ' +
          'PowerShell 7. The Store is the plugin\'s only install path: Windows keeps that package up to date by ' +
          'itself, and there is no second installer. It needs Microsoft Store and network, and never uninstalls ' +
          'anything. After 3 consecutive failed script installs the tool stops starting jobs and asks for the ' +
          'user\'s explicit confirmation that the VPN/network is fixed before allowing one retry.',
        parameters: {
          vpnOffConfirmed: {
            type: 'boolean',
            description:
              'Set true only after the user confirms no VPN is active. If omitted or false, the tool starts ' +
              'nothing and returns the exact question to ask the user, plus the warning that the Store window ' +
              'must stay open.',
          },
          userConfirmedFixed: {
            type: 'boolean',
            description:
              'Set true only after the user explicitly says the VPN/network problem is fixed, when the tool has ' +
              'reported 3 consecutive failed installs. It resets the failure counter and allows one more script ' +
              'install; a guess or an unconfirmed claim must not set it.',
          },
        },
        output: reportOutput(),
        execute: async (args, exec) => ({ report: await runInstall(ctx, current(), exec, args) })
      })))
    } catch (error) {
      ctx.logger?.warn?.('dsh-pwshx: could not register the tools: %s', describe(error))
      for (const cleanup of cleanups.splice(0)) cleanup?.()
      return
    }
    return () => {
      for (const cleanup of cleanups) cleanup?.()
    }
  }, 'dsh-pwshx: pwsh7_status and pwsh7_install tools')

  // The gate is a global, synchronous guard: it sees every agent's `pwsh` and `pwsh_safe` call,
  // including a subagent's, and denies before the executor can spawn anything. `pwsh7_status` and
  // `pwsh7_install` are deliberately untouched — they are the recovery path.
  ctx.effect(() => {
    if (typeof ctx.tools.guard !== 'function') {
      ctx.logger?.warn?.('dsh-pwshx: tools.guard is unavailable; PowerShell calls will not be gated')
      return
    }
    return ctx.tools.guard((exec) => {
      if (exec.name !== 'pwsh_safe') return
      if (state.gate.state === 'allow') return
      return denialText(state.gate)
    })
  }, 'dsh-pwshx: gate pwsh until PowerShell 7 is effective')

  // Guards are synchronous; the pre-execute waterfall is the asynchronous half. It runs before the
  // guard, so a stale reading is refreshed *before* the guard reads it. Always `next()`: the guard
  // is the denial owner, not this listener.
  ctx.effect(() => {
    if (typeof ctx.on !== 'function') return
    return ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name !== 'pwsh_safe') return next()
      try {
        if (state.gate.state === 'unknown' || Date.now() - state.gate.at >= GATE_TTL_MS) {
          await refreshGate(ctx, current())
        }
      } catch {
        /* keep the last gate: fail closed */
      }
      return next()
    })
  }, 'dsh-pwshx: refresh the gate before a pwsh call')

  // A config-card save or a profile patch edit re-composes the Loader; re-read the executor after
  // it settles so the gate follows without waiting for the TTL.
  ctx.effect(() => {
    if (typeof ctx.on !== 'function') return
    const disposers = [
      ctx.on('app-boot/config-reload', () => { void refreshGate(ctx, current()) }),
      ctx.on('plugin-manager/changed', () => { void refreshGate(ctx, current()) }),
    ]
    return () => {
      for (const dispose of disposers) dispose?.()
    }
  }, 'dsh-pwshx: refresh the gate after a profile change')

  try {
    ctx.plugin(Pwsh7Dispatch)
  } catch (error) {
    ctx.logger?.warn?.('dsh-pwshx: could not start the dispatch service: %s', describe(error))
  }
}

/** The row's live context for the dispatch service; refreshed on every activation. */
let hostContext = null

/**
 * Activation sweep: detect and render the report. Installing is never automatic at startup: the
 * Store-UI script needs a VPN confirmation and a visible Store window, so it stays behind
 * `pwsh7_install`.
 * @param ctx - the row's Host context.
 * @param config - the resolved row configuration.
 * @returns the report text.
 */
export async function activationSweep(ctx, config) {
  const cache = createProbeCache()
  const status = await detect(ctx, config, cache)
  return renderStatus(ctx, config, { status, cache })
}
