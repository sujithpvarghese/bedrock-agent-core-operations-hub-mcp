import { DynamoDBService } from "./DynamoDBService";
import { config } from "../config";
import { logger } from "../logger";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export class SessionService {
  /**
   * Retrieves chat history for a session from DynamoDB.
   */
  static async getHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      if (config.USE_MOCKS && (sessionId.startsWith("mock-") || sessionId.startsWith("eval-"))) {
        return [];
      }
      const session = await DynamoDBService.getItem<any>(config.DDB_TABLE_SESSIONS, { sessionId });
      return session?.messages || [];
    } catch (error) {
      logger.error("SESSION_GET_HISTORY_FAILED", error, { sessionId });
      return [];
    }
  }

  /**
   * Appends a new message to the session history.
   * Keeps only the last 10 messages to maintain a lean context window.
   */
  static async saveMessage(sessionId: string, role: "user" | "assistant", content: string): Promise<void> {
    try {
      if (config.USE_MOCKS && (sessionId.startsWith("mock-") || sessionId.startsWith("eval-"))) {
        return;
      }

      const history = await this.getHistory(sessionId);
      const newMessage: ChatMessage = {
        role,
        content,
        timestamp: new Date().toISOString()
      };
      
      // Sliding window: keep only the most recent context
      const updatedHistory = [...history, newMessage].slice(-10);
      
      await DynamoDBService.putItem(config.DDB_TABLE_SESSIONS, {
        sessionId,
        messages: updatedHistory,
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hour auto-expiry (TTL)
      });
    } catch (error) {
      logger.error("SESSION_SAVE_MESSAGE_FAILED", error, { sessionId });
    }
  }
}
