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
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        event,
        ...context
      }));
    } catch {
      // Fallback if context contains non-serializable objects (e.g. circular)
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        event,
        error: "[Serialization Failure: Some context fields omitted]"
      }));
    }
  },

  error: (event: string, error: unknown, context?: LogContext) => {
    try {
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
    } catch {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        event,
        error: "Serialization Failure",
        message: String(error)
      }));
    }
  },

  warn: (event: string, error?: unknown, context?: LogContext) => {
    try {
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
    } catch {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "WARN",
        event,
        error: "Serialization Failure"
      }));
    }
  },
};
