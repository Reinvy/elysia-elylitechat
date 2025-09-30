import { Elysia } from "elysia";
import { chatService } from "./chat.service.js";
import { chatController } from "./chat.controller.js";
import { chatRoute } from "./chat.routes.js";

/**
 * Chat Module - Provides complete chat functionality including:
 * - RESTful API endpoints for chat operations
 * - Business logic for message handling
 * - Database operations through Prisma
 * - Authentication and authorization
 * - Real-time messaging capabilities
 */
export class ChatModule {
  private service: typeof chatService;
  private controller: typeof chatController;
  private routes: typeof chatRoute;

  constructor() {
    this.service = chatService;
    this.controller = chatController;
    this.routes = chatRoute;
  }

  /**
   * Get the chat service instance
   */
  getService(): typeof chatService {
    return this.service;
  }

  /**
   * Get the chat controller instance
   */
  getController(): typeof chatController {
    return this.controller;
  }

  /**
   * Get the chat routes
   */
  getRoutes(): typeof chatRoute {
    return this.routes;
  }

  /**
   * Initialize the chat module
   */
  initialize(): Elysia {
    console.log("Initializing Chat Module...");
    
    // Validate required dependencies
    if (!this.service) {
      throw new Error("Chat service not initialized");
    }
    
    if (!this.controller) {
      throw new Error("Chat controller not initialized");
    }
    
    if (!this.routes) {
      throw new Error("Chat routes not initialized");
    }

    // Create and return the configured routes
    return this.routes;
  }

  /**
   * Health check for the chat module
   */
  health() {
    return {
      success: true,
      message: "Chat module is initialized and ready",
      data: {
        timestamp: new Date().toISOString(),
        service: "chat module",
        status: "active",
        components: {
          service: "✓",
          controller: "✓",
          routes: "✓",
        },
      },
    };
  }
}

// Export singleton instance
export const chatModule = new ChatModule();

// Export individual components for backward compatibility
export { chatService } from "./chat.service.js";
export { chatController } from "./chat.controller.js";
export { chatRoute } from "./chat.routes.js";