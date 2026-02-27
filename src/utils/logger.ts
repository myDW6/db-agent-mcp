/**
 * 日志工具（stderr输出，避免干扰MCP通信）
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  const currentIndex = levels.indexOf(currentLogLevel);
  const messageIndex = levels.indexOf(level);
  return messageIndex >= currentIndex;
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}

function sanitizeSensitiveData(message: string): string {
  // 脱敏处理：密码、密钥等敏感信息
  return message
    .replace(/password['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'password: ***')
    .replace(/passwd['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'passwd: ***')
    .replace(/pwd['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'pwd: ***')
    .replace(/secret['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'secret: ***')
    .replace(/key['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'key: ***');
}

export function debug(module: string, message: string): void {
  if (shouldLog(LogLevel.DEBUG)) {
    console.error(sanitizeSensitiveData(formatMessage(LogLevel.DEBUG, module, message)));
  }
}

export function info(module: string, message: string): void {
  if (shouldLog(LogLevel.INFO)) {
    console.error(sanitizeSensitiveData(formatMessage(LogLevel.INFO, module, message)));
  }
}

export function warn(module: string, message: string): void {
  if (shouldLog(LogLevel.WARN)) {
    console.error(sanitizeSensitiveData(formatMessage(LogLevel.WARN, module, message)));
  }
}

export function error(module: string, message: string, err?: unknown): void {
  if (shouldLog(LogLevel.ERROR)) {
    const errorMessage = err instanceof Error ? ` - ${err.message}` : '';
    console.error(sanitizeSensitiveData(formatMessage(LogLevel.ERROR, module, `${message}${errorMessage}`)));
  }
}
