/**
 * 查询执行相关的 MCP Tools
 */

import type { DatabaseManager } from '../../db/DatabaseManager.js';
import { QueryValidator } from '../../db/query/QueryValidator.js';
import type { 
  ExecuteQueryArgs,
  ExplainQueryArgs,
} from '../../types/mcp.js';
import { formatErrorForMcp } from '../../utils/errors.js';

/**
 * execute_query - 执行SQL查询
 */
export function createExecuteQueryTool(dbManager: DatabaseManager) {
  return {
    name: 'execute_query',
    description: '执行SQL查询语句并返回结果。支持SELECT查询，自动限制返回行数（默认100，最大1000）。在只读连接上会拦截写操作。',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL查询语句，支持多行',
        },
        limit: {
          type: 'number',
          description: '最大返回行数，默认100，最大1000',
        },
        timeout: {
          type: 'number',
          description: '查询超时时间(ms)，覆盖默认配置',
        },
      },
      required: ['sql'],
    },
    handler: async (args: ExecuteQueryArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const adapter = await dbManager.getCurrentAdapter();
        const config = adapter.getConfig();
        
        // 安全检查
        const validator = new QueryValidator(config.readonly);
        const validation = validator.validate(args.sql);
        
        if (!validation.valid) {
          return formatErrorForMcp(new Error(validation.errors.join('; ')));
        }

        // 执行查询
        const result = await adapter.query(args.sql, {
          limit: args.limit,
          timeout: args.timeout,
        });

        // 格式化输出
        const validatorInstance = new QueryValidator();
        const formattedData = validatorInstance.formatResults(result.data, result.meta.columns);
        
        const warnings = validation.warnings.length > 0 
          ? '\n\n**警告:**\n' + validation.warnings.map(w => `- ${w}`).join('\n')
          : '';

        const limitInfo = result.data.length >= (args.limit ?? 100) 
          ? '\n\n**提示**: 结果已达到行数限制，如需查看更多数据请调整 limit 参数。' 
          : '';

        const text = `**查询结果** (${result.meta.rowCount} 行, ${result.meta.executionTime}ms)${warnings}\n\n${formattedData}${limitInfo}`;

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
 * explain_query - 分析查询执行计划
 */
export function createExplainQueryTool(dbManager: DatabaseManager) {
  return {
    name: 'explain_query',
    description: '分析SQL查询的执行计划，帮助优化查询性能。会显示索引使用情况、扫描类型等信息。',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: '要分析的SQL语句',
        },
      },
      required: ['sql'],
    },
    handler: async (args: ExplainQueryArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const adapter = await dbManager.getCurrentAdapter();
        const plan = await adapter.explainQuery(args.sql);

        if (plan.length === 0) {
          return {
            content: [{ type: 'text', text: '无法获取执行计划。' }],
          };
        }

        // 分析潜在问题
        const warnings: string[] = [];
        
        for (const row of plan) {
          const rowStr = JSON.stringify(row).toLowerCase();
          
          // MySQL 全表扫描检测
          if (rowStr.includes('type') && rowStr.includes('all')) {
            warnings.push('检测到全表扫描 (type=ALL)，建议添加合适的索引');
          }
          
          // MySQL 使用filesort
          if (rowStr.includes('using filesort')) {
            warnings.push('检测到文件排序 (Using filesort)，建议优化ORDER BY');
          }
          
          // MySQL 使用临时表
          if (rowStr.includes('using temporary')) {
            warnings.push('检测到临时表使用 (Using temporary)，建议优化GROUP BY');
          }

          // PostgreSQL 顺序扫描
          if (rowStr.includes('seq scan')) {
            warnings.push('检测到顺序扫描 (Seq Scan)，建议添加合适的索引');
          }
        }

        // 格式化输出
        const planText = plan.map((row, i) => {
          const entries = Object.entries(row)
            .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
            .join('\n');
          return `步骤 ${i + 1}:\n${entries}`;
        }).join('\n\n');

        const warningText = warnings.length > 0 
          ? '\n\n**性能警告:**\n' + [...new Set(warnings)].map(w => `- ${w}`).join('\n')
          : '\n\n未发现明显的性能问题';

        return {
          content: [{ type: 'text', text: `**执行计划分析**\n\n${planText}${warningText}` }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}

/**
 * generate_sql - 基于自然语言生成SQL建议
 */
export function createGenerateSqlTool(dbManager: DatabaseManager) {
  return {
    name: 'generate_sql',
    description: '根据自然语言描述生成SQL建议。这是一个辅助功能，生成的SQL需要用户确认后手动执行。',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: '自然语言描述，例如"查找最近7天注册的用户"',
        },
        tableHints: {
          type: 'array',
          items: { type: 'string' },
          description: '可能涉及的表名提示',
        },
      },
      required: ['intent'],
    },
    handler: async (args: { intent: string; tableHints?: string[] }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      try {
        const adapter = await dbManager.getCurrentAdapter();
        
        // 获取表结构信息用于智能提示
        let availableTables: string[] = [];
        try {
          const tables = await adapter.getTables();
          availableTables = tables.map(t => t.name);
        } catch {
          // 忽略错误，继续处理
        }

        // 简单的模式匹配生成SQL建议
        const intent = args.intent.toLowerCase();
        let suggestedSql = '';
        let explanation = '';

        // 常见模式匹配
        if (intent.includes('所有') || intent.includes('全部') || intent.includes('list all')) {
          const tableName = args.tableHints?.[0] || 'table_name';
          suggestedSql = `SELECT * FROM ${tableName} LIMIT 100;`;
          explanation = '查询表中所有列的前100条记录';
        } else if (intent.includes('计数') || intent.includes('多少') || intent.includes('count')) {
          const tableName = args.tableHints?.[0] || 'table_name';
          suggestedSql = `SELECT COUNT(*) as total FROM ${tableName};`;
          explanation = '统计表中的总记录数';
        } else if (intent.includes('最近') || intent.includes('recent')) {
          const tableName = args.tableHints?.[0] || 'table_name';
          const daysMatch = intent.match(/(\d+)\s*天/);
          const days = daysMatch ? daysMatch[1] : '7';
          const dateColumn = 'created_at';
          suggestedSql = `SELECT * FROM ${tableName} \nWHERE ${dateColumn} >= DATE_SUB(NOW(), INTERVAL ${days} DAY) \nORDER BY ${dateColumn} DESC \nLIMIT 100;`;
          explanation = `查询最近${days}天内创建的记录，按时间倒序排列`;
        } else if (intent.includes('分组') || intent.includes('统计') || intent.includes('group')) {
          const tableName = args.tableHints?.[0] || 'table_name';
          const groupColumn = 'category';
          suggestedSql = `SELECT ${groupColumn}, COUNT(*) as count \nFROM ${tableName} \nGROUP BY ${groupColumn} \nORDER BY count DESC;`;
          explanation = '按类别分组统计数量';
        } else if (intent.includes('最大') || intent.includes('最小') || intent.includes('max') || intent.includes('min')) {
          const tableName = args.tableHints?.[0] || 'table_name';
          const valueColumn = 'value';
          suggestedSql = `SELECT MAX(${valueColumn}) as max_value, MIN(${valueColumn}) as min_value \nFROM ${tableName};`;
          explanation = '查询最大值和最小值';
        } else if (intent.includes('平均') || intent.includes('avg') || intent.includes('average')) {
          const tableName = args.tableHints?.[0] || 'table_name';
          const valueColumn = 'value';
          suggestedSql = `SELECT AVG(${valueColumn}) as average_value \nFROM ${tableName};`;
          explanation = '计算平均值';
        } else {
          const tableName = args.tableHints?.[0] || 'table_name';
          suggestedSql = `SELECT * FROM ${tableName} WHERE ...;`;
          explanation = '请根据实际需求补充WHERE条件';
        }

        // 添加表名提示
        let tableHint = '';
        if (availableTables.length > 0 && !args.tableHints) {
          tableHint = `\n\n**可用表**: ${availableTables.slice(0, 10).join(', ')}${availableTables.length > 10 ? '...' : ''}`;
        }

        const text = `**SQL建议生成**\n\n**意图**: ${args.intent}\n\n**建议SQL**:\n\`\`\`sql\n${suggestedSql}\n\`\`\`\n\n**说明**: ${explanation}${tableHint}\n\n**注意**: 这是一个自动生成的建议SQL，请根据实际表结构修改后再执行。使用 describe_table 工具查看表结构。`;

        return {
          content: [{ type: 'text', text }],
        };
      } catch (err) {
        return formatErrorForMcp(err);
      }
    },
  };
}
