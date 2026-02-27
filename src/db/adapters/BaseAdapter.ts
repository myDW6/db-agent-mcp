/**
 * 数据库适配器抽象基类
 */

import type { DatabaseConfig, TableSchema, ColumnSchema, IndexSchema, QueryResult, QueryOptions } from '../../types/database.js';
import { DatabaseError } from '../../utils/errors.js';

export interface AdapterStats {
  queryCount: number;
  totalExecutionTime: number;
  lastQueryTime?: Date;
}

export abstract class BaseAdapter {
  protected config: DatabaseConfig;
  protected connected = false;
  protected stats: AdapterStats = {
    queryCount: 0,
    totalExecutionTime: 0,
  };

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * 建立数据库连接
   */
  abstract connect(): Promise<void>;

  /**
   * 断开数据库连接
   */
  abstract disconnect(): Promise<void>;

  /**
   * 检查连接是否可用
   */
  abstract ping(): Promise<boolean>;

  /**
   * 获取所有表信息
   */
  abstract getTables(schema?: string, includeSystemTables?: boolean): Promise<TableSchema[]>;

  /**
   * 获取指定表的详细结构
   */
  abstract getTableSchema(tableName: string, schema?: string): Promise<TableSchema>;

  /**
   * 执行SQL查询
   */
  abstract query<T = Record<string, unknown>>(sql: string, options?: QueryOptions): Promise<QueryResult<T>>;

  /**
   * 分析查询执行计划
   */
  abstract explainQuery(sql: string): Promise<Record<string, unknown>[]>;

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取适配器统计信息
   */
  getStats(): AdapterStats {
    return { ...this.stats };
  }

  /**
   * 获取配置
   */
  getConfig(): DatabaseConfig {
    return this.config;
  }

  /**
   * 是否为只读连接
   */
  isReadOnly(): boolean {
    return this.config.readonly ?? false;
  }

  /**
   * 更新统计信息
   */
  protected updateStats(executionTime: number): void {
    this.stats.queryCount++;
    this.stats.totalExecutionTime += executionTime;
    this.stats.lastQueryTime = new Date();
  }

  /**
   * 处理查询错误
   */
  protected handleQueryError(error: unknown, sql: string): never {
    if (error instanceof DatabaseError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    
    // 根据错误消息分类
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      throw new DatabaseError(
        `查询超时: ${message}`,
        'QUERY_TIMEOUT',
        error
      );
    }
    
    if (message.includes('doesn\'t exist') || message.includes('not found')) {
      throw new DatabaseError(
        `表不存在: ${message}`,
        'TABLE_NOT_FOUND',
        error
      );
    }

    throw new DatabaseError(
      `查询执行失败: ${message}`,
      'INTERNAL_ERROR',
      error
    );
  }
}
