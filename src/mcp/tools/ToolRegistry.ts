/**
 * MCP 工具注册表
 */

import type { McpTool } from '../../types/mcp.js';

export class ToolRegistry {
  private tools = new Map<string, McpTool>();

  /**
   * 注册工具
   */
  register<T, R>(tool: McpTool<T, R>): void {
    this.tools.set(tool.name, tool as McpTool);
  }

  /**
   * 获取工具
   */
  getTool(name: string): McpTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具定义（用于MCP服务器初始化）
   */
  getAllToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: object;
  }> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * 列出所有工具名称
   */
  listToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
