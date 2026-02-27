/**
 * PostgreSQL 数据库适配器
 */

import pg from 'pg';
const { Client, Pool } = pg;

import type { DatabaseConfig, TableSchema, ColumnSchema, IndexSchema, QueryResult, QueryOptions } from '../../types/database.js';
import { BaseAdapter } from './BaseAdapter.js';
import { DatabaseError } from '../../utils/errors.js';
import * as logger from '../../utils/logger.js';

export class PostgresAdapter extends BaseAdapter {
  private pool: InstanceType<typeof Pool> | null = null;

  constructor(config: DatabaseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port ?? 5432,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        max: this.config.poolSize ?? 5,
        connectionTimeoutMillis: this.config.timeout ?? 30000,
      });

      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      this.connected = true;
      logger.info('PostgresAdapter', `成功连接到 PostgreSQL: ${this.config.host}:${this.config.port}/${this.config.database}`);
    } catch (err) {
      throw new DatabaseError(
        `PostgreSQL连接失败: ${err instanceof Error ? err.message : String(err)}`,
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
      logger.info('PostgresAdapter', `已断开连接: ${this.config.id}`);
    } catch (err) {
      logger.error('PostgresAdapter', '断开连接时出错', err);
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.pool) return false;
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(schema?: string, includeSystemTables = false): Promise<TableSchema[]> {
    this.ensureConnected();
    
    const targetSchema = schema ?? this.config.schema ?? 'public';
    
    try {
      const result = await this.pool!.query(`
        SELECT 
          t.tablename as name,
          pg_catalog.obj_description(
            (quote_ident(t.schemaname) || '.' || quote_ident(t.tablename))::regclass
          ) as comment
        FROM pg_catalog.pg_tables t
        WHERE t.schemaname = $1
        ${includeSystemTables ? '' : "AND t.schemaname NOT IN ('pg_catalog', 'information_schema')"}
        ORDER BY t.tablename
      `, [targetSchema]);

      const tables: TableSchema[] = [];
      
      for (const row of result.rows) {
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
    
    const targetSchema = schema ?? this.config.schema ?? 'public';
    
    try {
      // 获取列信息
      const columnsResult = await this.pool!.query(`
        SELECT 
          c.column_name as name,
          c.data_type as type,
          c.is_nullable as nullable,
          c.column_default as defaultValue,
          c.character_maximum_length as maxLength,
          c.numeric_precision as precision,
          c.numeric_scale as scale,
          pg_catalog.col_description(
            (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass::oid,
            c.ordinal_position
          ) as comment,
          CASE 
            WHEN pk.column_name IS NOT NULL THEN true 
            ELSE false 
          END as is_primary
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name, ku.table_schema, ku.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku
            ON tc.constraint_name = ku.constraint_name
            AND tc.table_schema = ku.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.column_name = pk.column_name 
          AND c.table_schema = pk.table_schema 
          AND c.table_name = pk.table_name
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `, [targetSchema, tableName]);

      // 获取索引信息
      const indexesResult = await this.pool!.query(`
        SELECT 
          i.relname as name,
          am.amname as type,
          ix.indisunique as is_unique,
          array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
        FROM pg_index ix
        JOIN pg_class i ON ix.indexrelid = i.oid
        JOIN pg_class t ON ix.indrelid = t.oid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1 AND n.nspname = $2
        GROUP BY i.relname, am.amname, ix.indisunique
        ORDER BY i.relname
      `, [tableName, targetSchema]);

      // 获取表行数估计
      const rowCountResult = await this.pool!.query(`
        SELECT reltuples::bigint as row_count
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relname = $1 AND n.nspname = $2
      `, [tableName, targetSchema]);

      const columnSchemas: ColumnSchema[] = columnsResult.rows.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable === 'YES',
        defaultValue: col.defaultvalue,
        comment: col.comment,
        isPrimary: col.is_primary,
        isAutoIncrement: col.defaultvalue?.includes('nextval'),
        maxLength: col.maxlength,
        precision: col.precision,
        scale: col.scale,
      }));

      const indexSchemas: IndexSchema[] = indexesResult.rows.map(idx => ({
        name: idx.name,
        columns: idx.columns,
        unique: idx.is_unique,
        type: idx.type,
      }));

      return {
        name: tableName,
        schema: targetSchema,
        rowCount: rowCountResult.rows[0]?.row_count,
        comment: undefined, // 已在查询中获取，但这里简化处理
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
    const timeout = options.timeout ?? this.config.timeout ?? 30000;

    try {
      // 添加LIMIT限制（仅对SELECT语句）
      let finalSql = sql;
      const isSelect = /^\s*SELECT/i.test(sql);
      if (isSelect && !/\bLIMIT\s+\d+/i.test(sql) && !/\bSELECT\s+COUNT\(/i.test(sql)) {
        finalSql = `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`;
      }

      // 设置查询超时
      await this.pool!.query(`SET statement_timeout = ${timeout}`);

      const result = await this.pool!.query(finalSql);

      const executionTime = Date.now() - startTime;
      this.updateStats(executionTime);

      const columns = result.fields.map(f => f.name);

      return {
        data: result.rows as T[],
        meta: {
          rowCount: result.rowCount ?? result.rows.length,
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
      const result = await this.pool!.query(`EXPLAIN (FORMAT JSON) ${sql}`);
      return result.rows[0]?.['QUERY PLAN'] ?? [];
    } catch (err) {
      // 如果 JSON 格式不支持，回退到文本格式
      try {
        const result = await this.pool!.query(`EXPLAIN ${sql}`);
        return result.rows;
      } catch (fallbackErr) {
        return this.handleQueryError(fallbackErr, `EXPLAIN ${sql}`);
      }
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
