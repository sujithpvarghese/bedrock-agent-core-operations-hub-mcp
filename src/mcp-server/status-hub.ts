import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { logger } from "../logger";

/**
 * Operations Status Hub
 * Probes all MCP servers in parallel and returns their health status.
 */


export const handler = async (_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const urlsText = process.env.MCP_SERVER_URLS || "";
  const mcpUrls = urlsText.split(",").map(u => u.trim()).filter(Boolean);

  logger.info("STATUS_HUB_PROBE_START", { serverCount: mcpUrls.length });

  const results = await Promise.all(
    mcpUrls.map(async (url) => {
      const start = Date.now();
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "probe-" + start,
            method: "tools/call",
            params: { name: "__health", arguments: {} }
          })
        });

        const latency = Date.now() - start;
        const data = await response.json() as any;

        return {
          url,
          name: data?.result?.metadata?.lambda || new URL(url).pathname.split("/").pop(),
          status: response.ok ? "HEALTHY" : "UNHEALTHY",
          latencyMs: latency,
          version: data?.result?.metadata?.version || "unknown"
        };
      } catch (err: any) {
        return {
          url,
          name: new URL(url).hostname,
          status: "DOWN",
          latencyMs: Date.now() - start,
          error: err.message
        };
      }
    })
  );

  return {
    statusCode: 200,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" // Allow dashboard to call via JS
    },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      systemStatus: results.every(r => r.status === "HEALTHY") ? "OPERATIONAL" : "DEGRADED",
      nodes: results
    })
  };
};
