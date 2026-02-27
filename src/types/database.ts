/**
 * 数据库相关类型定义
 */

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

export interface DatabaseConfig {
  /** 唯一标识，如 "prod-mysql" */
  id: string;
  /** 显示名称 */
  name: string;
  /** 数据库类型 */
  type: DatabaseType;
  /** 是否只读，默认false */
  readonly?: boolean;
  /** 业务描述 */
  description?: string;

  // MySQL/PostgreSQL 专用
  host?: string;
  port?: number;
  database: string;
  username?: string;
  /** 支持 ${ENV_VAR} 语法 */
  password?: string;
  /** PostgreSQL schema，默认"public" */
  schema?: string;

  // SQLite 专用
  /** 数据库文件路径 */
  path?: string;

  // 高级选项
  /** 连接池大小，默认5 */
  poolSize?: number;
  /** 查询超时(ms)，默认30000 */
  timeout?: number;
}

export interface DatabaseConfigFile {
  connections: DatabaseConfig[];
}

export interface TableSchema {
  name: string;
  /** PostgreSQL schema */
  schema?: string;
  /** MySQL engine */
  engine?: string;
  collation?: string;
  rowCount?: number;
  comment?: string;
  createdAt?: Date;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
}

export interface ColumnSchema {
  name: string;
  /** 数据库原生类型 */
  type: string;
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimary: boolean;
  isAutoIncrement?: boolean;
  maxLength?: number;
  /** 小数位 */
  precision?: number;
  scale?: number;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  unique: boolean;
  /** BTREE, HASH等 */
  type?: string;
}

export interface QueryResult<T = Record<string, unknown>> {
  data: T[];
  meta: {
    rowCount: number;
    executionTime: number;
    columns: string[];
  };
}

export interface QueryOptions {
  /** 最大返回行数，默认100 */
  limit?: number;
  /** 超时时间(ms)，覆盖默认配置 */
  timeout?: number;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  type: DatabaseType;
  readonly: boolean;
  description?: string;
}
