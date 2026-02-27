/**
 * SQL 查询验证器 - 安全检查
 */

import { DatabaseError, type ErrorCode } from '../../utils/errors.js';

// 禁止的操作（只读模式下）
const FORBIDDEN_PATTERNS = [
  { pattern: /\bINSERT\b/i, name: 'INSERT' },
  { pattern: /\bUPDATE\b/i, name: 'UPDATE' },
  { pattern: /\bDELETE\b/i, name: 'DELETE' },
  { pattern: /\bDROP\b/i, name: 'DROP' },
  { pattern: /\bTRUNCATE\b/i, name: 'TRUNCATE' },
  { pattern: /\bALTER\b/i, name: 'ALTER' },
  { pattern: /\bCREATE\b/i, name: 'CREATE' },
  { pattern: /\bGRANT\b/i, name: 'GRANT' },
  { pattern: /\bREVOKE\b/i, name: 'REVOKE' },
  { pattern: /\bREPLACE\b/i, name: 'REPLACE' },
  { pattern: /\bMERGE\b/i, name: 'MERGE' },
];

// 特别危险的命令（即使非只读也警告）
const DANGEROUS_PATTERNS = [
  {
    pattern: /DELETE\s+FROM\s+\w+/i,
    check: (sql: string) => !/WHERE/i.test(sql),
    message: 'DELETE语句必须包含WHERE条件',
    code: 'QUERY_FORBIDDEN' as ErrorCode,
  },
  {
    pattern: /UPDATE\s+\w+/i,
    check: (sql: string) => !/WHERE/i.test(sql),
    message: 'UPDATE语句必须包含WHERE条件',
    code: 'QUERY_FORBIDDEN' as ErrorCode,
  },
  {
    pattern: /DROP\s+DATABASE/i,
    check: () => true,
    message: '禁止执行 DROP DATABASE 命令',
    code: 'QUERY_FORBIDDEN' as ErrorCode,
  },
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class QueryValidator {
  private readonly readonly: boolean;

  constructor(readonly: boolean = false) {
    this.readonly = readonly;
  }

  /**
   * 验证 SQL 语句是否允许执行
   */
  validate(sql: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查只读模式下的禁止操作
    if (this.readonly) {
      for (const { pattern, name } of FORBIDDEN_PATTERNS) {
        if (pattern.test(sql)) {
          errors.push(`只读模式下禁止执行 ${name} 操作`);
        }
      }
    }

    // 检查危险命令
    for (const { pattern, check, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(sql) && check(sql)) {
        errors.push(message);
      }
    }

    // 检查多语句（可能被用于SQL注入）
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    if (statements.length > 1) {
      warnings.push('检测到多个SQL语句，请确保这是预期行为');
    }

    // 检查可能的SQL注入模式
    const injectionPatterns = [
      { pattern: /;\s*--/, desc: '注释符号' },
      { pattern: /UNION\s+SELECT/i, desc: 'UNION注入' },
    ];

    for (const { pattern, desc } of injectionPatterns) {
      if (pattern.test(sql)) {
        warnings.push(`检测到可能的SQL注入模式: ${desc}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证并抛出异常（如果需要）
   */
  validateOrThrow(sql: string): void {
    const result = this.validate(sql);
    
    if (!result.valid) {
      throw new DatabaseError(
        `SQL验证失败: ${result.errors.join(', ')}`,
        'QUERY_VALIDATION_ERROR'
      );
    }
  }

  /**
   * 添加 LIMIT 子句（如果未指定）
   */
  addLimitIfNeeded(sql: string, limit: number): string {
    // 检查是否已有 LIMIT
    if (/\bLIMIT\s+\d+/i.test(sql)) {
      return sql;
    }

    // 检查是否为 SELECT 语句
    if (!/^\s*SELECT/i.test(sql)) {
      return sql;
    }

    // 移除末尾的分号（如果有）
    const cleanSql = sql.replace(/;\s*$/, '');
    
    return `${cleanSql} LIMIT ${limit}`;
  }

  /**
   * 格式化查询结果为大字符串（用于展示）
   */
  formatResults<T extends Record<string, unknown>>(data: T[], columns: string[]): string {
    if (data.length === 0) {
      return '无数据';
    }

    if (columns.length === 0) {
      return `返回 ${data.length} 行数据（无列信息）`;
    }

    // 计算每列的最大宽度
    const widths: Record<string, number> = {};
    for (const col of columns) {
      widths[col] = col.length;
    }

    for (const row of data) {
      for (const col of columns) {
        const value = String(row[col] ?? 'NULL');
        widths[col] = Math.max(widths[col], value.length);
      }
    }

    // 限制每列最大宽度
    const maxColWidth = 50;
    for (const col of columns) {
      widths[col] = Math.min(widths[col], maxColWidth);
    }

    // 构建表头
    const header = '| ' + columns.map(col => col.padEnd(widths[col]).slice(0, maxColWidth)).join(' | ') + ' |';
    const separator = '|-' + columns.map(col => '-'.repeat(widths[col])).join('-|-') + '-|';

    // 构建数据行
    const rows = data.map(row => {
      return '| ' + columns.map(col => {
        const value = String(row[col] ?? 'NULL');
        const truncated = value.length > maxColWidth ? value.slice(0, maxColWidth - 3) + '...' : value;
        return truncated.padEnd(widths[col]);
      }).join(' | ') + ' |';
    });

    return [header, separator, ...rows].join('\n');
  }
}
