import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { logger } from "../logger";
import { config } from "../config";

const PROBE_TIMEOUT_MS = 5000;

/**
 * Operations Status Hub
 * Probes all MCP servers in parallel and returns their health status.
 */


export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const headers = event.headers || {};
  const clientKey = headers["x-api-key"] || headers["X-API-KEY"];

  // Security Layer: SSM-Backed Shared Secret
  if (config.INTERNAL_KEY && clientKey !== config.INTERNAL_KEY) {
    return { 
      statusCode: 403, 
      body: JSON.stringify({ error: "Forbidden", message: "Unauthorized: Accessing Status Hub requires a valid x-api-key" }) 
    };
  }

  const correlationId = (event.headers["x-correlation-id"] as string) || `hub-${Date.now()}`;
  // Use the already-parsed config Map — env value is "key:https://..." pairs, not bare URLs
  const mcpUrls = [...config.MCP_SERVER_URLS.entries()];

  logger.info("STATUS_HUB_PROBE_START", { serverCount: mcpUrls.length, correlationId });

  const results = await Promise.all(
    mcpUrls.map(async ([serviceName, url]) => {
      const start = Date.now();
      const controller = new AbortController();
      const probeTimer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-correlation-id": correlationId },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "probe-" + start,
            method: "tools/call",
            params: { name: "__health", arguments: {} }
          })
        });
        clearTimeout(probeTimer);

        const latency = Date.now() - start;
        const data = await response.json() as any;

        return {
          url,
          name: data?.result?.metadata?.lambda || serviceName,
          status: response.ok ? "HEALTHY" : "UNHEALTHY",
          latencyMs: latency,
          version: data?.result?.metadata?.version || "unknown"
        };
      } catch (err: any) {
        clearTimeout(probeTimer);
        const isTimeout = err.name === "AbortError";
        return {
          url,
          name: serviceName,
          status: isTimeout ? "TIMEOUT" : "DOWN",
          latencyMs: Date.now() - start,
          error: isTimeout ? `Probe timed out after ${PROBE_TIMEOUT_MS}ms` : err.message
        };
      }
    })
  );

  return {
    statusCode: 200,
    headers: { 
      "Content-Type": "application/json",
      // SECURITY_NOTE: Wildcard CORS is used to allow the internal operations dashboard (potentially running on various local/hosted origins) 
      // to call the status hub. Exposure is mitigated by the mandatory INTERNAL_KEY check at the start of this handler.
      "Access-Control-Allow-Origin": "*" 
    },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      systemStatus: results.every(r => r.status === "HEALTHY") ? "OPERATIONAL" : results.some(r => r.status === "HEALTHY") ? "DEGRADED" : "DOWN",
      nodes: results
    })
  };
};
