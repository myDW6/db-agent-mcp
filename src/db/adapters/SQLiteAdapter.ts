/**
 * SQLite 数据库适配器
 */

import Database from 'better-sqlite3';
import type { DatabaseConfig, TableSchema, ColumnSchema, IndexSchema, QueryResult, QueryOptions } from '../../types/database.js';
import { BaseAdapter } from './BaseAdapter.js';
import { DatabaseError } from '../../utils/errors.js';
import * as logger from '../../utils/logger.js';

export class SQLiteAdapter extends BaseAdapter {
  private db: Database.Database | null = null;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      const path = this.config.path;
      if (!path) {
        throw new DatabaseError('SQLite配置缺少path字段', 'CONFIG_ERROR');
      }

      this.db = new Database(path, {
        readonly: this.config.readonly ?? false,
        fileMustExist: false,
      });

      // 启用外键约束
      this.db.pragma('foreign_keys = ON');

      this.connected = true;
      logger.info('SQLiteAdapter', `成功连接到 SQLite: ${path}`);
    } catch (err) {
      throw new DatabaseError(
        `SQLite连接失败: ${err instanceof Error ? err.message : String(err)}`,
        'CONNECTION_FAILED',
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      this.connected = false;
      logger.info('SQLiteAdapter', `已断开连接: ${this.config.id}`);
    } catch (err) {
      logger.error('SQLiteAdapter', '断开连接时出错', err);
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.db) return false;
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(schema?: string, includeSystemTables = false): Promise<TableSchema[]> {
    this.ensureConnected();
    
    try {
      const stmt = this.db!.prepare(`
        SELECT name 
        FROM sqlite_master 
        WHERE type = 'table'
        ${includeSystemTables ? '' : "AND name NOT LIKE 'sqlite_%'"}
        ORDER BY name
      `);

      const rows = stmt.all() as { name: string }[];
      const tables: TableSchema[] = [];

      for (const row of rows) {
        const tableSchema = await this.getTableSchema(row.name);
        tables.push(tableSchema);
      }

      return tables;
    } catch (err) {
      return this.handleQueryError(err, 'getTables');
    }
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    this.ensureConnected();
    
    try {
      // 获取表信息
      const tableInfo = this.db!.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type = 'table' AND name = ?
      `).get(tableName) as { sql: string } | undefined;

      // 获取列信息
      const columnsResult = this.db!.prepare(`PRAGMA table_info(${this.quoteIdentifier(tableName)})`).all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      // 获取索引列表
      const indexesList = this.db!.prepare(`PRAGMA index_list(${this.quoteIdentifier(tableName)})`).all() as Array<{
        seq: number;
        name: string;
        unique: number;
        origin: string;
        partial: number;
      }>;

      // 获取每个索引的详细信息
      const indexSchemas: IndexSchema[] = [];
      for (const idx of indexesList) {
        const indexInfo = this.db!.prepare(`PRAGMA index_info(${this.quoteIdentifier(idx.name)})`).all() as Array<{
          seqno: number;
          cid: number;
          name: string;
        }>;

        indexSchemas.push({
          name: idx.name,
          columns: indexInfo.map(info => info.name),
          unique: idx.unique === 1,
          type: 'BTREE', // SQLite 默认使用 BTREE
        });
      }

      // 获取行数
      const countResult = this.db!.prepare(`SELECT COUNT(*) as count FROM ${this.quoteIdentifier(tableName)}`).get() as { count: number };

      const columnSchemas: ColumnSchema[] = columnsResult.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        defaultValue: col.dflt_value ?? undefined,
        comment: undefined, // SQLite 原生不支持列注释
        isPrimary: col.pk === 1,
        isAutoIncrement: col.pk === 1 && col.type.toLowerCase() === 'integer',
      }));

      return {
        name: tableName,
        engine: 'SQLite',
        rowCount: countResult.count,
        columns: columnSchemas,
        indexes: indexSchemas,
      };
    } catch (err) {
      return this.handleQueryError(err, `getTableSchema(${tableName})`);
    }
  }

  async query<T = Record<string, unknown>>(sql: string, options: QueryOptions = {}): Promise<QueryResult<T>> {
    this.ensureConnected();
    
    const startTime = Date.now();
    const limit = Math.min(options.limit ?? 100, 1000);

    try {
      // 判断语句类型
      const isSelect = /^\s*SELECT/i.test(sql);
      const isPragma = /^\s*PRAGMA/i.test(sql);

      if (isSelect || isPragma) {
        // 添加LIMIT限制（仅对SELECT语句）
        let finalSql = sql;
        if (isSelect && !/\bLIMIT\s+\d+/i.test(sql) && !/\bSELECT\s+COUNT\(/i.test(sql)) {
          finalSql = `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`;
        }

        const stmt = this.db!.prepare(finalSql);
        const rows = stmt.all() as T[];

        const executionTime = Date.now() - startTime;
        this.updateStats(executionTime);

        const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

        return {
          data: rows,
          meta: {
            rowCount: rows.length,
            executionTime,
            columns,
          },
        };
      } else {
        // DDL/DML 语句使用 run()
        const stmt = this.db!.prepare(sql);
        const result = stmt.run();
        
        const executionTime = Date.now() - startTime;
        this.updateStats(executionTime);

        return {
          data: [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid }] as T[],
          meta: {
            rowCount: result.changes,
            executionTime,
            columns: ['changes', 'lastInsertRowid'],
          },
        };
      }
    } catch (err) {
      return this.handleQueryError(err, sql);
    }
  }

  async explainQuery(sql: string): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    
    try {
      const stmt = this.db!.prepare(`EXPLAIN QUERY PLAN ${sql}`);
      const rows = stmt.all() as Record<string, unknown>[];
      return rows;
    } catch (err) {
      return this.handleQueryError(err, `EXPLAIN QUERY PLAN ${sql}`);
    }
  }

  /**
   * 执行参数化查询（更安全，但不在主接口中）
   */
  run<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    this.ensureConnected();
    
    try {
      const stmt = this.db!.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (err) {
      return this.handleQueryError(err, sql);
    }
  }

  private quoteIdentifier(name: string): string {
    // SQLite 标识符引用
    return `"${name.replace(/"/g, '""')}"`;
  }

  private ensureConnected(): void {
    if (!this.connected || !this.db) {
      throw new DatabaseError(
        '数据库未连接，请先调用 connect()',
        'CONNECTION_FAILED'
      );
    }
  }
}
