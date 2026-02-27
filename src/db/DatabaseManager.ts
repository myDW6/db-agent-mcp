/**
 * 数据库连接管理器
 */

import type { DatabaseConfig, ConnectionInfo } from '../types/database.js';
import { BaseAdapter } from './adapters/BaseAdapter.js';
import { MySQLAdapter } from './adapters/MySQLAdapter.js';
import { PostgresAdapter } from './adapters/PostgresAdapter.js';
import { SQLiteAdapter } from './adapters/SQLiteAdapter.js';
import { DatabaseError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';

export class DatabaseManager {
  private adapters = new Map<string, BaseAdapter>();
  private configs = new Map<string, DatabaseConfig>();
  private currentConnectionId: string | null = null;

  /**
   * 注册数据库连接配置
   */
  registerConnection(config: DatabaseConfig): void {
    if (this.configs.has(config.id)) {
      throw new DatabaseError(
        `连接ID已存在: ${config.id}`,
        'CONNECTION_ALREADY_EXISTS'
      );
    }

    this.configs.set(config.id, config);
    logger.info('DatabaseManager', `注册连接配置: ${config.id} (${config.type})`);
  }

  /**
   * 注册多个连接配置
   */
  registerConnections(configs: DatabaseConfig[]): void {
    for (const config of configs) {
      this.registerConnection(config);
    }
  }

  /**
   * 获取连接适配器（懒加载）
   */
  async getAdapter(connectionId: string): Promise<BaseAdapter> {
    // 如果已存在适配器，直接返回
    if (this.adapters.has(connectionId)) {
      const adapter = this.adapters.get(connectionId)!;
      
      // 检查连接是否仍然有效
      if (await adapter.ping()) {
        return adapter;
      }
      
      // 连接已断开，尝试重新连接
      logger.warn('DatabaseManager', `连接 ${connectionId} 已断开，尝试重新连接`);
      await adapter.connect();
      return adapter;
    }

    // 创建新的适配器
    const config = this.configs.get(connectionId);
    if (!config) {
      throw new DatabaseError(
        `连接配置不存在: ${connectionId}`,
        'CONNECTION_NOT_FOUND'
      );
    }

    const adapter = this.createAdapter(config);
    await adapter.connect();
    this.adapters.set(connectionId, adapter);
    
    return adapter;
  }

  /**
   * 切换当前活动连接
   */
  async useConnection(connectionId: string): Promise<ConnectionInfo> {
    const adapter = await this.getAdapter(connectionId);
    this.currentConnectionId = connectionId;
    
    const config = adapter.getConfig();
    logger.info('DatabaseManager', `切换到连接: ${connectionId}`);
    
    return {
      id: connectionId,
      name: config.name,
      type: config.type,
      readonly: config.readonly ?? false,
      description: config.description,
    };
  }

  /**
   * 获取当前活动连接
   */
  getCurrentConnection(): ConnectionInfo | null {
    if (!this.currentConnectionId) {
      return null;
    }

    const config = this.configs.get(this.currentConnectionId);
    if (!config) {
      return null;
    }

    return {
      id: config.id,
      name: config.name,
      type: config.type,
      readonly: config.readonly ?? false,
      description: config.description,
    };
  }

  /**
   * 获取当前连接的适配器
   */
  async getCurrentAdapter(): Promise<BaseAdapter> {
    if (!this.currentConnectionId) {
      throw new DatabaseError(
        '未选择数据库连接，请先调用 use_connection',
        'CONNECTION_NOT_FOUND'
      );
    }

    return this.getAdapter(this.currentConnectionId);
  }

  /**
   * 列出所有可用的连接
   */
  listConnections(): ConnectionInfo[] {
    return Array.from(this.configs.values()).map(config => ({
      id: config.id,
      name: config.name,
      type: config.type,
      readonly: config.readonly ?? false,
      description: config.description,
    }));
  }

  /**
   * 关闭指定连接
   */
  async closeConnection(connectionId: string): Promise<void> {
    const adapter = this.adapters.get(connectionId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(connectionId);
      
      if (this.currentConnectionId === connectionId) {
        this.currentConnectionId = null;
      }
      
      logger.info('DatabaseManager', `关闭连接: ${connectionId}`);
    }
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    for (const [id, adapter] of this.adapters) {
      await adapter.disconnect();
      logger.info('DatabaseManager', `关闭连接: ${id}`);
    }
    
    this.adapters.clear();
    this.currentConnectionId = null;
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats(connectionId: string): Record<string, unknown> | null {
    const adapter = this.adapters.get(connectionId);
    if (!adapter) {
      return null;
    }

    return {
      connected: adapter.isConnected(),
      readonly: adapter.isReadOnly(),
      ...adapter.getStats(),
    };
  }

  /**
   * 创建对应类型的适配器
   */
  private createAdapter(config: DatabaseConfig): BaseAdapter {
    switch (config.type) {
      case 'mysql':
        return new MySQLAdapter(config);
      case 'postgresql':
        return new PostgresAdapter(config);
      case 'sqlite':
        return new SQLiteAdapter(config);
      default:
        throw new DatabaseError(
          `不支持的数据库类型: ${config.type}`,
          'UNSUPPORTED_DATABASE_TYPE'
        );
    }
  }
}
