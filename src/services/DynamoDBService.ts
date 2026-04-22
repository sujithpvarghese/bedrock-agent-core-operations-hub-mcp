import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../config";
import { logger } from "../logger";

const client = new DynamoDBClient({ region: config.AWS_REGION });
const doc = DynamoDBDocumentClient.from(client);

export class DynamoDBService {
  /**
   * Retrieves a single item by its primary key.
   */
  static async getItem<T>(tableName: string, key: Record<string, any>): Promise<T | null> {
    try {
      const result = await doc.send(new GetCommand({
        TableName: tableName,
        Key: key
      }));
      return (result.Item as T) || null;
    } catch (error) {
      logger.error("DDB_GET_ITEM_FAILED", error, { tableName, key });
      throw error; // Propagate the real error (Throttling, etc.) to the caller
    }
  }

  /**
   * Puts an item into the table.
   */
  static async putItem(tableName: string, item: Record<string, any>): Promise<void> {
    try {
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: item
      }));
    } catch (error) {
      logger.error("DDB_PUT_ITEM_FAILED", { tableName, productId: item.productId || item.skuId, error });
      throw error;
    }
  }

  /**
   * Query items (useful for future GSI-based SKU lookup).
   */
  static async query<T>(tableName: string, params: any): Promise<T[]> {
    try {
      const result = await doc.send(new QueryCommand({
        TableName: tableName,
        ...params
      }));
      return (result.Items as T[]) || [];
    } catch (error) {
      logger.error("DDB_QUERY_FAILED", error, { tableName, params });
      throw error;
    }
  }
}
