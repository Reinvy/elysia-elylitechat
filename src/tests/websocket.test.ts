import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import {
  pubSub,
  connectionManager,
  broadcastTypingEvent,
  broadcastNewMessage,
  ensureBus,
} from "../modules/chat/websocket.js";
import { disconnectRedis, roomChannel } from "../redis.js";

describe("ElyLiteChat - WebSocket & Redis PubSub Engine", () => {
  const dummyUser = {
    id: "user_test_ws_1",
    email: "ws1@example.com",
    username: "ws1",
  };

  beforeAll(async () => {
    await ensureBus();
  });

  afterAll(async () => {
    connectionManager.cleanup();
    await disconnectRedis();
  });

  it("should subscribe and receive events over Redis pub/sub", async () => {
    let receivedData: any = null;
    const topic = roomChannel("test-topic-ws");

    const unsubscribe = pubSub.subscribe(topic, (data) => {
      receivedData = data;
    });

    await pubSub.publish(topic, { t: "ping-test", hello: "redis" });
    // allow the subscriber loop to dispatch
    await new Promise((r) => setTimeout(r, 150));
    expect(receivedData).toEqual({ t: "ping-test", hello: "redis" });

    unsubscribe();
    receivedData = null;
    await pubSub.publish(topic, { t: "should-not-receive" });
    await new Promise((r) => setTimeout(r, 150));
    expect(receivedData).toBeNull();
  });

  it("should manage client connections and record pongs", () => {
    const mockWs = {
      send: (data: string) => {},
      close: () => {},
    };

    const conn = connectionManager.addConnection("conn_123", mockWs, dummyUser);
    expect(conn.id).toBe("conn_123");
    expect(connectionManager.getConnection("conn_123")).toBeDefined();

    connectionManager.joinConversation("conn_123", "conv_456");
    expect(conn.conversations.has("conv_456")).toBe(true);

    connectionManager.recordPong("conn_123");
    expect(conn.lastPing).toBeGreaterThan(0);

    connectionManager.removeConnection("conn_123");
    expect(connectionManager.getConnection("conn_123")).toBeUndefined();
  });

  it("should stream canonical typing events with 3s debounce", async () => {
    const convId = "conv_typing_test";
    let receivedTyping: any = null;

    const unsubscribe = pubSub.subscribe(roomChannel(convId), (data) => {
      receivedTyping = data;
    });

    const first = await broadcastTypingEvent(convId, dummyUser, true);
    expect(first).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(receivedTyping).toBeDefined();
    expect(receivedTyping.t).toBe("chat:typing");
    expect(receivedTyping.on).toBe(true);
    expect(receivedTyping.u).toBe(dummyUser.id);

    // second claim inside the window is debounced (not published)
    const second = await broadcastTypingEvent(convId, dummyUser, true);
    expect(second).toBe(false);

    await broadcastTypingEvent(convId, dummyUser, false);
    await new Promise((r) => setTimeout(r, 150));
    expect(receivedTyping.on).toBe(false);

    unsubscribe();
  });

  it("should publish lean chat:new frames", async () => {
    const convId = "conv_newmsg_test";
    let received: any = null;
    const unsubscribe = pubSub.subscribe(roomChannel(convId), (data) => {
      received = data;
    });

    await broadcastNewMessage({
      id: "msg_1",
      conversationId: convId,
      senderId: dummyUser.id,
      content: "hello lean world",
    });
    await new Promise((r) => setTimeout(r, 150));

    expect(received).toBeDefined();
    expect(received.t).toBe("chat:new");
    expect(received.m).toBe("msg_1");
    expect(received.r).toBe(convId);
    expect(received.u).toBe(dummyUser.id);
    expect(received.c).toBe("hello lean world");

    unsubscribe();
  });
});
