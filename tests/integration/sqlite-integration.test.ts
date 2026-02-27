import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SQLiteAdapter } from '../../src/db/adapters/SQLiteAdapter.js';
import { DatabaseManager } from '../../src/db/DatabaseManager.js';
import { QueryValidator } from '../../src/db/query/QueryValidator.js';
import type { DatabaseConfig } from '../../src/types/database.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '../fixtures/test-integration.db');

describe('SQLite Integration Tests', () => {
  let adapter: SQLiteAdapter;

  const config: DatabaseConfig = {
    id: 'test-sqlite',
    name: 'Test SQLite',
    type: 'sqlite',
    database: 'test',
    path: TEST_DB_PATH,
    readonly: false,
  };

  beforeAll(async () => {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    adapter = new SQLiteAdapter(config);
    await adapter.connect();

    // Create test tables
    await adapter.query(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        age INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await adapter.query(`
      CREATE INDEX idx_users_name ON users(name)
    `);

    // Insert test data
    await adapter.query(`
      INSERT INTO users (name, email, age) VALUES 
        ('Alice', 'alice@example.com', 30),
        ('Bob', 'bob@example.com', 25),
        ('Charlie', 'charlie@example.com', 35)
    `);
  });

  afterAll(async () => {
    if (adapter) {
      await adapter.disconnect();
    }
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Basic Operations', () => {
    it('should be connected', () => {
      expect(adapter.isConnected()).toBe(true);
    });

    it('should query data', async () => {
      const result = await adapter.query('SELECT * FROM users ORDER BY id');
      expect(result.data).toHaveLength(3);
      expect(result.meta.rowCount).toBe(3);
      expect(result.meta.columns).toContain('id');
      expect(result.meta.columns).toContain('name');
    });

    it('should filter data with WHERE clause', async () => {
      const result = await adapter.query('SELECT * FROM users WHERE age > 25');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Alice');
    });

    it('should count rows', async () => {
      const result = await adapter.query('SELECT COUNT(*) as count FROM users');
      expect(result.data[0].count).toBe(3);
    });

    it('should apply LIMIT', async () => {
      const result = await adapter.query('SELECT * FROM users', { limit: 2 });
      expect(result.data).toHaveLength(2);
    });
  });

  describe('Metadata Operations', () => {
    it('should get all tables', async () => {
      const tables = await adapter.getTables();
      expect(tables.length).toBeGreaterThan(0);
      expect(tables.some(t => t.name === 'users')).toBe(true);
    });

    it('should get table schema', async () => {
      const schema = await adapter.getTableSchema('users');
      expect(schema.name).toBe('users');
      expect(schema.columns).toHaveLength(5);
      expect(schema.columns.some(c => c.name === 'id' && c.isPrimary)).toBe(true);
      expect(schema.columns.some(c => c.name === 'name' && !c.nullable)).toBe(true);
    });

    it('should get indexes', async () => {
      const schema = await adapter.getTableSchema('users');
      expect(schema.indexes.length).toBeGreaterThan(0);
      expect(schema.indexes.some(idx => idx.name === 'idx_users_name')).toBe(true);
    });
  });

  describe('Explain Query', () => {
    it('should return query plan', async () => {
      const plan = await adapter.explainQuery('SELECT * FROM users WHERE age > 25');
      expect(plan.length).toBeGreaterThan(0);
    });
  });

  describe('Stats Tracking', () => {
    it('should track query count', async () => {
      const before = adapter.getStats().queryCount;
      await adapter.query('SELECT 1');
      const after = adapter.getStats().queryCount;
      expect(after).toBe(before + 1);
    });

    it('should track execution time', async () => {
      await adapter.query('SELECT * FROM users');
      const stats = adapter.getStats();
      expect(stats.totalExecutionTime).toBeGreaterThan(0);
      expect(stats.lastQueryTime).toBeInstanceOf(Date);
    });
  });

  describe('Query Validation', () => {
    it('should validate safe SELECT', () => {
      const validator = new QueryValidator(false);
      const result = validator.validate('SELECT * FROM users');
      expect(result.valid).toBe(true);
    });

    it('should detect DELETE without WHERE', () => {
      const validator = new QueryValidator(false);
      const result = validator.validate('DELETE FROM users');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DELETE语句必须包含WHERE条件');
    });

    it('should block write operations in readonly mode', () => {
      const validator = new QueryValidator(true);
      const result = validator.validate('INSERT INTO users (name) VALUES ("test")');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('INSERT'))).toBe(true);
    });
  });
});

describe('DatabaseManager Integration', () => {
  const TEST_DB_PATH_2 = path.join(__dirname, '../fixtures/test-manager.db');

  beforeAll(() => {
    if (fs.existsSync(TEST_DB_PATH_2)) {
      fs.unlinkSync(TEST_DB_PATH_2);
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH_2)) {
      fs.unlinkSync(TEST_DB_PATH_2);
    }
  });

  it('should manage connection lifecycle', async () => {
    const manager = new DatabaseManager();
    
    const config: DatabaseConfig = {
      id: 'test-db',
      name: 'Test Database',
      type: 'sqlite',
      database: 'test',
      path: TEST_DB_PATH_2,
    };

    // Register connection
    manager.registerConnection(config);
    expect(manager.listConnections()).toHaveLength(1);

    // Use connection
    const connection = await manager.useConnection('test-db');
    expect(connection.id).toBe('test-db');
    expect(connection.name).toBe('Test Database');

    // Get current connection
    const current = manager.getCurrentConnection();
    expect(current?.id).toBe('test-db');

    // Execute query through manager
    const adapter = await manager.getCurrentAdapter();
    const result = await adapter.query('SELECT 1 as value');
    expect(result.data[0].value).toBe(1);

    // Close connection
    await manager.closeConnection('test-db');
    expect(manager.getCurrentConnection()).toBeNull();
  });
});
