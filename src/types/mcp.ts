/**
 * MCP 协议相关类型定义
 */

import type { DatabaseConfig } from './database.js';

export interface ListConnectionsResult {
  connections: {
    id: string;
    name: string;
    type: string;
    readonly: boolean;
    description?: string;
  }[];
}

export interface UseConnectionArgs {
  connectionId: string;
}

export interface ListTablesArgs {
  /** Schema名称（仅PostgreSQL） */
  schema?: string;
  /** 是否包含系统表，默认false */
  includeSystemTables?: boolean;
}

export interface ListTablesResult {
  tables: {
    name: string;
    rowCount?: number;
    engine?: string;
    comment?: string;
    schema?: string;
  }[];
  total: number;
}

export interface DescribeTableArgs {
  tableName: string;
  schema?: string;
}

export interface DescribeTableResult {
  name: string;
  comment?: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue?: string;
    isPrimary: boolean;
    isAutoIncrement?: boolean;
    maxLength?: number;
    comment?: string;
  }[];
  indexes: {
    name: string;
    columns: string[];
    unique: boolean;
    type?: string;
  }[];
}

export interface ExecuteQueryArgs {
  /** SQL语句，支持多行 */
  sql: string;
  /** 最大返回行数，默认100，最大1000 */
  limit?: number;
  /** 超时时间(ms)，覆盖默认配置 */
  timeout?: number;
}

export interface ExecuteQueryResult {
  success: boolean;
  data: Record<string, unknown>[];
  meta: {
    rowCount: number;
    executionTime: number;
    columns: string[];
  };
}

export interface ExplainQueryArgs {
  sql: string;
}

export interface GenerateSqlArgs {
  /** 自然语言描述，如'查找最近7天注册的用户' */
  intent: string;
  /** 可能涉及的表名 */
  tableHints?: string[];
}

export interface GenerateSqlResult {
  suggestedSql: string;
  explanation: string;
}

export interface McpTool<T = unknown, R = unknown> {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: T) => Promise<R>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
