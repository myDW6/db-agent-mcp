/**
 * 元数据查询相关的 MCP Tools
 */

import type { DatabaseManager } from '../../db/DatabaseManager.js';
import type { 
  ListTablesArgs, 
  ListTablesResult,
  DescribeTableArgs,
  DescribeTableResult
} from '../../types/mcp.js';
import { formatErrorForMcp } from '../../utils/errors.js';

/**
 * list_tables - 列出当前连接的所有表
 */
export function createListTablesTool(dbManager: DatabaseManager) {
  return {
    name: 'list_tables',
    description: '列出当前数据库连接中的所有表，包括表名、行数估计和注释',
    inputSchema: {
      type: 'object',
      properties: {
        schema: {
          type: 'string',
          description: 'Schema名称（仅PostgreSQL有效，默认为public）',
        },
        includeSystemTables: {
          type: 'boolean',
          description: '是否包含系统表，默认为false',
        },
      },
    },
    handler: async (args: ListTablesArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const adapter = await dbManager.getCurrentAdapter();
        const tables = await adapter.getTables(args.schema, args.includeSystemTables);

        if (tables.length === 0) {
          const schemaInfo = args.schema ? ` (schema: ${args.schema})` : '';
          return {
            content: [{ type: 'text', text: `当前数据库${schemaInfo}中没有表。` }],
          };
        }

        // 格式化输出
        const lines = tables.map(t => {
          const rowCount = t.rowCount !== undefined ? `~${t.rowCount.toLocaleString()} 行` : '行数未知';
          const comment = t.comment ? ` - ${t.comment}` : '';
          return `- **${t.name}** (${rowCount})${comment}`;
        });

        const schemaInfo = args.schema ? ` (Schema: ${args.schema})` : '';
        const text = `数据库表列表${schemaInfo} - 共 ${tables.length} 个表:\n\n${lines.join('\n')}`;

        return {
          content: [{ type: 'text', text }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}

/**
 * describe_table - 获取表详细结构
 */
export function createDescribeTableTool(dbManager: DatabaseManager) {
  return {
    name: 'describe_table',
    description: '获取指定表的详细结构，包括列定义、索引、约束等信息',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: '表名',
        },
        schema: {
          type: 'string',
          description: 'Schema名称（仅PostgreSQL）',
        },
      },
      required: ['tableName'],
    },
    handler: async (args: DescribeTableArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const adapter = await dbManager.getCurrentAdapter();
        const tableSchema = await adapter.getTableSchema(args.tableName, args.schema);

        // 格式化列信息
        const columnsText = tableSchema.columns.map(col => {
          const parts: string[] = [col.name, col.type];
          if (col.maxLength) parts.push(`(${col.maxLength})`);
          if (col.precision !== undefined && col.scale !== undefined) {
            parts.push(`(${col.precision},${col.scale})`);
          }
          if (!col.nullable) parts.push('NOT NULL');
          if (col.isPrimary) parts.push('PRIMARY KEY');
          if (col.isAutoIncrement) parts.push('AUTO_INCREMENT');
          if (col.defaultValue !== undefined && col.defaultValue !== null) {
            parts.push(`DEFAULT ${col.defaultValue}`);
          }
          const comment = col.comment ? ` -- ${col.comment}` : '';
          return `  - ${parts.join(' ')}${comment}`;
        }).join('\n');

        // 格式化索引信息
        const indexesText = tableSchema.indexes.length > 0
          ? '\n\n**索引:**\n' + tableSchema.indexes.map(idx => {
              const unique = idx.unique ? 'UNIQUE ' : '';
              const type = idx.type ? `${idx.type} ` : '';
              return `  - ${unique}${type}${idx.name} (${idx.columns.join(', ')})`;
            }).join('\n')
          : '\n\n**索引:** 无';

        const commentHeader = tableSchema.comment ? `\n\n*${tableSchema.comment}*` : '';
        const engineInfo = tableSchema.engine ? `\n- 存储引擎: ${tableSchema.engine}` : '';
        const rowCountInfo = tableSchema.rowCount !== undefined ? `\n- 估计行数: ~${tableSchema.rowCount.toLocaleString()}` : '';

        const text = `**表结构: ${tableSchema.name}**${commentHeader}${engineInfo}${rowCountInfo}\n\n**列定义:**\n${columnsText}${indexesText}`;

        return {
          content: [{ type: 'text', text }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}

/**
 * show_table_stats - 显示表统计信息
 */
export function createShowTableStatsTool(dbManager: DatabaseManager) {
  return {
    name: 'show_table_stats',
    description: '显示指定表的统计信息，包括行数、索引大小等（如果数据库支持）',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: '表名',
        },
        schema: {
          type: 'string',
          description: 'Schema名称（仅PostgreSQL）',
        },
      },
      required: ['tableName'],
    },
    handler: async (args: { tableName: string; schema?: string }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const adapter = await dbManager.getCurrentAdapter();
        const tableSchema = await adapter.getTableSchema(args.tableName, args.schema);

        const stats: string[] = [`**表统计信息: ${tableSchema.name}**\n`];
        
        if (tableSchema.rowCount !== undefined) {
          stats.push(`- 估计行数: ${tableSchema.rowCount.toLocaleString()}`);
        }
        
        stats.push(`- 列数: ${tableSchema.columns.length}`);
        stats.push(`- 索引数: ${tableSchema.indexes.length}`);
        
        // 统计主键、唯一索引
        const pkCount = tableSchema.columns.filter(c => c.isPrimary).length;
        const uniqueIndexCount = tableSchema.indexes.filter(i => i.unique).length;
        
        if (pkCount > 0) {
          stats.push(`- 主键列数: ${pkCount}`);
        }
        if (uniqueIndexCount > 0) {
          stats.push(`- 唯一索引数: ${uniqueIndexCount}`);
        }

        // 可空列统计
        const nullableCount = tableSchema.columns.filter(c => c.nullable).length;
        if (nullableCount > 0) {
          stats.push(`- 可空列数: ${nullableCount}`);
        }

        return {
          content: [{ type: 'text', text: stats.join('\n') }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}
