// WAFFLE Guest SDK for AssemblyScript - Core Types
//
// These types mirror the WAFFLE specification's core types, adapted for
// AssemblyScript's type system. Meta is represented as string[][] (pairs)
// to match the wire format used across WASM boundaries.

/**
 * Message flows through the chain. Contains a kind identifier, payload data,
 * and string key-value metadata.
 */
export class Message {
  kind: string;
  data: ArrayBuffer;
  meta: string[][];

  constructor(
    kind: string = "",
    data: ArrayBuffer = new ArrayBuffer(0),
    meta: string[][] = []
  ) {
    this.kind = kind;
    this.data = data;
    this.meta = meta;
  }

  /** Get a metadata value by key. Returns empty string if not found. */
  getMeta(key: string): string {
    for (let i = 0; i < this.meta.length; i++) {
      if (this.meta[i][0] == key) {
        return this.meta[i][1];
      }
    }
    return "";
  }

  /** Set a metadata key-value pair. Overwrites if key exists. */
  setMeta(key: string, value: string): void {
    for (let i = 0; i < this.meta.length; i++) {
      if (this.meta[i][0] == key) {
        this.meta[i][1] = value;
        return;
      }
    }
    this.meta.push([key, value]);
  }

  /** Get data as a UTF-8 string. */
  dataString(): string {
    return String.UTF8.decode(this.data);
  }

  /** Set data from a UTF-8 string. */
  setDataString(s: string): void {
    this.data = String.UTF8.encode(s);
  }

  /** Return a Continue result, passing this message to the next block. */
  continue(): Result {
    return new Result(Action.Continue);
  }

  /** Return a Respond result, short-circuiting the chain with a response. */
  respond(response: Response): Result {
    const r = new Result(Action.Respond);
    r.response = response;
    return r;
  }

  /** Return a Drop result, ending the chain silently. */
  drop(): Result {
    return new Result(Action.Drop);
  }

  /** Return an Error result, short-circuiting the chain with an error. */
  error(err: WaffleError): Result {
    const r = new Result(Action.Error);
    r.error = err;
    return r;
  }
}

/**
 * Action tells the runtime what to do after a block processes a message.
 */
export enum Action {
  Continue = 0,
  Respond = 1,
  Drop = 2,
  Error = 3,
}

/** Convert an Action enum to its wire-format string. */
export function actionToString(a: Action): string {
  switch (a) {
    case Action.Continue:
      return "continue";
    case Action.Respond:
      return "respond";
    case Action.Drop:
      return "drop";
    case Action.Error:
      return "error";
    default:
      return "continue";
  }
}

/** Parse an Action from its wire-format string. */
export function actionFromString(s: string): Action {
  if (s == "continue") return Action.Continue;
  if (s == "respond") return Action.Respond;
  if (s == "drop") return Action.Drop;
  if (s == "error") return Action.Error;
  return Action.Continue;
}

/**
 * Response carries data back to the caller when a block short-circuits.
 */
export class Response {
  data: ArrayBuffer;
  meta: string[][];

  constructor(
    data: ArrayBuffer = new ArrayBuffer(0),
    meta: string[][] = []
  ) {
    this.data = data;
    this.meta = meta;
  }

  /** Create a Response from a string body. */
  static fromString(s: string, meta: string[][] = []): Response {
    return new Response(String.UTF8.encode(s), meta);
  }
}

/**
 * WaffleError represents a structured error returned by a block.
 */
export class WaffleError {
  code: string;
  message: string;
  meta: string[][];

  constructor(
    code: string = "",
    message: string = "",
    meta: string[][] = []
  ) {
    this.code = code;
    this.message = message;
    this.meta = meta;
  }

  /** Return a copy with an additional meta key-value pair. */
  withMeta(key: string, value: string): WaffleError {
    const e = new WaffleError(this.code, this.message, this.meta.slice());
    e.meta.push([key, value]);
    return e;
  }
}

/**
 * Result is the outcome of a block processing a message.
 */
export class Result {
  action: Action;
  response: Response | null;
  error: WaffleError | null;

  constructor(action: Action = Action.Continue) {
    this.action = action;
    this.response = null;
    this.error = null;
  }
}

/**
 * BlockInfo declares a block's identity and capabilities.
 */
export class BlockInfo {
  name: string;
  version: string;
  iface: string;
  summary: string;
  instanceMode: string;
  allowedModes: string[];

  constructor(
    name: string = "",
    version: string = "",
    iface: string = "",
    summary: string = "",
    instanceMode: string = "per-node",
    allowedModes: string[] = []
  ) {
    this.name = name;
    this.version = version;
    this.iface = iface;
    this.summary = summary;
    this.instanceMode = instanceMode;
    this.allowedModes = allowedModes;
  }
}

/**
 * LifecycleType identifies the kind of lifecycle event.
 */
export enum LifecycleType {
  Init = 0,
  Start = 1,
  Stop = 2,
}

/** Parse a LifecycleType from its wire-format string. */
export function lifecycleTypeFromString(s: string): LifecycleType {
  if (s == "init") return LifecycleType.Init;
  if (s == "start") return LifecycleType.Start;
  if (s == "stop") return LifecycleType.Stop;
  return LifecycleType.Init;
}

/**
 * LifecycleEvent is sent to blocks during lifecycle transitions.
 */
export class LifecycleEvent {
  eventType: LifecycleType;
  data: ArrayBuffer;

  constructor(
    eventType: LifecycleType = LifecycleType.Init,
    data: ArrayBuffer = new ArrayBuffer(0)
  ) {
    this.eventType = eventType;
    this.data = data;
  }

  /** Get the event data as a UTF-8 string (typically JSON config). */
  dataString(): string {
    return String.UTF8.decode(this.data);
  }
}
