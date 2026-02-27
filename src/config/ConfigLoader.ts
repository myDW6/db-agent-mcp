/**
 * YAML配置加载器，支持环境变量替换
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { validateConfig, type ValidatedConfigFile } from './ConnectionConfig.js';
import { DatabaseError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * 替换字符串中的环境变量占位符
 * 支持 ${VAR} 语法
 */
export function interpolateEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger.warn('ConfigLoader', `环境变量 ${varName} 未定义`);
      return match; // 保留原样，让后续处理决定
    }
    return envValue;
  });
}

/**
 * 递归处理对象中的所有字符串值，替换环境变量
 */
function processEnvVars<T>(obj: T): T {
  if (typeof obj === 'string') {
    return interpolateEnvVars(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processEnvVars(item)) as unknown as T;
  }
  
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processEnvVars(value);
    }
    return result as T;
  }
  
  return obj;
}

/**
 * 从文件路径加载配置
 */
export function loadConfigFromFile(filePath: string): ValidatedConfigFile {
  logger.info('ConfigLoader', `正在加载配置文件: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new DatabaseError(
      `配置文件不存在: ${filePath}`,
      'CONFIG_ERROR'
    );
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.parse(content);
    
    // 处理环境变量
    const processed = processEnvVars(parsed);
    
    // 验证配置
    const validated = validateConfig(processed);
    
    logger.info('ConfigLoader', `成功加载 ${validated.connections.length} 个数据库连接配置`);
    
    // 检查密码是否包含未替换的环境变量
    for (const conn of validated.connections) {
      if (conn.password && conn.password.includes('${')) {
        logger.warn('ConfigLoader', `连接 ${conn.id} 的密码包含未定义的环境变量`);
      }
    }
    
    return validated;
  } catch (err) {
    if (err instanceof DatabaseError) {
      throw err;
    }
    if (err instanceof yaml.YAMLError) {
      throw new DatabaseError(
        `YAML解析错误: ${err.message}`,
        'CONFIG_ERROR',
        err
      );
    }
    throw new DatabaseError(
      `加载配置文件失败: ${err instanceof Error ? err.message : String(err)}`,
      'CONFIG_ERROR',
      err
    );
  }
}

/**
 * 获取默认配置文件路径
 */
export function getDefaultConfigPath(): string {
  const envPath = process.env.DB_CONFIG_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  
  // 默认路径：项目根目录下的 config/databases.yaml
  return path.resolve(process.cwd(), 'config', 'databases.yaml');
}

/**
 * 加载配置（使用默认路径或环境变量指定的路径）
 */
export function loadConfig(): ValidatedConfigFile {
  const configPath = getDefaultConfigPath();
  return loadConfigFromFile(configPath);
}

/**
 * 从对象直接加载配置（用于测试）
 */
export function loadConfigFromObject(obj: unknown): ValidatedConfigFile {
  const processed = processEnvVars(obj);
  return validateConfig(processed);
}
