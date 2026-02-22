// WAFFLE Guest SDK for AssemblyScript - Wire Format
//
// Handles serialization/deserialization of messages and results for the
// WASM boundary. The wire format uses JSON with:
// - data: base64-encoded string (matches Go's json.Marshal([]byte) convention)
// - meta: array of [key, value] string pairs
//
// This matches the Rust runtime's WasmMessage/WasmResult format exactly.

import {
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
  lifecycleTypeFromString,
} from "./types";

// ---------------------------------------------------------------------------
// JSON Helpers
// ---------------------------------------------------------------------------

/** Escape a string for JSON encoding. */
function jsonEscape(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c == 0x22) {
      out += '\\"';
    } else if (c == 0x5c) {
      out += "\\\\";
    } else if (c == 0x08) {
      out += "\\b";
    } else if (c == 0x0c) {
      out += "\\f";
    } else if (c == 0x0a) {
      out += "\\n";
    } else if (c == 0x0d) {
      out += "\\r";
    } else if (c == 0x09) {
      out += "\\t";
    } else if (c < 0x20) {
      const hex = c.toString(16);
      out += "\\u" + "0".repeat(4 - hex.length) + hex;
    } else {
      out += String.fromCharCode(c);
    }
  }
  return out;
}

/** Encode a string as a JSON string (with quotes). */
function jsonString(s: string): string {
  return '"' + jsonEscape(s) + '"';
}

/** Base64 alphabet. */
const B64_CHARS: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode an ArrayBuffer as a base64-encoded JSON string. */
function jsonBase64(buf: ArrayBuffer): string {
  const view = Uint8Array.wrap(buf);
  if (view.length == 0) return '""';
  let encoded = "";
  const len = view.length;
  for (let i = 0; i < len; i += 3) {
    const b0: u32 = view[i];
    const b1: u32 = i + 1 < len ? view[i + 1] : 0;
    const b2: u32 = i + 2 < len ? view[i + 2] : 0;
    const triple: u32 = (b0 << 16) | (b1 << 8) | b2;
    encoded += B64_CHARS.charAt(((triple >> 18) & 0x3f) as i32);
    encoded += B64_CHARS.charAt(((triple >> 12) & 0x3f) as i32);
    if (i + 1 < len) {
      encoded += B64_CHARS.charAt(((triple >> 6) & 0x3f) as i32);
    } else {
      encoded += "=";
    }
    if (i + 2 < len) {
      encoded += B64_CHARS.charAt((triple & 0x3f) as i32);
    } else {
      encoded += "=";
    }
  }
  return '"' + encoded + '"';
}

/** Encode meta (string[][]) as a JSON array of [key, value] pairs. */
function jsonMeta(meta: string[][]): string {
  if (meta.length == 0) return "[]";
  let out = "[";
  for (let i = 0; i < meta.length; i++) {
    if (i > 0) out += ",";
    out += "[" + jsonString(meta[i][0]) + "," + jsonString(meta[i][1]) + "]";
  }
  out += "]";
  return out;
}

/** Encode a string array as a JSON array. */
function jsonStringArray(arr: string[]): string {
  if (arr.length == 0) return "[]";
  let out = "[";
  for (let i = 0; i < arr.length; i++) {
    if (i > 0) out += ",";
    out += jsonString(arr[i]);
  }
  out += "]";
  return out;
}

// ---------------------------------------------------------------------------
// JSON Parsing Helpers
// ---------------------------------------------------------------------------

/** Skip whitespace in a JSON string starting at position i. */
function skipWhitespace(json: string, i: i32): i32 {
  while (i < json.length) {
    const c = json.charCodeAt(i);
    if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) break;
    i++;
  }
  return i;
}

/**
 * Parse a JSON string value starting at position i (must point to opening quote).
 * Returns the parsed string value, sets endPos to the position after the closing quote.
 */
let _parseStringEndPos: i32 = 0;

function parseJsonString(json: string, i: i32): string {
  // i should be at the opening quote
  if (i >= json.length || json.charCodeAt(i) != 0x22) {
    _parseStringEndPos = i;
    return "";
  }
  i++; // skip opening quote
  let result = "";
  while (i < json.length) {
    const c = json.charCodeAt(i);
    if (c == 0x22) {
      // closing quote
      _parseStringEndPos = i + 1;
      return result;
    }
    if (c == 0x5c) {
      // backslash escape
      i++;
      if (i >= json.length) break;
      const esc = json.charCodeAt(i);
      if (esc == 0x22) result += '"';
      else if (esc == 0x5c) result += "\\";
      else if (esc == 0x2f) result += "/";
      else if (esc == 0x62) result += "\b";
      else if (esc == 0x66) result += "\f";
      else if (esc == 0x6e) result += "\n";
      else if (esc == 0x72) result += "\r";
      else if (esc == 0x74) result += "\t";
      else if (esc == 0x75) {
        // unicode escape \uXXXX
        if (i + 4 < json.length) {
          const hex = json.substring(i + 1, i + 5);
          const code = I32.parseInt(hex, 16);
          result += String.fromCharCode(code);
          i += 4;
        }
      }
      i++;
    } else {
      result += String.fromCharCode(c);
      i++;
    }
  }
  _parseStringEndPos = i;
  return result;
}

/**
 * Parse a JSON number (integer) starting at position i.
 * Returns the parsed number value.
 */
function parseJsonNumber(json: string, i: i32): i32 {
  let start = i;
  if (i < json.length && json.charCodeAt(i) == 0x2d) i++; // minus sign
  while (i < json.length) {
    const c = json.charCodeAt(i);
    if (c < 0x30 || c > 0x39) break; // not a digit
    i++;
  }
  _parseStringEndPos = i;
  const numStr = json.substring(start, i);
  return I32.parseInt(numStr);
}

/** Decode a base64 character to its 6-bit value, or -1 if invalid. */
function b64CharVal(c: i32): i32 {
  if (c >= 0x41 && c <= 0x5a) return c - 0x41;       // A-Z
  if (c >= 0x61 && c <= 0x7a) return c - 0x61 + 26;   // a-z
  if (c >= 0x30 && c <= 0x39) return c - 0x30 + 52;   // 0-9
  if (c == 0x2b) return 62;  // +
  if (c == 0x2f) return 63;  // /
  return -1;
}

/**
 * Parse a base64-encoded JSON string starting at position i.
 * Expects i to be at the opening quote of the base64 string.
 * Returns an ArrayBuffer with the decoded bytes.
 */
function parseJsonBase64(json: string, i: i32): ArrayBuffer {
  // Parse the string value first
  const b64str = parseJsonString(json, i);
  i = _parseStringEndPos;

  if (b64str.length == 0) {
    return new ArrayBuffer(0);
  }

  // Trim padding
  let end = b64str.length;
  while (end > 0 && b64str.charCodeAt(end - 1) == 0x3d) end--; // '='

  // Decode base64
  const bytes: u8[] = [];
  let buf: u32 = 0;
  let bits: u32 = 0;
  for (let j = 0; j < end; j++) {
    const val = b64CharVal(b64str.charCodeAt(j));
    if (val < 0) continue;
    buf = (buf << 6) | (val as u32);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push(((buf >> bits) & 0xFF) as u8);
    }
  }

  const result = new ArrayBuffer(bytes.length);
  const view = Uint8Array.wrap(result);
  for (let j = 0; j < bytes.length; j++) {
    view[j] = bytes[j];
  }
  return result;
}

/**
 * Parse a JSON meta array [[key, value], ...] starting at position i.
 * Returns a string[][] of key-value pairs.
 */
function parseJsonMeta(json: string, i: i32): string[][] {
  const meta: string[][] = [];

  if (i >= json.length || json.charCodeAt(i) != 0x5b) {
    _parseStringEndPos = i;
    return meta;
  }
  i++; // skip [
  i = skipWhitespace(json, i);

  if (i < json.length && json.charCodeAt(i) == 0x5d) {
    _parseStringEndPos = i + 1;
    return meta;
  }

  while (i < json.length) {
    i = skipWhitespace(json, i);
    if (i >= json.length || json.charCodeAt(i) == 0x5d) {
      i++;
      break;
    }

    // Expect inner array [key, value]
    if (json.charCodeAt(i) != 0x5b) break;
    i++; // skip inner [
    i = skipWhitespace(json, i);

    const key = parseJsonString(json, i);
    i = _parseStringEndPos;
    i = skipWhitespace(json, i);
    if (i < json.length && json.charCodeAt(i) == 0x2c) i++; // skip comma
    i = skipWhitespace(json, i);

    const value = parseJsonString(json, i);
    i = _parseStringEndPos;
    i = skipWhitespace(json, i);

    if (i < json.length && json.charCodeAt(i) == 0x5d) i++; // skip inner ]

    meta.push([key, value]);

    i = skipWhitespace(json, i);
    if (i < json.length && json.charCodeAt(i) == 0x2c) i++; // skip comma
  }

  _parseStringEndPos = i;
  return meta;
}

/**
 * Skip a JSON value starting at position i (any type).
 * Advances past the value and returns the new position.
 */
function skipJsonValue(json: string, i: i32): i32 {
  i = skipWhitespace(json, i);
  if (i >= json.length) return i;

  const c = json.charCodeAt(i);

  // String
  if (c == 0x22) {
    parseJsonString(json, i);
    return _parseStringEndPos;
  }

  // Object
  if (c == 0x7b) {
    let depth: i32 = 1;
    i++;
    let inString = false;
    while (i < json.length && depth > 0) {
      const ch = json.charCodeAt(i);
      if (inString) {
        if (ch == 0x5c) {
          i++; // skip escaped char
        } else if (ch == 0x22) {
          inString = false;
        }
      } else {
        if (ch == 0x22) inString = true;
        else if (ch == 0x7b) depth++;
        else if (ch == 0x7d) depth--;
      }
      i++;
    }
    return i;
  }

  // Array
  if (c == 0x5b) {
    let depth: i32 = 1;
    i++;
    let inString = false;
    while (i < json.length && depth > 0) {
      const ch = json.charCodeAt(i);
      if (inString) {
        if (ch == 0x5c) {
          i++; // skip escaped char
        } else if (ch == 0x22) {
          inString = false;
        }
      } else {
        if (ch == 0x22) inString = true;
        else if (ch == 0x5b) depth++;
        else if (ch == 0x5d) depth--;
      }
      i++;
    }
    return i;
  }

  // Number, boolean, null
  while (i < json.length) {
    const ch = json.charCodeAt(i);
    if (
      ch == 0x2c ||
      ch == 0x7d ||
      ch == 0x5d ||
      ch == 0x20 ||
      ch == 0x0a ||
      ch == 0x0d ||
      ch == 0x09
    ) {
      break;
    }
    i++;
  }
  return i;
}

// ---------------------------------------------------------------------------
// Message Serialization
// ---------------------------------------------------------------------------

/** Serialize a Message to the wire-format JSON string. */
export function serializeMessage(msg: Message): string {
  let json = "{";
  json += '"kind":' + jsonString(msg.kind);
  json += ',"data":' + jsonBase64(msg.data);
  json += ',"meta":' + jsonMeta(msg.meta);
  json += "}";
  return json;
}

/** Deserialize a Message from the wire-format JSON string. */
export function deserializeMessage(json: string): Message {
  const msg = new Message();
  let i: i32 = 0;

  i = skipWhitespace(json, i);
  if (i >= json.length || json.charCodeAt(i) != 0x7b) return msg;
  i++; // skip {

  while (i < json.length) {
    i = skipWhitespace(json, i);
    if (i >= json.length || json.charCodeAt(i) == 0x7d) break;

    // Skip comma
    if (json.charCodeAt(i) == 0x2c) {
      i++;
      i = skipWhitespace(json, i);
    }

    // Parse key
    const key = parseJsonString(json, i);
    i = _parseStringEndPos;
    i = skipWhitespace(json, i);
    if (i < json.length && json.charCodeAt(i) == 0x3a) i++; // skip colon
    i = skipWhitespace(json, i);

    if (key == "kind") {
      msg.kind = parseJsonString(json, i);
      i = _parseStringEndPos;
    } else if (key == "data") {
      msg.data = parseJsonBase64(json, i);
      i = _parseStringEndPos;
    } else if (key == "meta") {
      msg.meta = parseJsonMeta(json, i);
      i = _parseStringEndPos;
    } else {
      i = skipJsonValue(json, i);
    }
  }

  return msg;
}

// ---------------------------------------------------------------------------
// Result Serialization
// ---------------------------------------------------------------------------

/** Serialize a Result to the wire-format JSON string. */
export function serializeResult(result: Result): string {
  let json = "{";
  json += '"action":' + jsonString(actionToString(result.action));

  if (result.response != null) {
    const resp = result.response!;
    json += ',"response":{';
    json += '"data":' + jsonBase64(resp.data);
    json += ',"meta":' + jsonMeta(resp.meta);
    json += "}";
  }

  if (result.error != null) {
    const err = result.error!;
    json += ',"error":{';
    json += '"code":' + jsonString(err.code);
    json += ',"message":' + jsonString(err.message);
    if (err.meta.length > 0) {
      json += ',"meta":' + jsonMeta(err.meta);
    }
    json += "}";
  }

  json += "}";
  return json;
}

/** Deserialize a Result from the wire-format JSON string. */
export function deserializeResult(json: string): Result {
  const result = new Result();
  let i: i32 = 0;

  i = skipWhitespace(json, i);
  if (i >= json.length || json.charCodeAt(i) != 0x7b) return result;
  i++; // skip {

  while (i < json.length) {
    i = skipWhitespace(json, i);
    if (i >= json.length || json.charCodeAt(i) == 0x7d) break;
    if (json.charCodeAt(i) == 0x2c) {
      i++;
      i = skipWhitespace(json, i);
    }

    const key = parseJsonString(json, i);
    i = _parseStringEndPos;
    i = skipWhitespace(json, i);
    if (i < json.length && json.charCodeAt(i) == 0x3a) i++;
    i = skipWhitespace(json, i);

    if (key == "action") {
      const actionStr = parseJsonString(json, i);
      i = _parseStringEndPos;
      result.action = actionFromString(actionStr);
    } else if (key == "response") {
      // Parse response object
      if (i < json.length && json.charCodeAt(i) == 0x7b) {
        const resp = new Response();
        i++; // skip {
        while (i < json.length) {
          i = skipWhitespace(json, i);
          if (i >= json.length || json.charCodeAt(i) == 0x7d) {
            i++;
            break;
          }
          if (json.charCodeAt(i) == 0x2c) {
            i++;
            i = skipWhitespace(json, i);
          }
          const rKey = parseJsonString(json, i);
          i = _parseStringEndPos;
          i = skipWhitespace(json, i);
          if (i < json.length && json.charCodeAt(i) == 0x3a) i++;
          i = skipWhitespace(json, i);

          if (rKey == "data") {
            resp.data = parseJsonBase64(json, i);
            i = _parseStringEndPos;
          } else if (rKey == "meta") {
            resp.meta = parseJsonMeta(json, i);
            i = _parseStringEndPos;
          } else {
            i = skipJsonValue(json, i);
          }
        }
        result.response = resp;
      } else {
        i = skipJsonValue(json, i);
      }
    } else if (key == "error") {
      // Parse error object
      if (i < json.length && json.charCodeAt(i) == 0x7b) {
        const err = new WaffleError();
        i++; // skip {
        while (i < json.length) {
          i = skipWhitespace(json, i);
          if (i >= json.length || json.charCodeAt(i) == 0x7d) {
            i++;
            break;
          }
          if (json.charCodeAt(i) == 0x2c) {
            i++;
            i = skipWhitespace(json, i);
          }
          const eKey = parseJsonString(json, i);
          i = _parseStringEndPos;
          i = skipWhitespace(json, i);
          if (i < json.length && json.charCodeAt(i) == 0x3a) i++;
          i = skipWhitespace(json, i);

          if (eKey == "code") {
            err.code = parseJsonString(json, i);
            i = _parseStringEndPos;
          } else if (eKey == "message") {
            err.message = parseJsonString(json, i);
            i = _parseStringEndPos;
          } else if (eKey == "meta") {
            err.meta = parseJsonMeta(json, i);
            i = _parseStringEndPos;
          } else {
            i = skipJsonValue(json, i);
          }
        }
        result.error = err;
      } else {
        i = skipJsonValue(json, i);
      }
    } else {
      i = skipJsonValue(json, i);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// BlockInfo Serialization
// ---------------------------------------------------------------------------

/** Serialize a BlockInfo to the wire-format JSON string. */
export function serializeBlockInfo(info: BlockInfo): string {
  let json = "{";
  json += '"name":' + jsonString(info.name);
  json += ',"version":' + jsonString(info.version);
  json += ',"interface":' + jsonString(info.iface);
  json += ',"summary":' + jsonString(info.summary);
  json += ',"instance_mode":' + jsonString(info.instanceMode);
  json += ',"allowed_modes":' + jsonStringArray(info.allowedModes);
  json += "}";
  return json;
}

// ---------------------------------------------------------------------------
// LifecycleEvent Deserialization
// ---------------------------------------------------------------------------

/** Deserialize a LifecycleEvent from the wire-format JSON string. */
export function deserializeLifecycleEvent(json: string): LifecycleEvent {
  const evt = new LifecycleEvent();
  let i: i32 = 0;

  i = skipWhitespace(json, i);
  if (i >= json.length || json.charCodeAt(i) != 0x7b) return evt;
  i++; // skip {

  while (i < json.length) {
    i = skipWhitespace(json, i);
    if (i >= json.length || json.charCodeAt(i) == 0x7d) break;
    if (json.charCodeAt(i) == 0x2c) {
      i++;
      i = skipWhitespace(json, i);
    }

    const key = parseJsonString(json, i);
    i = _parseStringEndPos;
    i = skipWhitespace(json, i);
    if (i < json.length && json.charCodeAt(i) == 0x3a) i++;
    i = skipWhitespace(json, i);

    if (key == "type") {
      const typeStr = parseJsonString(json, i);
      i = _parseStringEndPos;
      evt.eventType = lifecycleTypeFromString(typeStr);
    } else if (key == "data") {
      evt.data = parseJsonBase64(json, i);
      i = _parseStringEndPos;
    } else {
      i = skipJsonValue(json, i);
    }
  }

  return evt;
}

// ---------------------------------------------------------------------------
// Lifecycle Result Serialization
// ---------------------------------------------------------------------------

/** Serialize a lifecycle result (ok/error format). */
export function serializeLifecycleResult(errorMsg: string): string {
  if (errorMsg.length == 0) {
    return '{"ok":true,"error":""}';
  }
  return '{"ok":false,"error":' + jsonString(errorMsg) + "}";
}
