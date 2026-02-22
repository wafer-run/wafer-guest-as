// WAFFLE Guest SDK for AssemblyScript - Helpers
//
// Convenience functions for common block operations: responding, error handling,
// logging, and config access. These mirror the helpers in the Rust runtime's
// helpers.rs and the Go SDK's helpers.go.

import {
  Message,
  Result,
  Response,
  WaffleError,
  Action,
} from "./types";

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

/**
 * Create a Respond result with a body, status code, and content type.
 *
 * @param msg The current message
 * @param status HTTP status code (stored in meta as "resp.status")
 * @param data Response body
 * @param contentType Content type (stored in meta as "resp.content_type")
 */
export function respond(
  msg: Message,
  status: u16,
  data: ArrayBuffer,
  contentType: string
): Result {
  const meta: string[][] = [];
  meta.push(["resp.status", status.toString()]);
  if (contentType.length > 0) {
    meta.push(["resp.content_type", contentType]);
  }
  return msg.respond(new Response(data, meta));
}

/**
 * Create a Respond result with a JSON body and status code.
 *
 * @param msg The current message
 * @param status HTTP status code
 * @param jsonBody JSON string body
 */
export function jsonRespond(
  msg: Message,
  status: u16,
  jsonBody: string
): Result {
  return respond(msg, status, String.UTF8.encode(jsonBody), "application/json");
}

/**
 * Create a Respond result with a plain text body and status code.
 *
 * @param msg The current message
 * @param status HTTP status code
 * @param text Text body
 */
export function textRespond(
  msg: Message,
  status: u16,
  text: string
): Result {
  return respond(msg, status, String.UTF8.encode(text), "text/plain");
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Create an Error result with a status code, error code, and message.
 *
 * @param msg The current message
 * @param status HTTP status code
 * @param errCode Error code (e.g., "invalid_argument", "not_found")
 * @param errMessage Human-readable error message
 */
export function error(
  msg: Message,
  status: u16,
  errCode: string,
  errMessage: string
): Result {
  const err = new WaffleError(errCode, errMessage);
  err.meta.push(["resp.status", status.toString()]);
  return msg.error(err);
}

/** Create a 400 Bad Request error. */
export function errBadRequest(msg: Message, message: string): Result {
  return error(msg, 400, "bad_request", message);
}

/** Create a 401 Unauthorized error. */
export function errUnauthorized(msg: Message, message: string): Result {
  return error(msg, 401, "unauthorized", message);
}

/** Create a 403 Forbidden error. */
export function errForbidden(msg: Message, message: string): Result {
  return error(msg, 403, "forbidden", message);
}

/** Create a 404 Not Found error. */
export function errNotFound(msg: Message, message: string): Result {
  return error(msg, 404, "not_found", message);
}

/** Create a 409 Conflict error. */
export function errConflict(msg: Message, message: string): Result {
  return error(msg, 409, "conflict", message);
}

/** Create a 422 Validation Error. */
export function errValidation(msg: Message, message: string): Result {
  return error(msg, 422, "validation_error", message);
}

/** Create a 500 Internal Error. */
export function errInternal(msg: Message, message: string): Result {
  return error(msg, 500, "internal_error", message);
}
