/**
 * 连接管理相关的 MCP Tools
 */

import type { DatabaseManager } from '../../db/DatabaseManager.js';
import type { ConnectionInfo } from '../../types/database.js';
import type { 
  ListConnectionsResult, 
  UseConnectionArgs
} from '../../types/mcp.js';
import { formatErrorForMcp } from '../../utils/errors.js';

/**
 * list_connections - 列出所有可用的数据库连接
 */
export function createListConnectionsTool(dbManager: DatabaseManager) {
  return {
    name: 'list_connections',
    description: '列出所有配置的数据库连接，包括连接ID、名称、类型和只读状态',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const connections = dbManager.listConnections();
        
        const result: ListConnectionsResult = {
          connections: connections.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            readonly: c.readonly,
            description: c.description,
          })),
        };

        if (connections.length === 0) {
          return {
            content: [{ type: 'text', text: '当前没有配置任何数据库连接。请检查配置文件。' }],
          };
        }

        const text = connections.map(c => {
          const readonlyBadge = c.readonly ? '[只读]' : '[读写]';
          return `- **${c.name}** (${c.id})\n  - 类型: ${c.type}\n  - 状态: ${readonlyBadge}${c.description ? `\n  - 描述: ${c.description}` : ''}`;
        }).join('\n\n');

        return {
          content: [{ type: 'text', text: `可用数据库连接 (${connections.length}个):\n\n${text}` }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}

/**
 * use_connection - 激活指定连接
 */
export function createUseConnectionTool(dbManager: DatabaseManager) {
  return {
    name: 'use_connection',
    description: '切换到指定的数据库连接，后续查询将在该连接上执行',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: '连接ID，可通过 list_connections 获取',
        },
      },
      required: ['connectionId'],
    },
    handler: async (args: UseConnectionArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const connection = await dbManager.useConnection(args.connectionId);
        
        const readonlyWarning = connection.readonly 
          ? '\n\n⚠️ **注意**: 此连接处于只读模式，无法执行写入操作。' 
          : '';

        return {
          content: [{ 
            type: 'text', 
            text: `✅ 已切换到连接: **${connection.name}** (${connection.type})${readonlyWarning}` 
          }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}

/**
 * get_current_connection - 获取当前活动连接
 */
export function createGetCurrentConnectionTool(dbManager: DatabaseManager) {
  return {
    name: 'get_current_connection',
    description: '获取当前正在使用的数据库连接信息',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const connection = dbManager.getCurrentConnection();
        
        if (!connection) {
          return {
            content: [{ 
              type: 'text', 
              text: '当前未选择任何数据库连接。请先使用 use_connection 选择一个连接。' 
            }],
          };
        }

        const readonlyBadge = connection.readonly ? '[只读]' : '[读写]';
        const text = `当前连接: **${connection.name}** (${connection.id})\n- 类型: ${connection.type}\n- 模式: ${readonlyBadge}${connection.description ? `\n- 描述: ${connection.description}` : ''}`;

        return {
          content: [{ type: 'text', text }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}
