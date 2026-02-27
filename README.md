# DB Agent MCP 🗄️

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的数据库智能代理，支持 Kimi/Claude Code 等客户端通过自然语言交互式查询数据库。

## ✨ 特性

- **多数据库支持**: MySQL、PostgreSQL、SQLite
- **安全可靠**: 只读模式、SQL注入防护、敏感信息脱敏
- **智能辅助**: SQL生成建议、查询性能分析
- **易于配置**: YAML配置文件，支持环境变量

## 🚀 快速开始

### 1. 安装

```bash
# 克隆项目
git clone <repository-url>
cd db-agent-mcp

# 安装依赖
npm install
```

### 2. 配置

```bash
# 复制配置文件模板
cp config/databases.example.yaml config/databases.yaml
cp .env.example .env

# 编辑配置文件，设置你的数据库连接
vim config/databases.yaml
vim .env
```

### 3. 使用

#### 在 Kimi CLI 中使用

编辑 `~/.kimi/config.json`:

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/db-agent-mcp/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/absolute/path/to/config/databases.yaml"
      }
    }
  }
}
```

#### 在 Claude Desktop 中使用

编辑 Claude Desktop 配置文件:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/db-agent-mcp/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/absolute/path/to/config/databases.yaml",
        "MYSQL_USER": "root",
        "MYSQL_PASS": "password"
      },
      "disabled": false
    }
  }
}
```

#### 在 Cursor 中使用

在 Cursor Settings > Features > MCP 中添加:
- Type: `command`
- Command: `npx tsx /path/to/db-agent-mcp/src/index.ts`

## 📋 可用工具

### 连接管理

| 工具名 | 描述 |
|--------|------|
| `list_connections` | 列出所有配置的数据库连接 |
| `use_connection` | 切换到指定的数据库连接 |
| `get_current_connection` | 获取当前使用的连接信息 |

### 元数据查询

| 工具名 | 描述 |
|--------|------|
| `list_tables` | 列出数据库中的所有表 |
| `describe_table` | 获取表的详细结构（列、索引等） |
| `show_table_stats` | 显示表的统计信息 |

### 数据查询

| 工具名 | 描述 |
|--------|------|
| `execute_query` | 执行 SQL 查询 |
| `explain_query` | 分析查询执行计划 |
| `generate_sql` | 根据自然语言描述生成 SQL 建议 |

## 🔒 安全配置

### 只读模式

在 `databases.yaml` 中设置 `readonly: true`:

```yaml
connections:
  - id: "prod-mysql"
    name: "生产环境"
    type: mysql
    host: "localhost"
    readonly: true  # 启用只读模式
```

只读模式下禁止的操作:
- INSERT / UPDATE / DELETE
- DROP / TRUNCATE / ALTER / CREATE
- GRANT / REVOKE

### 环境变量

敏感信息通过环境变量注入，支持 `${VAR_NAME}` 语法:

```yaml
password: "${MYSQL_PROD_PASS}"
```

### SQL 安全检查

- 自动拦截无 WHERE 条件的 DELETE/UPDATE
- 自动添加 LIMIT 限制（默认100行，最大1000行）
- 查询超时保护（默认30秒）

## ⚙️ 配置详解

### databases.yaml

```yaml
connections:
  - id: "unique-id"           # 唯一标识符
    name: "显示名称"           # 显示名称
    type: "mysql"             # 数据库类型: mysql | postgresql | sqlite
    readonly: false           # 是否只读
    description: "描述信息"    # 业务描述

    # MySQL/PostgreSQL 配置
    host: "localhost"
    port: 3306
    database: "dbname"
    username: "${DB_USER}"    # 支持环境变量
    password: "${DB_PASS}"
    schema: "public"          # PostgreSQL schema

    # SQLite 配置
    path: "./data/my.db"

    # 高级选项
    poolSize: 5               # 连接池大小
    timeout: 30000            # 查询超时(ms)
```

## 📝 使用示例

### 查看可用连接

```
请列出所有可用的数据库连接
```

### 切换连接

```
切换到生产环境MySQL
```

### 查看表结构

```
显示 users 表的结构
```

### 执行查询

```
查询最近7天注册的用户
```

### 生成SQL建议

```
帮我生成一个查询：统计每个城市的用户数量
```

### 性能分析

```
分析这条查询的性能：SELECT * FROM orders WHERE user_id = 123
```

## 🧪 开发

```bash
# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 运行测试
npm test
```

## 📚 技术栈

- **运行时**: Node.js 20+
- **语言**: TypeScript 5.0+
- **MCP SDK**: @modelcontextprotocol/sdk
- **数据库驱动**: 
  - MySQL: mysql2
  - PostgreSQL: pg
  - SQLite: better-sqlite3

## 📄 许可证

MIT
