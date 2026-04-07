import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const correlationId = (event.headers["x-correlation-id"] as string) || generateCorrelationId();
    
    try {
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
          logger.info(`MCP_TOOL_CALL_${metadata.name}`, { correlationId, ...args });
          return implementation(args, { correlationId });
        }
      );

      // 🩺 Standard Health Check Tool (Internal)
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

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);

      const url = `https://${event.requestContext.domainName}${event.rawPath}`;
      const request = new Request(url, {
        method: event.requestContext.http.method,
        headers: new Headers(event.headers as Record<string, string>),
        body: typeof event.body === "string" ? event.body : JSON.stringify(event.body ?? {}),
      });

      const response = await transport.handleRequest(request);

      return {
        statusCode: response.status,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          "x-correlation-id": correlationId
        },
        body: await response.text(),
      };
    } catch (error: unknown) {
      logger.error(`MCP_TOOL_ERROR_${metadata.name}`, error, { correlationId });
      return {
        statusCode: 500,
        headers: { "x-correlation-id": correlationId },
        body: JSON.stringify({ 
          error: `MCP Tool Error: ${metadata.name}`, 
          message: error instanceof Error ? error.message : "Unknown" 
        }),
      };
    }
  };
}
