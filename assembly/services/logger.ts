// WAFFLE Guest SDK for AssemblyScript - Logger Service Client
//
// Provides a typed logging client built on top of Context.send().
// Sends log messages through the "log" capability.

import { Context } from "../context";
import { Message } from "../types";

/**
 * LoggerClient provides structured logging through the runtime's log capability.
 *
 * Usage:
 *   const logger = new LoggerClient(ctx);
 *   logger.info("processing request");
 *   logger.debug("user id: " + userId);
 *   logger.error("database connection failed");
 */
export class LoggerClient {
  private ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  /**
   * Log a message at the specified level.
   *
   * Sends a message with kind="log", meta level=<level>, and the log
   * message as the data payload.
   *
   * @param level Log level ("debug", "info", "warn", "error")
   * @param message The log message
   */
  log(level: string, message: string): void {
    const msg = new Message("log");
    msg.setMeta("level", level);
    msg.setDataString(message);
    this.ctx.send(msg);
  }

  /** Log a message at debug level. */
  debug(message: string): void {
    this.log("debug", message);
  }

  /** Log a message at info level. */
  info(message: string): void {
    this.log("info", message);
  }

  /** Log a message at warn level. */
  warn(message: string): void {
    this.log("warn", message);
  }

  /** Log a message at error level. */
  error(message: string): void {
    this.log("error", message);
  }
}
