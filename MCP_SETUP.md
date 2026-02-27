# DB Agent MCP 配置指南

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/myDW6/db-agent-mcp.git
cd db-agent-mcp
npm install
```

### 2. 配置数据库连接

复制示例配置文件：

```bash
cp config/databases.example.yaml config/databases.yaml
```

编辑 `config/databases.yaml`，根据你的数据库修改配置：

```yaml
connections:
  - id: "my-mysql"
    name: "My MySQL"
    type: mysql
    host: "localhost"
    port: 3306
    database: "mydb"
    username: "${MYSQL_USER}"
    password: "${MYSQL_PASS}"
    readonly: true
    description: "我的 MySQL 数据库"
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# MySQL
MYSQL_USER=root
MYSQL_PASS=your_password

# PostgreSQL
PG_USER=postgres
PG_PASS=your_password
```

## MCP 客户端配置

### Kimi CLI 配置

编辑或创建 `~/.kimi/mcp.json`：

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/db-agent-mcp/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/absolute/path/to/db-agent-mcp/config/databases.yaml",
        "MYSQL_USER": "root",
        "MYSQL_PASS": "your_password"
      }
    }
  }
}
```

> **注意**：将 `/absolute/path/to/db-agent-mcp` 替换为实际的项目路径。

验证配置：
```bash
kimi mcp list
```

### Claude Desktop 配置

#### macOS
编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/db-agent-mcp/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/absolute/path/to/db-agent-mcp/config/databases.yaml",
        "MYSQL_USER": "root",
        "MYSQL_PASS": "your_password"
      }
    }
  }
}
```

#### Windows
编辑 `%APPDATA%/Claude/claude_desktop_config.json`

### Cursor 配置

在 Cursor Settings > Features > MCP 中添加：
- **Type**: `command`
- **Command**: `npx tsx /absolute/path/to/db-agent-mcp/src/index.ts`
- **Environment Variables**:
  - `DB_CONFIG_PATH`: `/absolute/path/to/db-agent-mcp/config/databases.yaml`
  - `MYSQL_USER`: `root`
  - `MYSQL_PASS`: `your_password`

## 验证配置

### 1. 测试配置文件

```bash
cd db-agent-mcp
npm run build
```

### 2. 测试 MCP 工具

```bash
kimi mcp call db-agent list_connections
```

## 使用示例

在 AI 客户端（Kimi/Claude/Cursor）中，你可以使用自然语言：

```
# 列出数据库连接
请列出所有可用的数据库连接

# 切换连接
切换到 my-mysql 数据库

# 查看表
显示所有表

# 查看表结构
查看 users 表的结构

# 执行查询
查询技术部的所有员工

# 分析查询性能
分析 SELECT * FROM orders WHERE user_id = 1

# 生成SQL建议
帮我生成查询：统计每个部门的员工数和平均工资
```

## 安全注意事项

1. **密码管理**：使用环境变量注入密码，不要直接写在 `databases.yaml` 中
2. **只读模式**：生产环境建议设置 `readonly: true`
3. **.gitignore**：`config/databases.yaml` 和 `.env` 已被添加到 `.gitignore`，不会提交到 Git

## 支持的客户端

| 客户端 | 配置方式 | 状态 |
|--------|----------|------|
| Kimi CLI | `~/.kimi/mcp.json` | ✅ 支持 |
| Claude Desktop | `claude_desktop_config.json` | ✅ 支持 |
| Cursor | Settings > MCP | ✅ 支持 |
