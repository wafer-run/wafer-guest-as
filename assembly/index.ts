// WAFFLE Guest SDK for AssemblyScript - Main Entry Point
//
// This module defines the Block abstract class, the register() function,
// and the WASM exports required by the WAFFLE runtime:
//   - malloc(size) -> ptr       : Allocate memory for the host to write into
//   - info() -> (ptr, len)      : Return block identity as JSON
//   - handle(ptr, len) -> (ptr, len) : Process a message and return result
//   - lifecycle(ptr, len) -> (ptr, len) : Handle lifecycle events

// Re-export all public types and utilities
export {
  Message,
  Result,
  Response,
  WaffleError,
  Action,
  BlockInfo,
  LifecycleEvent,
  LifecycleType,
  actionToString,
  actionFromString,
} from "./types";

export { Context } from "./context";

export {
  respond,
  jsonRespond,
  textRespond,
  error,
  errBadRequest,
  errUnauthorized,
  errForbidden,
  errNotFound,
  errConflict,
  errValidation,
  errInternal,
} from "./helpers";

export { ConfigClient } from "./services/config";
export { LoggerClient } from "./services/logger";

import {
  Message,
  Result,
  Response,
  WaffleError,
  Action,
  BlockInfo,
  LifecycleEvent,
  LifecycleType,
} from "./types";

import { Context } from "./context";

import {
  serializeMessage,
  deserializeMessage,
  serializeResult,
  deserializeResult,
  serializeBlockInfo,
  deserializeLifecycleEvent,
  serializeLifecycleResult,
} from "./wire";

// ---------------------------------------------------------------------------
// Block Abstract Class
// ---------------------------------------------------------------------------

/**
 * Block is the abstract base class that all WAFFLE blocks must extend.
 *
 * Implementors must override:
 *   - info(): Return block identity and metadata
 *   - handle(ctx, msg): Process a message and return a result
 *
 * Optionally override:
 *   - lifecycle(ctx, event): Handle lifecycle events (init, start, stop)
 *
 * Example:
 *
 *   class MyBlock extends Block {
 *     info(): BlockInfo {
 *       return new BlockInfo(
 *         "@app/my-block",
 *         "1.0.0",
 *         "processor@v1",
 *         "Processes incoming messages"
 *       );
 *     }
 *
 *     handle(ctx: Context, msg: Message): Result {
 *       const logger = new LoggerClient(ctx);
 *       logger.info("handling message: " + msg.kind);
 *       return msg.continue();
 *     }
 *   }
 *
 *   register(new MyBlock());
 */
export abstract class Block {
  /** Return this block's identity and capabilities. */
  abstract info(): BlockInfo;

  /**
   * Process a message and return a result.
   *
   * @param ctx Context providing runtime capabilities (logging, config, etc.)
   * @param msg The incoming message to process
   * @returns Result indicating what the runtime should do next
   */
  abstract handle(ctx: Context, msg: Message): Result;

  /**
   * Handle a lifecycle event. Override to handle init/start/stop.
   *
   * The default implementation is a no-op that returns no error.
   *
   * @param ctx Context providing runtime capabilities
   * @param event The lifecycle event (Init with config data, Start, or Stop)
   * @returns Error message string, or empty string for success
   */
  lifecycle(ctx: Context, event: LifecycleEvent): string {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Global Block Registration
// ---------------------------------------------------------------------------

/** The globally registered block instance, set by register(). */
let _registeredBlock: Block | null = null;

/**
 * Register a block instance as the WASM module's block implementation.
 *
 * This must be called exactly once at module initialization time.
 * The registered block's methods will be invoked by the exported WASM functions.
 *
 * @param block The block instance to register
 */
export function register(block: Block): void {
  _registeredBlock = block;
}

// ---------------------------------------------------------------------------
// Memory Management Export
// ---------------------------------------------------------------------------

/**
 * Allocate a buffer of the given size and return its pointer.
 * The host runtime calls this to allocate space for writing data
 * into the guest's linear memory.
 */
export function malloc(size: i32): i32 {
  const buf = new ArrayBuffer(size);
  return changetype<i32>(buf);
}

// ---------------------------------------------------------------------------
// Helper: Write string to memory and return packed (ptr, len) as i64
// ---------------------------------------------------------------------------

/** Write a string as UTF-8 to a new buffer and return packed (ptr, len) as i64. */
function writeResultString(s: string): i64 {
  const encoded = String.UTF8.encode(s);
  const ptr = (changetype<usize>(encoded) as i64) << 32;
  const len = (encoded.byteLength as i64) & 0xffffffff;
  // Pack: high 32 bits = ptr, low 32 bits = len
  return ptr | len;
}

/** Read a UTF-8 string from linear memory at (ptr, len). */
function readInputString(ptr: i32, len: i32): string {
  if (len <= 0 || ptr == 0) return "";
  const buf = new ArrayBuffer(len);
  memory.copy(changetype<usize>(buf), ptr as usize, len as usize);
  return String.UTF8.decode(buf);
}

// ---------------------------------------------------------------------------
// WASM Exports
// ---------------------------------------------------------------------------

/**
 * Return block info as JSON.
 * Called by the host to discover block identity and capabilities.
 *
 * @returns Packed (ptr, len) pointing to JSON-encoded BlockInfo
 */
export function info(): i64 {
  if (_registeredBlock == null) {
    const errJson = '{"name":"error","version":"0.0.0","interface":"error","summary":"no block registered","instance_mode":"per-node","allowed_modes":[]}';
    return writeResultString(errJson);
  }

  const blockInfo = _registeredBlock!.info();
  const json = serializeBlockInfo(blockInfo);
  return writeResultString(json);
}

/**
 * Process a message and return a result as JSON.
 * Called by the host for each message that flows through this block.
 *
 * @param ptr Pointer to JSON-encoded WasmMessage in linear memory
 * @param len Length of the JSON data
 * @returns Packed (ptr, len) pointing to JSON-encoded WasmResult
 */
export function handle(ptr: i32, len: i32): i64 {
  if (_registeredBlock == null) {
    const errJson = '{"action":"error","error":{"code":"internal","message":"no block registered"}}';
    return writeResultString(errJson);
  }

  const inputJson = readInputString(ptr, len);
  const msg = deserializeMessage(inputJson);
  const ctx = new Context();

  const result = _registeredBlock!.handle(ctx, msg);
  const resultJson = serializeResult(result);
  return writeResultString(resultJson);
}

/**
 * Handle a lifecycle event and return a result as JSON.
 * Called by the host during block lifecycle transitions (init, start, stop).
 *
 * @param ptr Pointer to JSON-encoded WasmLifecycleEvent in linear memory
 * @param len Length of the JSON data
 * @returns Packed (ptr, len) pointing to JSON-encoded lifecycle result
 */
export function lifecycle(ptr: i32, len: i32): i64 {
  if (_registeredBlock == null) {
    const errJson = '{"ok":false,"error":"no block registered"}';
    return writeResultString(errJson);
  }

  const inputJson = readInputString(ptr, len);
  const event = deserializeLifecycleEvent(inputJson);
  const ctx = new Context();

  const errorMsg = _registeredBlock!.lifecycle(ctx, event);
  const resultJson = serializeLifecycleResult(errorMsg);
  return writeResultString(resultJson);
}
