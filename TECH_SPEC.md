# 数据库智能代理 (DB Agent MCP) - 技术方案文档

**版本**: 1.0.0  
**日期**: 2026-02-27  
**技术栈**: Node.js + TypeScript + MCP SDK  

---

## 1. 项目概述

### 1.1 目标
构建基于 Model Context Protocol (MCP) 的数据库访问代理，支持 Kimi/Claude Code 等客户端通过自然语言交互式查询数据库。

### 1.2 核心价值
- **安全性**: 配置文件隔离敏感信息，支持只读模式
- **通用性**: 标准化MCP协议，支持任意兼容客户端
- **扩展性**: 模块化架构，易于添加新数据库类型

---

## 2. 功能需求 (Functional Requirements)

### FR-01 连接管理
- **FR-01.1**: 支持多数据库连接配置（MySQL/PostgreSQL/SQLite）
- **FR-01.2**: 运行时切换连接，无需重启服务
- **FR-01.3**: 连接配置通过YAML文件管理，支持环境变量注入

### FR-02 元数据查询
- **FR-02.1**: 列出所有数据库表及行数统计
- **FR-02.2**: 查询表结构（字段名、类型、约束、注释）
- **FR-02.3**: 查询索引、外键关系
- **FR-02.4**: 支持Schema过滤（PostgreSQL）

### FR-03 数据查询
- **FR-03.1**: 执行自定义SQL并返回结果
- **FR-03.2**: 只读模式拦截（INSERT/UPDATE/DELETE/DROP等）
- **FR-03.3**: 结果集自动截断（防止OOM）
- **FR-03.4**: 查询执行时间统计

### FR-04 智能辅助
- **FR-04.1**: 根据自然语言生成SQL建议（基于模板/规则）
- **FR-04.2**: SQL语法验证
- **FR-04.3**: 查询性能警告（如无索引的全表扫描）

---

## 3. 非功能需求 (Non-Functional Requirements)

### NFR-01 安全
- 密码必须存储在环境变量，禁止硬编码
- 只读连接必须拒绝所有写操作
- SQL注入防护（使用参数化查询）

### NFR-02 性能
- 单次查询返回数据上限：1000行
- 查询超时：30秒
- 支持连接池（MySQL/PostgreSQL）

### NFR-03 可靠性
- 连接断线自动重连
- 优雅的错误提示（不暴露敏感信息）

---

## 4. 技术架构

### 4.1 架构图
```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│              (Kimi / Claude Desktop / Cursor)               │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (stdio/SSE)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ Tool Handler │  │Resource Hndlr│  │   Config Hndlr  │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘    │
└─────────┼─────────────────┼──────────────────┼─────────────┘
          │                 │                  │
          ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│  Connection  │  │   Metadata   │  │  Query Engine   │
│   Manager    │  │   Explorer   │  │   (Validator)   │
└──────┬───────┘  └──────┬───────┘  └────────┬────────┘
       │                 │                   │
       └─────────────────┼───────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database Adapters                         │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │  MySQL   │      │PostgreSQL│      │  SQLite  │          │
│  │(mysql2)  │      │  (pg)    │      │(better-  │          │
│  │          │      │          │      │ sqlite3) │          │
│  └──────────┘      └──────────┘      └──────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 技术栈选型

| 组件 | 选型 | 理由 |
|------|------|------|
| **运行时** | Node.js 20+ | LTS支持，异步IO优异 |
| **语言** | TypeScript 5.0+ | 类型安全，开发体验好 |
| **MCP SDK** | @modelcontextprotocol/sdk | 官方协议实现 |
| **MySQL** | mysql2/promise | 支持Promise和连接池 |
| **PostgreSQL** | pg | 最成熟的Node PG驱动 |
| **SQLite** | better-sqlite3 | 同步API，性能更好 |
| **配置解析** | yaml | 支持注释，人类友好 |
| **校验** | zod | 运行时类型安全 |

---

## 5. 数据模型

### 5.1 配置模型 (config/databases.yaml)
```typescript
interface DatabaseConfig {
  id: string;                    // 唯一标识，如 "prod-mysql"
  name: string;                  // 显示名称
  type: 'mysql' | 'postgresql' | 'sqlite';
  readonly?: boolean;            // 默认false
  description?: string;          // 业务描述

  // MySQL/PostgreSQL 专用
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;            // 支持 ${ENV_VAR} 语法
  schema?: string;              // PostgreSQL schema，默认"public"

  // SQLite 专用
  path?: string;                // 数据库文件路径

  // 高级选项
  poolSize?: number;            // 连接池大小，默认5
  timeout?: number;             // 查询超时(ms)，默认30000
}
```

### 5.2 元数据模型
```typescript
interface TableSchema {
  name: string;
  schema?: string;              // PostgreSQL schema
  engine?: string;              // MySQL engine
  collation?: string;
  rowCount?: number;
  comment?: string;
  createdAt?: Date;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
}

interface ColumnSchema {
  name: string;
  type: string;                 // 数据库原生类型
  nullable: boolean;
  defaultValue?: string;
  comment?: string;
  isPrimary: boolean;
  isAutoIncrement?: boolean;
  maxLength?: number;
  precision?: number;           // 小数位
}

interface IndexSchema {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;                // BTREE, HASH等
}
```

---

## 6. MCP Tools 接口规范

### Tool 1: list_connections
**描述**: 列出所有可用的数据库连接  
**输入**: 无  
**输出**:
```json
{
  "connections": [
    {
      "id": "prod-mysql",
      "name": "生产环境MySQL",
      "type": "mysql",
      "readonly": true,
      "description": "主生产库，包含订单数据"
    }
  ]
}
```

### Tool 2: use_connection
**描述**: 激活指定连接  
**输入 Schema**:
```json
{
  "type": "object",
  "properties": {
    "connectionId": {
      "type": "string",
      "description": "连接ID"
    }
  },
  "required": ["connectionId"]
}
```
**业务规则**:
- 连接ID必须存在于配置中
- 成功后在服务端保持会话状态
- 失败返回明确错误（连接失败/认证失败/超时）

### Tool 3: list_tables
**描述**: 列出当前连接的所有表  
**输入 Schema**:
```json
{
  "type": "object",
  "properties": {
    "schema": {
      "type": "string",
      "description": "Schema名称（仅PostgreSQL）"
    },
    "includeSystemTables": {
      "type": "boolean",
      "description": "是否包含系统表，默认false"
    }
  }
}
```
**输出**:
```json
{
  "tables": [
    {
      "name": "users",
      "rowCount": 15234,
      "engine": "InnoDB",
      "comment": "用户主表",
      "schema": "public"
    }
  ],
  "total": 15
}
```

### Tool 4: describe_table
**描述**: 获取表详细结构  
**输入 Schema**:
```json
{
  "type": "object",
  "properties": {
    "tableName": {
      "type": "string"
    },
    "schema": {
      "type": "string"
    }
  },
  "required": ["tableName"]
}
```
**输出**:
```json
{
  "name": "users",
  "comment": "用户表",
  "columns": [
    {
      "name": "id",
      "type": "bigint unsigned",
      "nullable": false,
      "isPrimary": true,
      "isAutoIncrement": true,
      "comment": "主键ID"
    },
    {
      "name": "email",
      "type": "varchar",
      "nullable": false,
      "maxLength": 255,
      "comment": "邮箱地址"
    }
  ],
  "indexes": [
    {
      "name": "PRIMARY",
      "columns": ["id"],
      "unique": true
    },
    {
      "name": "idx_email",
      "columns": ["email"],
      "unique": true
    }
  ]
}
```

### Tool 5: execute_query
**描述**: 执行SQL查询  
**输入 Schema**:
```json
{
  "type": "object",
  "properties": {
    "sql": {
      "type": "string",
      "description": "SQL语句，支持多行"
    },
    "limit": {
      "type": "number",
      "description": "最大返回行数，默认100，最大1000"
    },
    "timeout": {
      "type": "number",
      "description": "超时时间(ms)，覆盖默认配置"
    }
  },
  "required": ["sql"]
}
```
**安全规则**:
1. 检查readonly标志，拦截写操作关键词
2. 自动添加LIMIT（如未指定且返回大量数据）
3. 禁止执行危险命令：`DROP DATABASE`, `TRUNCATE`, `DELETE` without WHERE等

**输出**:
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "rowCount": 50,
    "executionTime": 125,
    "columns": ["id", "name", "created_at"]
  }
}
```

### Tool 6: explain_query
**描述**: 分析查询执行计划（性能优化）  
**输入**: SQL语句  
**输出**: 格式化执行计划（不同数据库格式不同）

### Tool 7: generate_sql
**描述**: 基于表结构生成SQL建议  
**输入 Schema**:
```json
{
  "type": "object",
  "properties": {
    "intent": {
      "type": "string",
      "description": "自然语言描述，如'查找最近7天注册的用户'"
    },
    "tableHints": {
      "type": "array",
      "items": {"type": "string"},
      "description": "可能涉及的表名"
    }
  },
  "required": ["intent"]
}
```
**实现逻辑**:
- 基于当前表结构元数据
- 匹配常见SQL模式（时间范围查询、聚合、JOIN等）
- 返回建议SQL（不执行），用户确认后手动执行

---

## 7. 项目目录结构

```
db-agent-mcp/
├── config/
│   ├── databases.yaml          # 数据库配置文件（示例）
│   └── databases.example.yaml  # 配置模板（含注释）
├── src/
│   ├── config/
│   │   ├── ConfigLoader.ts     # YAML解析与环境变量替换
│   │   └── ConnectionConfig.ts # 配置类型定义
│   ├── db/
│   │   ├── DatabaseManager.ts  # 连接池管理与路由
│   │   ├── adapters/
│   │   │   ├── BaseAdapter.ts  # 抽象基类
│   │   │   ├── MySQLAdapter.ts
│   │   │   ├── PostgresAdapter.ts
│   │   │   └── SQLiteAdapter.ts
│   │   └── query/
│   │       ├── QueryBuilder.ts # SQL构建辅助
│   │       └── QueryValidator.ts # SQL安全检查
│   ├── mcp/
│   │   ├── Server.ts           # MCP服务器主类
│   │   ├── tools/
│   │   │   ├── ToolRegistry.ts
│   │   │   ├── ConnectionTools.ts
│   │   │   ├── MetadataTools.ts
│   │   │   └── QueryTools.ts
│   │   └── resources/          # MCP Resources（可选）
│   ├── types/
│   │   ├── database.ts         # 数据库相关类型
│   │   └── mcp.ts              # MCP协议类型
│   └── utils/
│       ├── logger.ts           # 日志工具（stderr输出）
│       └── errors.ts           # 错误分类
├── tests/
│   ├── unit/
│   │   ├── adapters.test.ts
│   │   └── validator.test.ts
│   ├── integration/
│   │   └── mcp-flow.test.ts
│   └── fixtures/
│       └── test-config.yaml
├── .env.example                # 环境变量模板
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md                   # 使用说明
```

---

## 8. 实现步骤 (Implementation Steps)

### Phase 1: 基础架构 (Day 1)
1. **项目初始化**
   ```bash
   npm init -y
   npm install @modelcontextprotocol/sdk zod yaml mysql2 pg better-sqlite3
   npm install -D @types/node @types/pg typescript tsx jest @types/jest
   npx tsc --init
   ```

2. **配置系统**
   - 实现 `ConfigLoader.ts` 支持YAML解析
   - 实现环境变量替换 `${VAR}` 语法
   - 配置验证（Zod Schema）

3. **类型定义**
   - 完成 `types/database.ts` 所有接口
   - 完成 `types/mcp.ts` 工具定义

### Phase 2: 数据库适配器 (Day 2-3)
1. **基础适配器**
   - 抽象类 `BaseAdapter` 定义通用接口：
     - `connect(): Promise<void>`
     - `disconnect(): Promise<void>`
     - `getTables(schema?): Promise<TableSchema[]>`
     - `getColumns(table): Promise<ColumnSchema[]>`
     - `query(sql): Promise<QueryResult>`

2. **具体实现**
   - MySQLAdapter (使用 mysql2/promise)
   - PostgresAdapter (使用 pg.Client)
   - SQLiteAdapter (使用 better-sqlite3)

3. **DatabaseManager**
   - 连接池管理（Map<string, Adapter>）
   - 当前连接状态维护
   - 健康检查与自动重连

### Phase 3: MCP层 (Day 4)
1. **服务器搭建**
   - StdioServerTransport 配置
   - 错误处理中间件

2. **工具实现**
   - 按第6节规范实现所有Tools
   - 输入验证（Zod）
   - 错误格式化（友好提示）

3. **安全模块**
   - QueryValidator实现：
     - 正则匹配危险操作 `\b(DROP|TRUNCATE|DELETE\s+FROM)\b`
     - 只读模式检查
     - 自动LIMIT注入

### Phase 4: 智能功能 (Day 5)
1. **SQL生成器**
   - 基于模板生成（非AI）
   - 识别时间范围、聚合、排序等模式
   - 表结构感知（自动匹配字段名）

2. **查询分析**
   - MySQL: `EXPLAIN` 解析
   - PostgreSQL: `EXPLAIN (FORMAT JSON)` 解析
   - 警告全表扫描（type=ALL）

### Phase 5: 测试与文档 (Day 6)
1. **单元测试**
   - 配置加载测试
   - SQL验证器测试
   - 适配器Mock测试

2. **集成测试**
   - Docker Compose启动测试数据库（MySQL/Postgres）
   - 端到端MCP流程测试

3. **文档**
   - README.md（安装、配置、使用）
   - 配置示例（databases.example.yaml）

---

## 9. 关键代码规范

### 9.1 错误处理
```typescript
// 统一错误类型
class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,      // 'CONNECTION_FAILED' | 'QUERY_TIMEOUT' | 'VALIDATION_ERROR'
    public originalError?: any
  ) {
    super(message);
  }
}

// MCP错误返回
return {
  content: [{ type: 'text', text: `数据库错误 [${code}]: ${message}` }],
  isError: true
};
```

### 9.2 日志规范
- 使用 `console.error` 输出日志（stdout用于MCP通信）
- 格式: `[TIMESTAMP] [LEVEL] [MODULE] Message`
- 生产环境敏感信息脱敏（密码、密钥）

### 9.3 SQL安全检查
```typescript
// 禁止的操作（只读模式下）
const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i
];

// 危险DELETE检查（即使非只读也警告）
if (/DELETE\s+FROM/i.test(sql) && !/WHERE/i.test(sql)) {
  throw new Error('DELETE语句必须包含WHERE条件');
}
```

---

## 10. 配置示例

### 10.1 databases.yaml
```yaml
connections:
  # MySQL生产环境（只读）
  - id: "prod-mysql"
    name: "生产MySQL"
    type: mysql
    host: "${MYSQL_PROD_HOST}"
    port: 3306
    database: "production"
    username: "${MYSQL_PROD_USER}"
    password: "${MYSQL_PROD_PASS}"
    readonly: true
    poolSize: 5
    description: "线上业务数据库，包含订单、用户、支付数据"

  # PostgreSQL分析库
  - id: "analytics-pg"
    name: "分析数据库"
    type: postgresql
    host: "localhost"
    port: 5432
    database: "analytics"
    username: "${PG_USER}"
    password: "${PG_PASS}"
    schema: "warehouse"
    readonly: true
    description: "数据仓库，用于BI查询"

  # SQLite本地开发
  - id: "dev-sqlite"
    name: "本地开发库"
    type: sqlite
    path: "./data/dev.db"
    readonly: false
    description: "本地开发测试数据库"
```

### 10.2 环境变量 (.env)
```bash
# MySQL
MYSQL_PROD_HOST=db.company.com
MYSQL_PROD_USER=analyst
MYSQL_PROD_PASS=secret_password

# PostgreSQL
PG_USER=postgres
PG_PASS=local_dev_pass

# 可选：配置路径
DB_CONFIG_PATH=./config/databases.yaml
```

---

## 11. 客户端配置指南

### 11.1 Claude Desktop
编辑 `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) 或 `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "db-agent": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/db-agent-mcp/src/index.ts"],
      "env": {
        "DB_CONFIG_PATH": "/absolute/path/to/config/databases.yaml",
        "MYSQL_PROD_HOST": "localhost",
        "MYSQL_PROD_USER": "root",
        "MYSQL_PROD_PASS": "password"
      },
      "disabled": false
    }
  }
}
```

### 11.2 Cursor
在 Cursor Settings > Features > MCP 中添加:
- Type: `command`
- Command: `npx tsx /path/to/db-agent-mcp/src/index.ts`

---

## 12. 验收标准 (Acceptance Criteria)

### AC-01 基础功能
- [ ] 成功列出3种数据库连接
- [ ] 成功切换连接并缓存状态
- [ ] 成功查询表结构并返回JSON

### AC-02 安全性
- [ ] 只读连接拒绝INSERT操作并返回友好错误
- [ ] DELETE无WHERE被拦截
- [ ] 密码通过环境变量注入，不泄露在代码中

### AC-03 性能
- [ ] 查询1000行数据<2秒
- [ ] 连接断开后自动重连（最多3次）
- [ ] 单条SQL结果>1000行自动截断并警告

### AC-04 用户体验
- [ ] 错误信息包含上下文（如"表不存在: users"而非"Error 1146"）
- [ ] 大结果集自动格式化（Markdown表格）
- [ ] 查询执行时间显示

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SQL注入 | 高 | 使用参数化查询（虽然MCP层只传SQL，但需在文档中强调客户端责任） |
| 连接泄露 | 中 | 实现连接池，超时自动释放 |
| 敏感数据暴露 | 高 | 日志脱敏，只读模式默认开启 |
| 大数据查询OOM | 中 | 强制LIMIT，流式结果传输 |

---

## 14. 附录

### 14.1 数据库特定查询

**MySQL表结构查询**:
```sql
SELECT 
  COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT,
  COLUMN_KEY, EXTRA
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
```

**PostgreSQL表结构查询**:
```sql
SELECT 
  column_name, data_type, is_nullable, column_default,
  pg_catalog.col_description(format('%s.%s', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) as comment
FROM information_schema.columns c
WHERE c.table_name = $1 AND c.table_schema = $2
```

**SQLite表结构查询**:
```sql
PRAGMA table_info(table_name);
PRAGMA index_list(table_name);
```

### 14.2 开发命令
```bash
# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 测试
npm test

# 代码检查
npm run lint
```

---

**文档结束**

**注意事项**: 
1. 实现时必须使用TypeScript严格模式 (`strict: true`)
2. 所有数据库操作必须处理异常并转换为业务错误
3. 保持MCP协议的JSON-RPC格式严格一致
4. 首次提交需包含完整的README和配置示例
