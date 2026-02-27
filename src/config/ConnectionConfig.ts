/**
 * 连接配置类型定义与验证
 */

import { z } from 'zod';
import type { DatabaseConfig, DatabaseType } from '../types/database.js';

export const databaseTypeSchema = z.enum(['mysql', 'postgresql', 'sqlite']);

export const databaseConfigSchema = z.object({
  id: z.string().min(1, '连接ID不能为空'),
  name: z.string().min(1, '连接名称不能为空'),
  type: databaseTypeSchema,
  readonly: z.boolean().default(false),
  description: z.string().optional(),
  
  // MySQL/PostgreSQL 专用
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  database: z.string().min(1, '数据库名不能为空'),
  username: z.string().optional(),
  password: z.string().optional(),
  schema: z.string().default('public'),
  
  // SQLite 专用
  path: z.string().optional(),
  
  // 高级选项
  poolSize: z.number().int().positive().default(5),
  timeout: z.number().int().positive().default(30000),
}).refine((data) => {
  // 根据类型验证必填字段
  if (data.type === 'sqlite') {
    return !!data.path;
  } else {
    return !!data.host && !!data.username;
  }
}, {
  message: 'SQLite需要path字段，MySQL/PostgreSQL需要host和username字段',
});

export const configFileSchema = z.object({
  connections: z.array(databaseConfigSchema),
});

export type ValidatedDatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type ValidatedConfigFile = z.infer<typeof configFileSchema>;

export function validateConfig(config: unknown): ValidatedConfigFile {
  return configFileSchema.parse(config);
}

export function validateSingleConnection(config: unknown): ValidatedDatabaseConfig {
  return databaseConfigSchema.parse(config);
}
