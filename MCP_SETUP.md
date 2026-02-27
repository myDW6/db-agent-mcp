# DB Agent MCP 配置指南

## 1. Kimi CLI 配置

编辑或创建 `~/.kimi/config.json`:

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/Users/shaodw/Downloads/db-agent/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/Users/shaodw/Downloads/db-agent/config/databases.yaml",
        "LOG_LEVEL": "info"
      },
      "disabled": false
    }
  }
}
```

## 2. Claude Desktop 配置

### macOS
编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/Users/shaodw/Downloads/db-agent/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/Users/shaodw/Downloads/db-agent/config/databases.yaml",
        "MYSQL_USER": "root",
        "MYSQL_PASS": "password"
      }
    }
  }
}
```

### Windows
编辑 `%APPDATA%/Claude/claude_desktop_config.json`

## 3. Cursor 配置

在 Cursor Settings > Features > MCP 中添加:
- Type: `command`
- Command: `npx tsx /Users/shaodw/Downloads/db-agent/src/index.ts`
- Environment Variables: 
  - `DB_CONFIG_PATH`: `/Users/shaodw/Downloads/db-agent/config/databases.yaml`

## 4. 环境变量配置

创建 `.env` 文件（用于 MySQL/PostgreSQL）:

```bash
# MySQL
MYSQL_USER=root
MYSQL_PASS=password

# PostgreSQL
PG_USER=postgres
PG_PASS=password
```

## 5. 验证配置

测试配置文件是否正确:

```bash
cd /Users/shaodw/Downloads/db-agent
npm run build
```

## 6. 使用示例

连接配置完成后，在 AI 客户端中可以使用：

```
# 列出数据库连接
请列出所有可用的数据库连接

# 切换连接
切换到演示数据库

# 查看表
显示所有表

# 查看表结构
查看 users 表的结构

# 执行查询
查询技术部的所有员工

# 分析查询性能
分析 SELECT * FROM orders WHERE user_id = 1

# 生成SQL
帮我生成查询：统计每个部门的员工数和平均工资
```
