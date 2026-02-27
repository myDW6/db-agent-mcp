import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../../src/db/DatabaseManager.js';
import { DatabaseError } from '../../src/utils/errors.js';
import type { DatabaseConfig } from '../../src/types/database.js';

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    manager = new DatabaseManager();
  });

  describe('registerConnection', () => {
    it('should register a connection config', () => {
      const config: DatabaseConfig = {
        id: 'test-sqlite',
        name: 'Test DB',
        type: 'sqlite',
        database: 'test',
        path: './test.db',
      };

      manager.registerConnection(config);
      const connections = manager.listConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].id).toBe('test-sqlite');
    });

    it('should reject duplicate connection IDs', () => {
      const config: DatabaseConfig = {
        id: 'test',
        name: 'Test',
        type: 'sqlite',
        database: 'test',
        path: './test.db',
      };

      manager.registerConnection(config);
      expect(() => manager.registerConnection(config)).toThrow(DatabaseError);
    });

    it('should register multiple connections', () => {
      const configs: DatabaseConfig[] = [
        { id: 'db1', name: 'DB1', type: 'sqlite', database: 'db1', path: './db1.db' },
        { id: 'db2', name: 'DB2', type: 'sqlite', database: 'db2', path: './db2.db' },
      ];

      manager.registerConnections(configs);
      expect(manager.listConnections()).toHaveLength(2);
    });
  });

  describe('listConnections', () => {
    it('should return empty array when no connections', () => {
      expect(manager.listConnections()).toEqual([]);
    });

    it('should return connection info without sensitive data', () => {
      const config: DatabaseConfig = {
        id: 'test',
        name: 'Test DB',
        type: 'mysql',
        host: 'localhost',
        database: 'test',
        username: 'root',
        password: 'secret',
        readonly: true,
        description: 'Test connection',
      };

      manager.registerConnection(config);
      const [info] = manager.listConnections();

      expect(info.id).toBe('test');
      expect(info.name).toBe('Test DB');
      expect(info.type).toBe('mysql');
      expect(info.readonly).toBe(true);
      expect(info.description).toBe('Test connection');
      // Password should not be exposed
      expect(info).not.toHaveProperty('password');
    });
  });

  describe('getCurrentConnection', () => {
    it('should return null when no connection selected', () => {
      expect(manager.getCurrentConnection()).toBeNull();
    });

    it('should throw when getting adapter without selection', async () => {
      await expect(manager.getCurrentAdapter()).rejects.toThrow(DatabaseError);
    });
  });

  describe('useConnection', () => {
    it('should throw for non-existent connection', async () => {
      await expect(manager.useConnection('non-existent')).rejects.toThrow(DatabaseError);
    });
  });

  describe('connection stats', () => {
    it('should return null for non-existent connection', () => {
      const stats = manager.getConnectionStats('non-existent');
      expect(stats).toBeNull();
    });
  });
});
