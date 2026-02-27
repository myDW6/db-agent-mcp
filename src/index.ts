#!/usr/bin/env node
/**
 * DB Agent MCP Server - 入口文件
 * 
 * 数据库智能代理，支持通过 MCP 协议访问 MySQL/PostgreSQL/SQLite
 */

import { loadConfig, getDefaultConfigPath } from './config/ConfigLoader.js';
import { DatabaseManager } from './db/DatabaseManager.js';
import { McpServer } from './mcp/Server.js';
import * as logger from './utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
  try {
    // 设置日志级别
    if (process.env.LOG_LEVEL === 'debug') {
      logger.setLogLevel(logger.LogLevel.DEBUG);
    }

    logger.info('Main', '========================================');
    logger.info('Main', 'DB Agent MCP Server 启动中...');
    logger.info('Main', '========================================');

    // 加载配置
    let config;
    const configPath = getDefaultConfigPath();
    
    if (fs.existsSync(configPath)) {
      logger.info('Main', `从 ${configPath} 加载配置`);
      config = loadConfig();
    } else {
      // 使用默认配置
      logger.warn('Main', `配置文件不存在: ${configPath}`);
      logger.info('Main', '使用空配置启动，请在配置文件中添加数据库连接');
      config = { connections: [] };
    }

    // 初始化数据库管理器
    const dbManager = new DatabaseManager();
    
    if (config.connections.length > 0) {
      dbManager.registerConnections(config.connections);
      logger.info('Main', `已注册 ${config.connections.length} 个数据库连接`);
      
      // 列出所有连接
      const connections = dbManager.listConnections();
      for (const conn of connections) {
        const readonlyBadge = conn.readonly ? '[只读]' : '[读写]';
        logger.info('Main', `  - ${conn.name} (${conn.id}) ${readonlyBadge}`);
      }
    } else {
      logger.warn('Main', '未配置任何数据库连接');
    }

    // 启动 MCP 服务器
    const server = new McpServer(dbManager);
    await server.start();

    // 优雅关闭
    process.on('SIGINT', async () => {
      logger.info('Main', '收到 SIGINT 信号，正在关闭...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Main', '收到 SIGTERM 信号，正在关闭...');
      await server.stop();
      process.exit(0);
    });

  } catch (err) {
    logger.error('Main', '启动失败', err);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  logger.error('Main', '未捕获的异常', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Main', '未处理的 Promise 拒绝', reason);
  process.exit(1);
});

main();
