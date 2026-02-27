/**
 * MCP 服务器主类
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';

import type { DatabaseManager } from '../db/DatabaseManager.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
import {
  createListConnectionsTool,
  createUseConnectionTool,
  createGetCurrentConnectionTool,
} from './tools/ConnectionTools.js';
import {
  createListTablesTool,
  createDescribeTableTool,
  createShowTableStatsTool,
} from './tools/MetadataTools.js';
import {
  createExecuteQueryTool,
  createExplainQueryTool,
  createGenerateSqlTool,
} from './tools/QueryTools.js';

import * as logger from '../utils/logger.js';

export class McpServer {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private transport: StdioServerTransport;

  constructor(private dbManager: DatabaseManager) {
    this.toolRegistry = new ToolRegistry();
    this.registerAllTools();

    this.server = new Server(
      {
        name: 'db-agent-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  /**
   * 注册所有工具
   */
  private registerAllTools(): void {
    // 连接管理工具
    this.toolRegistry.register(createListConnectionsTool(this.dbManager));
    this.toolRegistry.register(createUseConnectionTool(this.dbManager));
    this.toolRegistry.register(createGetCurrentConnectionTool(this.dbManager));

    // 元数据工具
    this.toolRegistry.register(createListTablesTool(this.dbManager));
    this.toolRegistry.register(createDescribeTableTool(this.dbManager));
    this.toolRegistry.register(createShowTableStatsTool(this.dbManager));

    // 查询工具
    this.toolRegistry.register(createExecuteQueryTool(this.dbManager));
    this.toolRegistry.register(createExplainQueryTool(this.dbManager));
    this.toolRegistry.register(createGenerateSqlTool(this.dbManager));

    logger.info('McpServer', `已注册 ${this.toolRegistry.listToolNames().length} 个工具`);
  }

  /**
   * 设置请求处理器
   */
  private setupHandlers(): void {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
      return {
        tools: this.toolRegistry.getAllToolDefinitions(),
      };
    });

    // 调用工具
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      
      logger.info('McpServer', `调用工具: ${name}`);

      const tool = this.toolRegistry.getTool(name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `错误: 工具 '${name}' 不存在` }],
          isError: true,
        };
      }

      try {
        const result = await tool.handler(args);
        return result as { content: Array<{ type: string; text: string }>; isError?: boolean };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('McpServer', `工具 ${name} 执行失败`, err);
        return {
          content: [{ type: 'text', text: `执行错误: ${message}` }],
          isError: true,
        };
      }
    });
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    logger.info('McpServer', '正在启动 MCP 服务器...');
    
    await this.server.connect(this.transport);
    
    logger.info('McpServer', 'MCP 服务器已启动，等待客户端连接');
    
    // 保持进程运行
    process.stdin.on('close', () => {
      logger.info('McpServer', 'stdin 关闭，服务器即将退出');
      this.stop();
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    logger.info('McpServer', '正在停止 MCP 服务器...');
    await this.dbManager.closeAll();
    await this.server.close();
    logger.info('McpServer', 'MCP 服务器已停止');
  }
}
