import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ToolMetadata } from "./mcp-tools";

import { logger } from "./logger";

const generateCorrelationId = () => `corr-${Math.random().toString(36).substring(2, 10)}`;

/**
 * Creates a Lambda handler that exposes a single MCP tool with its implementation.
 */
export function createToolHandler(
  metadata: ToolMetadata,
  implementation: (args: any, context: { correlationId: string }) => Promise<any>
) {
  return async (event: APIGatewayProxyEventV2, context: any): Promise<APIGatewayProxyResultV2> => {
    // Prevent the Lambda from hanging/crashing due to background tasks in the MCP transport
    context.callbackWaitsForEmptyEventLoop = false;

    const correlationId = (event.headers["x-correlation-id"] as string) || generateCorrelationId();
    let mcpClient: Client | undefined;
    let parsedId: any = null;

    try {
      if (!event.body) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Empty request body" })
        };
      }

      const parsed = JSON.parse(event.body);
      parsedId = parsed.id ?? null;

      if (parsed.method === "initialize") {
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": correlationId
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: parsedId,
            result: {
              protocolVersion: parsed.params?.protocolVersion ?? "2024-11-05",
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: `mcp-${metadata.name}`,
                version: "1.0.0"
              }
            }
          }),
        };
      } else if (parsed.method === "notifications/initialized") {
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": correlationId
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            result: {}
          }),
        };
      }

      const server = new McpServer({
        name: `mcp-${metadata.name}`,
        version: "1.0.0",
      });

      // Register the tool implementation with injected context
      server.registerTool(
        metadata.name,
        {
          description: metadata.description,
          inputSchema: metadata.inputSchema,
        },
        async (args: any) => {
          logger.info(`MCP_TOOL_INVOKED_${metadata.name}`, { correlationId });
          return implementation(args, { correlationId });
        }
      );

      // Standard Health Check Tool (Internal)
      server.registerTool(
        "__health",
        {
          description: "Internal health check probe",
          inputSchema: {},
        },
        async () => ({
          content: [{ type: "text", text: "OK" }],
          metadata: {
            timestamp: new Date().toISOString(),
            version: "1.0.0",
            lambda: metadata.name,
            correlationId
          }
        })
      );

      // Create a linked pair of In-Memory transports to bridge the request
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      mcpClient = new Client({ name: "lambda-bridge", version: "1.0.0" });
      await mcpClient.connect(clientTransport);

      // Calculate internal timeout guard (Lambda timeout - 1s)
      const lambdaTimeoutMs = context.getRemainingTimeInMillis?.() || 6000;
      const guardTimeoutMs = Math.max(1000, lambdaTimeoutMs - 1000);

      let result: any;
      if (parsed.method === "tools/list") {
        result = await Promise.race([
          mcpClient.listTools(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("MCP bridge listTools timeout")), guardTimeoutMs))
        ]);
      } else if (parsed.method === "tools/call") {
        result = await Promise.race([
          mcpClient.callTool({
            name: parsed.params.name,
            arguments: parsed.params.arguments,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("MCP bridge callTool timeout")), guardTimeoutMs))
        ]);
      } else {
        return {
          statusCode: 400,
          headers: { "x-correlation-id": correlationId },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: parsedId,
            error: { code: -32601, message: `Method not supported: ${parsed.method}` }
          })
        };
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "x-correlation-id": correlationId
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: parsedId,
          result
        }),
      };
    } catch (error: unknown) {
      logger.error(`MCP_TOOL_ERROR_${metadata.name}`, error, { correlationId });
      return {
        statusCode: 500,
        headers: { "x-correlation-id": correlationId },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: parsedId,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal Server Error"
          }
        }),
      };
    } finally {
      // Gracefully close the client to clean up all background timers and internal transports
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch (e) {
          logger.warn(`MCP_CLIENT_CLOSE_FAILED_${metadata.name}`, { correlationId });
        }
      }
    }
  };
}
