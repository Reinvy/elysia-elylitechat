import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import {
  pubSub,
  connectionManager,
  broadcastTypingEvent,
  broadcastNewMessage,
} from "../modules/chat/websocket.js";

describe("ElyLiteChat - WebSocket & PubSub Engine", () => {
  const dummyUser = {
    id: "user_test_ws_1",
    email: "ws1@example.com",
    username: "ws1",
  };

  it("should subscribe and receive events from PubSub", async () => {
    let receivedData: any = null;
    const topic = "TEST_TOPIC";

    const unsubscribe = pubSub.subscribe(topic, (data) => {
      receivedData = data;
    });

    pubSub.publish(topic, { message: "Hello PubSub" });
    expect(receivedData).toEqual({ message: "Hello PubSub" });

    unsubscribe();
    receivedData = null;
    pubSub.publish(topic, { message: "Should not receive" });
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

  it("should stream typing events over PubSub", async () => {
    let receivedTyping: any = null;
    const convId = "conv_typing_test";

    const unsubscribe = pubSub.subscribe(`TYPING_STATUS:${convId}`, (data) => {
      receivedTyping = data;
    });

    await broadcastTypingEvent(convId, dummyUser, true);
    expect(receivedTyping).toBeDefined();
    expect(receivedTyping.typingStatus.isTyping).toBe(true);
    expect(receivedTyping.typingStatus.userId).toBe(dummyUser.id);

    unsubscribe();
  });
});
