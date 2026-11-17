/**
 * runtime/dispatch.js —— typert Remote service：插件页诊断卡片的 Host 端。
 */

import { Service } from '@deepseek-ai/cordis';
import { getHostContext, readRowConfig, runtimeState } from "./state.js";
import { renderStatus } from "./status.js";

/**
 * The Remote dispatch service the gateway calls as `ctx.get('dsh-pwshx').status(args)`.
 * One operation, two callers: `status` runs the same {@link renderStatus} the agent tool
 * runs, so the UI and the tool can never disagree.
 */
export class Pwsh7Dispatch extends Service {
  constructor(ctx) {
    super(ctx, 'dsh-pwshx')
    // Build the binding only inside the constructor: cordis returns a proxy from `new`,
    // and a binding built afterwards would carry the proxy instead of this instance.
    this.typertRemote = Object.freeze({
      service: this,
      serviceKey: 'dsh-pwshx',
      namespace: 'dsh-pwshx',
    })
  }

  /**
   * One Remote endpoint: the current status report and the gate snapshot the page renders as facts.
   * @returns a promise for `{ report, gate }`, or an explicit message when the row is not active.
   */
  status() {
    const ctx = getHostContext()
    if (ctx === null) return Promise.resolve({ report: 'The dsh-pwshx row is not active.' })
    return renderStatus(ctx, readRowConfig(ctx, undefined)).then((report) => {
      const gate = runtimeState(ctx).gate
      return { report, gate: { ...gate, ...(gate.recommended === undefined ? {} : { recommended: { ...gate.recommended } }) } }
    })
  }
}
