// WAFFLE Guest SDK for AssemblyScript - Config Service Client
//
// Provides a typed client for the "config.get" and "config.set" runtime
// capabilities. Built on top of Context.send().

import { Context } from "../context";
import { Message, Action } from "../types";

/**
 * ConfigClient provides access to the runtime's configuration service.
 *
 * Usage:
 *   const config = new ConfigClient(ctx);
 *   const dbPath = config.get("database_path");
 *   if (dbPath.length > 0) {
 *     // use dbPath
 *   }
 */
export class ConfigClient {
  private ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  /**
   * Get a configuration value by key.
   *
   * Sends a message with kind="config.get" and meta key="key" to the runtime.
   * Returns the value as a string, or empty string if not found.
   *
   * @param key The configuration key to retrieve
   * @returns The configuration value, or empty string if not found
   */
  get(key: string): string {
    const msg = new Message("config.get");
    msg.setMeta("key", key);

    const result = this.ctx.send(msg);
    if (result.action == Action.Error || result.response == null) {
      return "";
    }

    const resp = result.response!;
    return String.UTF8.decode(resp.data);
  }

  /**
   * Set a configuration value.
   *
   * Sends a message with kind="config.set", meta key="key", and the value
   * as the data payload. Returns true if the operation succeeded.
   *
   * Note: Not all runtimes support config.set. Check capabilities first.
   *
   * @param key The configuration key to set
   * @param value The value to set
   * @returns true if the operation succeeded
   */
  set(key: string, value: string): bool {
    const msg = new Message("config.set");
    msg.setMeta("key", key);
    msg.setDataString(value);

    const result = this.ctx.send(msg);
    return result.action != Action.Error;
  }
}
