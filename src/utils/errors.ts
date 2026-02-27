/**
 * 错误分类与处理
 */

export type ErrorCode = 
  | 'CONNECTION_FAILED'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_ALREADY_EXISTS'
  | 'QUERY_TIMEOUT'
  | 'QUERY_VALIDATION_ERROR'
  | 'QUERY_FORBIDDEN'
  | 'TABLE_NOT_FOUND'
  | 'COLUMN_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFIG_ERROR'
  | 'UNSUPPORTED_DATABASE_TYPE'
  | 'INTERNAL_ERROR';

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export function formatErrorForMcp(error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  if (error instanceof DatabaseError) {
    return {
      content: [{ type: 'text', text: `数据库错误 [${error.code}]: ${error.message}` }],
      isError: true
    };
  }
  
  if (error instanceof Error) {
    return {
      content: [{ type: 'text', text: `错误: ${error.message}` }],
      isError: true
    };
  }
  
  return {
    content: [{ type: 'text', text: `未知错误: ${String(error)}` }],
    isError: true
  };
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}
