/**
 * Centralized Structural Logger
 * 
 * Standardizes log format across all Lambda functions for better CloudWatch Log Insights.
 * Supports Correlation IDs for distributed tracing across MCP services.
 */

export interface LogContext extends Record<string, unknown> {
  correlationId?: string;
  productId?: string;
  toolName?: string;
}

export const logger = {
  info: (event: string, context?: LogContext) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      event,
      ...context
    }));
  },

  error: (event: string, error: unknown, context?: LogContext) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      event,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : (typeof error === 'object' && error !== null) ? error : String(error),
      ...context
    }));
  },

  warn: (event: string, error?: unknown, context?: LogContext) => {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "WARN",
      event,
      ...(error ? { 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : (typeof error === 'object' && error !== null) ? error : String(error)
      } : {}),
      ...context
    }));
  },
};
