// WAFFLE Guest SDK for AssemblyScript - Context
//
// Wraps the WASM host imports (waffle.send, waffle.capabilities, waffle.is_cancelled)
// to provide a typed Context interface for blocks to interact with the runtime.

import { Message, Result, Action } from "./types";
import {
  serializeMessage,
  deserializeMessage,
  serializeResult,
  deserializeResult,
} from "./wire";

// ---------------------------------------------------------------------------
// Host Imports
// ---------------------------------------------------------------------------

// These are imported from the "waffle" namespace provided by the host runtime.
// send(ptr, len) -> i64 : Send a message and receive a result.
//   The i64 return packs (result_ptr: i32, result_len: i32).
// capabilities() -> i64 : Get available capabilities as JSON.
//   The i64 return packs (ptr: i32, len: i32).
// is_cancelled() -> i32 : Check if the context has been cancelled (0 or 1).

@external("waffle", "send")
declare function hostSend(ptr: i32, len: i32): i64;

@external("waffle", "capabilities")
declare function hostCapabilities(): i64;

@external("waffle", "is_cancelled")
declare function hostIsCancelled(): i32;

// ---------------------------------------------------------------------------
// Pointer Packing Helpers
// ---------------------------------------------------------------------------

/** Unpack a (ptr, len) pair from an i64. High 32 bits = ptr, low 32 bits = len. */
function unpackPtrLen(packed: i64): PtrLen {
  const ptr = <i32>((packed >> 32) & 0xffffffff);
  const len = <i32>(packed & 0xffffffff);
  return new PtrLen(ptr, len);
}

class PtrLen {
  ptr: i32;
  len: i32;
  constructor(ptr: i32, len: i32) {
    this.ptr = ptr;
    this.len = len;
  }
}

/** Read a UTF-8 string from linear memory at (ptr, len). */
function readStringFromMemory(ptr: i32, len: i32): string {
  if (len <= 0 || ptr == 0) return "";
  const buf = new ArrayBuffer(len);
  memory.copy(changetype<usize>(buf), ptr as usize, len as usize);
  return String.UTF8.decode(buf);
}

// ---------------------------------------------------------------------------
// Context Class
// ---------------------------------------------------------------------------

/**
 * Context wraps the WASM host imports to provide runtime capabilities to blocks.
 *
 * Blocks use ctx.send() to interact with the runtime (logging, config, etc).
 * Service-specific clients (ConfigClient, LoggerClient) are built on top of this.
 */
export class Context {
  /**
   * Send a message to a runtime capability.
   *
   * This is the generic interface for all runtime interactions:
   * - kind="log" : Write a log message
   * - kind="config.get" : Get a configuration value
   * - etc.
   *
   * @param msg The message to send to the runtime
   * @returns The result from the runtime
   */
  send(msg: Message): Result {
    const jsonStr = serializeMessage(msg);
    const encoded = String.UTF8.encode(jsonStr);
    const ptr = changetype<usize>(encoded) as i32;
    const len = encoded.byteLength as i32;

    const packed = hostSend(ptr, len);
    const pl = unpackPtrLen(packed);

    if (pl.len <= 0 || pl.ptr == 0) {
      // Return a default continue result on failure
      return new Result(Action.Continue);
    }

    const resultJson = readStringFromMemory(pl.ptr, pl.len);
    return deserializeResult(resultJson);
  }

  /**
   * Get available runtime capabilities as a raw JSON string.
   *
   * @returns JSON string describing available capabilities
   */
  capabilitiesRaw(): string {
    const packed = hostCapabilities();
    const pl = unpackPtrLen(packed);
    if (pl.len <= 0 || pl.ptr == 0) return "[]";
    return readStringFromMemory(pl.ptr, pl.len);
  }

  /**
   * Check if the context has been cancelled (e.g., timeout exceeded).
   *
   * Blocks should check this during long-running operations and return
   * early when cancelled.
   *
   * @returns true if the context has been cancelled
   */
  isCancelled(): bool {
    return hostIsCancelled() != 0;
  }
}
