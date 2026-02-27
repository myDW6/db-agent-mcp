import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateConfig, validateSingleConnection } from '../../src/config/ConnectionConfig.js';
import { interpolateEnvVars, loadConfigFromObject } from '../../src/config/ConfigLoader.js';

describe('ConfigLoader', () => {
  describe('interpolateEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, TEST_VAR: 'test_value' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should interpolate environment variables', () => {
      const result = interpolateEnvVars('Value is ${TEST_VAR}');
      expect(result).toBe('Value is test_value');
    });

    it('should leave undefined variables unchanged', () => {
      const result = interpolateEnvVars('Value is ${UNDEFINED_VAR}');
      expect(result).toBe('Value is ${UNDEFINED_VAR}');
    });

    it('should handle multiple variables', () => {
      process.env.VAR1 = 'first';
      process.env.VAR2 = 'second';
      const result = interpolateEnvVars('${VAR1} and ${VAR2}');
      expect(result).toBe('first and second');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = {
        connections: [
          {
            id: 'test-mysql',
            name: 'Test MySQL',
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            database: 'test',
            username: 'root',
            password: 'password',
          },
        ],
      };

      const result = validateConfig(config);
      expect(result.connections).toHaveLength(1);
      expect(result.connections[0].id).toBe('test-mysql');
    });

    it('should validate SQLite config', () => {
      const config = {
        connections: [
          {
            id: 'test-sqlite',
            name: 'Test SQLite',
            type: 'sqlite',
            database: 'test',
            path: './test.db',
          },
        ],
      };

      const result = validateConfig(config);
      expect(result.connections[0].type).toBe('sqlite');
    });

    it('should apply default values', () => {
      const config = {
        connections: [
          {
            id: 'test-mysql',
            name: 'Test',
            type: 'mysql',
            host: 'localhost',
            database: 'test',
            username: 'root',
          },
        ],
      };

      const result = validateConfig(config);
      expect(result.connections[0].readonly).toBe(false);
      expect(result.connections[0].poolSize).toBe(5);
      expect(result.connections[0].timeout).toBe(30000);
    });

    it('should reject invalid type', () => {
      const config = {
        connections: [
          {
            id: 'test',
            name: 'Test',
            type: 'invalid_db',
            database: 'test',
          },
        ],
      };

      expect(() => validateConfig(config)).toThrow();
    });
  });

  describe('loadConfigFromObject', () => {
    it('should process environment variables in config', () => {
      process.env.DB_PASS = 'secret123';
      
      const config = {
        connections: [
          {
            id: 'test',
            name: 'Test',
            type: 'mysql',
            host: 'localhost',
            database: 'test',
            username: 'root',
            password: '${DB_PASS}',
          },
        ],
      };

      const result = loadConfigFromObject(config);
      expect(result.connections[0].password).toBe('secret123');
      
      delete process.env.DB_PASS;
    });
  });
});
