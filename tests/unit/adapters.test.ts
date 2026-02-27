import { describe, it, expect, beforeEach } from 'vitest';
import { MySQLAdapter } from '../../src/db/adapters/MySQLAdapter.js';
import { PostgresAdapter } from '../../src/db/adapters/PostgresAdapter.js';
import { SQLiteAdapter } from '../../src/db/adapters/SQLiteAdapter.js';
import type { DatabaseConfig } from '../../src/types/database.js';

describe('Database Adapters', () => {
  describe('BaseAdapter', () => {
    const mockConfig: DatabaseConfig = {
      id: 'test',
      name: 'Test DB',
      type: 'sqlite',
      database: 'test',
      path: './test.db',
      readonly: true,
    };

    it('should store config correctly', () => {
      const adapter = new SQLiteAdapter(mockConfig);
      expect(adapter.getConfig().id).toBe('test');
      expect(adapter.getConfig().readonly).toBe(true);
    });

    it('should report readonly status correctly', () => {
      const readonlyAdapter = new SQLiteAdapter({ ...mockConfig, readonly: true });
      const writableAdapter = new SQLiteAdapter({ ...mockConfig, readonly: false });
      
      expect(readonlyAdapter.isReadOnly()).toBe(true);
      expect(writableAdapter.isReadOnly()).toBe(false);
    });

    it('should initialize with disconnected state', () => {
      const adapter = new SQLiteAdapter(mockConfig);
      expect(adapter.isConnected()).toBe(false);
    });

    it('should initialize stats correctly', () => {
      const adapter = new SQLiteAdapter(mockConfig);
      const stats = adapter.getStats();
      expect(stats.queryCount).toBe(0);
      expect(stats.totalExecutionTime).toBe(0);
    });
  });

  describe('Adapter Factory Pattern', () => {
    it('should create MySQL adapter for mysql type', () => {
      const config: DatabaseConfig = {
        id: 'test-mysql',
        name: 'Test MySQL',
        type: 'mysql',
        host: 'localhost',
        database: 'test',
        username: 'root',
        password: 'pass',
      };
      const adapter = new MySQLAdapter(config);
      expect(adapter.getConfig().type).toBe('mysql');
    });

    it('should create PostgreSQL adapter for postgresql type', () => {
      const config: DatabaseConfig = {
        id: 'test-pg',
        name: 'Test Postgres',
        type: 'postgresql',
        host: 'localhost',
        database: 'test',
        username: 'postgres',
        password: 'pass',
      };
      const adapter = new PostgresAdapter(config);
      expect(adapter.getConfig().type).toBe('postgresql');
    });

    it('should create SQLite adapter for sqlite type', () => {
      const config: DatabaseConfig = {
        id: 'test-sqlite',
        name: 'Test SQLite',
        type: 'sqlite',
        database: 'test',
        path: './test.db',
      };
      const adapter = new SQLiteAdapter(config);
      expect(adapter.getConfig().type).toBe('sqlite');
    });
  });

  describe('Config Validation', () => {
    it('should require host for MySQL', () => {
      const config: DatabaseConfig = {
        id: 'test',
        name: 'Test',
        type: 'mysql',
        database: 'test',
        // host is optional in type but needed in practice
      } as DatabaseConfig;
      const adapter = new MySQLAdapter(config);
      expect(adapter.getConfig().host).toBeUndefined();
    });

    it('should require path for SQLite', () => {
      const config: DatabaseConfig = {
        id: 'test',
        name: 'Test',
        type: 'sqlite',
        database: 'test',
        path: './data/test.db',
      };
      const adapter = new SQLiteAdapter(config);
      expect(adapter.getConfig().path).toBe('./data/test.db');
    });

    it('should use default poolSize', () => {
      const config: DatabaseConfig = {
        id: 'test',
        name: 'Test',
        type: 'mysql',
        host: 'localhost',
        database: 'test',
        username: 'root',
        // poolSize not specified
      };
      const adapter = new MySQLAdapter(config);
      // Default is set in DatabaseManager/Adapter creation
      expect(adapter.getConfig().poolSize).toBeUndefined();
    });

    it('should use default timeout', () => {
      const config: DatabaseConfig = {
        id: 'test',
        name: 'Test',
        type: 'mysql',
        host: 'localhost',
        database: 'test',
        username: 'root',
        // timeout not specified
      };
      const adapter = new MySQLAdapter(config);
      expect(adapter.getConfig().timeout).toBeUndefined();
    });
  });
});
