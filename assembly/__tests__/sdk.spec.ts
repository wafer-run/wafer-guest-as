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
} from "../index";

import {
  serializeMessage,
  deserializeMessage,
  serializeResult,
  deserializeResult,
  serializeBlockInfo,
  deserializeLifecycleEvent,
  serializeLifecycleResult,
} from "../wire";

// ---------------------------------------------------------------------------
// Message Tests
// ---------------------------------------------------------------------------

describe("Message", () => {
  it("should create a default message", () => {
    const msg = new Message();
    expect(msg.kind).toBe("");
    expect(msg.data.byteLength).toBe(0);
    expect(msg.meta.length).toBe(0);
  });

  it("should create a message with kind", () => {
    const msg = new Message("test.kind");
    expect(msg.kind).toBe("test.kind");
  });

  it("should get and set metadata", () => {
    const msg = new Message();
    msg.setMeta("key1", "value1");
    msg.setMeta("key2", "value2");
    expect(msg.getMeta("key1")).toBe("value1");
    expect(msg.getMeta("key2")).toBe("value2");
    expect(msg.getMeta("missing")).toBe("");
  });

  it("should overwrite existing metadata", () => {
    const msg = new Message();
    msg.setMeta("key", "old");
    msg.setMeta("key", "new");
    expect(msg.getMeta("key")).toBe("new");
    expect(msg.meta.length).toBe(1);
  });

  it("should set and get data as string", () => {
    const msg = new Message();
    msg.setDataString("hello world");
    expect(msg.dataString()).toBe("hello world");
  });

  it("should return Continue result", () => {
    const msg = new Message();
    const result = msg.continue();
    expect(result.action).toBe(Action.Continue);
    expect(result.response).toBeNull();
    expect(result.error).toBeNull();
  });

  it("should return Drop result", () => {
    const msg = new Message();
    const result = msg.drop();
    expect(result.action).toBe(Action.Drop);
  });

  it("should return Respond result", () => {
    const msg = new Message();
    const resp = Response.fromString("ok");
    const result = msg.respond(resp);
    expect(result.action).toBe(Action.Respond);
    expect(result.response).not.toBeNull();
  });

  it("should return Error result", () => {
    const msg = new Message();
    const err = new WaffleError("bad_request", "invalid input");
    const result = msg.error(err);
    expect(result.action).toBe(Action.Error);
    expect(result.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Action Tests
// ---------------------------------------------------------------------------

describe("Action", () => {
  it("should convert actions to strings", () => {
    expect(actionToString(Action.Continue)).toBe("continue");
    expect(actionToString(Action.Respond)).toBe("respond");
    expect(actionToString(Action.Drop)).toBe("drop");
    expect(actionToString(Action.Error)).toBe("error");
  });

  it("should parse actions from strings", () => {
    expect(actionFromString("continue")).toBe(Action.Continue);
    expect(actionFromString("respond")).toBe(Action.Respond);
    expect(actionFromString("drop")).toBe(Action.Drop);
    expect(actionFromString("error")).toBe(Action.Error);
    // unknown defaults to Continue
    expect(actionFromString("unknown")).toBe(Action.Continue);
  });
});

// ---------------------------------------------------------------------------
// WaffleError Tests
// ---------------------------------------------------------------------------

describe("WaffleError", () => {
  it("should create an error with code and message", () => {
    const err = new WaffleError("not_found", "resource not found");
    expect(err.code).toBe("not_found");
    expect(err.message).toBe("resource not found");
    expect(err.meta.length).toBe(0);
  });

  it("should add meta via withMeta", () => {
    const err = new WaffleError("bad_request", "invalid");
    const err2 = err.withMeta("field", "email");
    expect(err2.code).toBe("bad_request");
    expect(err2.message).toBe("invalid");
    expect(err2.meta.length).toBe(1);
    // original is not modified
    expect(err.meta.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BlockInfo Tests
// ---------------------------------------------------------------------------

describe("BlockInfo", () => {
  it("should create block info", () => {
    const info = new BlockInfo(
      "@app/test",
      "1.0.0",
      "processor@v1",
      "Test block"
    );
    expect(info.name).toBe("@app/test");
    expect(info.version).toBe("1.0.0");
    expect(info.iface).toBe("processor@v1");
    expect(info.summary).toBe("Test block");
    expect(info.instanceMode).toBe("per-node");
    expect(info.allowedModes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wire Format: Message Serialization
// ---------------------------------------------------------------------------

describe("Wire: Message", () => {
  it("should round-trip an empty message", () => {
    const msg = new Message();
    const json = serializeMessage(msg);
    const msg2 = deserializeMessage(json);
    expect(msg2.kind).toBe("");
    expect(msg2.data.byteLength).toBe(0);
    expect(msg2.meta.length).toBe(0);
  });

  it("should round-trip a message with kind and data", () => {
    const msg = new Message("test.event");
    msg.setDataString("hello");
    const json = serializeMessage(msg);
    const msg2 = deserializeMessage(json);
    expect(msg2.kind).toBe("test.event");
    expect(msg2.dataString()).toBe("hello");
  });

  it("should round-trip a message with metadata", () => {
    const msg = new Message("log");
    msg.setMeta("level", "info");
    msg.setMeta("source", "test");
    const json = serializeMessage(msg);
    const msg2 = deserializeMessage(json);
    expect(msg2.kind).toBe("log");
    expect(msg2.getMeta("level")).toBe("info");
    expect(msg2.getMeta("source")).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// Wire Format: Result Serialization
// ---------------------------------------------------------------------------

describe("Wire: Result", () => {
  it("should round-trip a Continue result", () => {
    const result = new Result(Action.Continue);
    const json = serializeResult(result);
    const result2 = deserializeResult(json);
    expect(result2.action).toBe(Action.Continue);
    expect(result2.response).toBeNull();
    expect(result2.error).toBeNull();
  });

  it("should round-trip a Respond result", () => {
    const result = new Result(Action.Respond);
    result.response = Response.fromString("ok");
    const json = serializeResult(result);
    const result2 = deserializeResult(json);
    expect(result2.action).toBe(Action.Respond);
    expect(result2.response).not.toBeNull();
  });

  it("should round-trip an Error result", () => {
    const result = new Result(Action.Error);
    result.error = new WaffleError("internal", "something broke");
    const json = serializeResult(result);
    const result2 = deserializeResult(json);
    expect(result2.action).toBe(Action.Error);
    expect(result2.error).not.toBeNull();
    expect(result2.error!.code).toBe("internal");
    expect(result2.error!.message).toBe("something broke");
  });
});

// ---------------------------------------------------------------------------
// Wire Format: BlockInfo Serialization
// ---------------------------------------------------------------------------

describe("Wire: BlockInfo", () => {
  it("should serialize block info to JSON", () => {
    const info = new BlockInfo(
      "@app/echo",
      "2.0.0",
      "processor@v1",
      "Echo block",
      "per-node",
      ["per-node", "singleton"]
    );
    const json = serializeBlockInfo(info);
    // Verify it contains expected fields
    expect(json.includes('"name":"@app/echo"')).toBe(true);
    expect(json.includes('"version":"2.0.0"')).toBe(true);
    expect(json.includes('"interface":"processor@v1"')).toBe(true);
    expect(json.includes('"summary":"Echo block"')).toBe(true);
    expect(json.includes('"instance_mode":"per-node"')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wire Format: LifecycleEvent Deserialization
// ---------------------------------------------------------------------------

describe("Wire: LifecycleEvent", () => {
  it("should deserialize an init event", () => {
    const json = '{"type":"init","data":"aGVsbG8="}';
    const evt = deserializeLifecycleEvent(json);
    expect(evt.eventType).toBe(LifecycleType.Init);
    expect(evt.dataString()).toBe("hello");
  });

  it("should deserialize a start event", () => {
    const json = '{"type":"start","data":""}';
    const evt = deserializeLifecycleEvent(json);
    expect(evt.eventType).toBe(LifecycleType.Start);
  });

  it("should deserialize a stop event", () => {
    const json = '{"type":"stop","data":""}';
    const evt = deserializeLifecycleEvent(json);
    expect(evt.eventType).toBe(LifecycleType.Stop);
  });
});

// ---------------------------------------------------------------------------
// Wire Format: Lifecycle Result Serialization
// ---------------------------------------------------------------------------

describe("Wire: LifecycleResult", () => {
  it("should serialize success result", () => {
    const json = serializeLifecycleResult("");
    expect(json).toBe('{"ok":true,"error":""}');
  });

  it("should serialize error result", () => {
    const json = serializeLifecycleResult("initialization failed");
    expect(json.includes('"ok":false')).toBe(true);
    expect(json.includes("initialization failed")).toBe(true);
  });
});
