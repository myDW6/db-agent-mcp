/**
 * MySQL 数据库适配器
 */

import mysql from 'mysql2/promise';
import type { DatabaseConfig, TableSchema, ColumnSchema, IndexSchema, QueryResult, QueryOptions } from '../../types/database.js';
import { BaseAdapter } from './BaseAdapter.js';
import { DatabaseError } from '../../utils/errors.js';
import * as logger from '../../utils/logger.js';

export class MySQLAdapter extends BaseAdapter {
  private pool: mysql.Pool | null = null;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      const poolSize = this.config.poolSize ?? 5;
      
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port ?? 3306,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        connectionLimit: poolSize,
        connectTimeout: this.config.timeout ?? 30000,
        enableKeepAlive: true,
      });

      // 测试连接
      const testConn = await this.pool.getConnection();
      testConn.release();
      this.connected = true;
      
      logger.info('MySQLAdapter', `成功连接到 MySQL: ${this.config.host}:${this.config.port}/${this.config.database}`);
    } catch (err) {
      throw new DatabaseError(
        `MySQL连接失败: ${err instanceof Error ? err.message : String(err)}`,
        'CONNECTION_FAILED',
        err
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      this.connected = false;
      logger.info('MySQLAdapter', `已断开连接: ${this.config.id}`);
    } catch (err) {
      logger.error('MySQLAdapter', '断开连接时出错', err);
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.pool) return false;
      const conn = await this.pool.getConnection();
      await conn.ping();
      conn.release();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(schema?: string, includeSystemTables = false): Promise<TableSchema[]> {
    this.ensureConnected();
    
    const targetSchema = schema ?? this.config.database;
    
    try {
      // 获取表列表和基本信息
      const [rows] = await this.pool!.query<mysql.RowDataPacket[]>(`
        SELECT 
          t.TABLE_NAME as name,
          t.ENGINE as engine,
          t.TABLE_COLLATION as collation,
          t.TABLE_COMMENT as comment,
          t.TABLE_ROWS as rowCount,
          t.CREATE_TIME as createdAt
        FROM INFORMATION_SCHEMA.TABLES t
        WHERE t.TABLE_SCHEMA = ?
        ${includeSystemTables ? '' : "AND t.TABLE_NAME NOT LIKE 'mysql_%' AND t.TABLE_NAME NOT LIKE 'information_schema_%' AND t.TABLE_NAME NOT LIKE 'performance_schema_%'"}
        ORDER BY t.TABLE_NAME
      `, [targetSchema]);

      const tables: TableSchema[] = [];
      
      for (const row of rows) {
        const tableSchema = await this.getTableSchema(row.name, targetSchema);
        tables.push(tableSchema);
      }

      return tables;
    } catch (err) {
      return this.handleQueryError(err, 'getTables');
    }
  }

  async getTableSchema(tableName: string, schema?: string): Promise<TableSchema> {
    this.ensureConnected();
    
    const targetSchema = schema ?? this.config.database;
    
    try {
      // 获取列信息
      const [columns] = await this.pool!.query<mysql.RowDataPacket[]>(`
        SELECT 
          COLUMN_NAME as name,
          DATA_TYPE as type,
          IS_NULLABLE as nullable,
          COLUMN_DEFAULT as defaultValue,
          COLUMN_COMMENT as comment,
          COLUMN_KEY as columnKey,
          EXTRA as extra,
          CHARACTER_MAXIMUM_LENGTH as maxLength,
          NUMERIC_PRECISION as precision,
          NUMERIC_SCALE as scale
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [targetSchema, tableName]);

      // 获取索引信息
      const [indexes] = await this.pool!.query<mysql.RowDataPacket[]>(`
        SELECT 
          INDEX_NAME as name,
          COLUMN_NAME as columnName,
          NON_UNIQUE as nonUnique,
          INDEX_TYPE as type
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `, [targetSchema, tableName]);

      // 获取表基本信息
      const [tableInfo] = await this.pool!.query<mysql.RowDataPacket[]>(`
        SELECT 
          ENGINE as engine,
          TABLE_COLLATION as collation,
          TABLE_COMMENT as comment,
          TABLE_ROWS as rowCount
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `, [targetSchema, tableName]);

      const columnSchemas: ColumnSchema[] = columns.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable === 'YES',
        defaultValue: col.defaultValue,
        comment: col.comment,
        isPrimary: col.columnKey === 'PRI',
        isAutoIncrement: col.extra?.includes('auto_increment'),
        maxLength: col.maxLength,
        precision: col.precision,
      }));

      // 组织索引信息
      const indexMap = new Map<string, IndexSchema>();
      for (const idx of indexes) {
        if (!indexMap.has(idx.name)) {
          indexMap.set(idx.name, {
            name: idx.name,
            columns: [],
            unique: idx.nonUnique === 0,
            type: idx.type,
          });
        }
        indexMap.get(idx.name)!.columns.push(idx.columnName);
      }

      return {
        name: tableName,
        schema: targetSchema,
        engine: tableInfo[0]?.engine,
        collation: tableInfo[0]?.collation,
        comment: tableInfo[0]?.comment,
        rowCount: tableInfo[0]?.rowCount,
        columns: columnSchemas,
        indexes: Array.from(indexMap.values()),
      };
    } catch (err) {
      return this.handleQueryError(err, `getTableSchema(${tableName})`);
    }
  }

  async query<T = Record<string, unknown>>(sql: string, options: QueryOptions = {}): Promise<QueryResult<T>> {
    this.ensureConnected();
    
    const startTime = Date.now();
    const limit = Math.min(options.limit ?? 100, 1000);
    const timeout = options.timeout ?? this.config.timeout ?? 30000;

    try {
      // 添加LIMIT限制（仅对SELECT语句）
      let finalSql = sql;
      const isSelect = /^\s*SELECT/i.test(sql);
      if (isSelect && !/\bLIMIT\s+\d+/i.test(sql) && !/\bSELECT\s+COUNT\(/i.test(sql)) {
        finalSql = `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`;
      }

      const [rows] = await this.pool!.query<mysql.RowDataPacket[]>({
        sql: finalSql,
        timeout,
      });

      const executionTime = Date.now() - startTime;
      this.updateStats(executionTime);

      const data = Array.isArray(rows) ? rows : [];
      const columns = data.length > 0 ? Object.keys(data[0]) : [];

      return {
        data: data as T[],
        meta: {
          rowCount: data.length,
          executionTime,
          columns,
        },
      };
    } catch (err) {
      return this.handleQueryError(err, sql);
    }
  }

  async explainQuery(sql: string): Promise<Record<string, unknown>[]> {
    this.ensureConnected();
    
    try {
      const [rows] = await this.pool!.query<mysql.RowDataPacket[]>(`EXPLAIN ${sql}`);
      return rows as Record<string, unknown>[];
    } catch (err) {
      return this.handleQueryError(err, `EXPLAIN ${sql}`);
    }
  }

  private ensureConnected(): void {
    if (!this.connected || !this.pool) {
      throw new DatabaseError(
        '数据库未连接，请先调用 connect()',
        'CONNECTION_FAILED'
      );
    }
  }
}
