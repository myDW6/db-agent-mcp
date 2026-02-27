import { describe, it, expect } from 'vitest';
import { QueryValidator } from '../../src/db/query/QueryValidator.js';
import { DatabaseError } from '../../src/utils/errors.js';

describe('QueryValidator', () => {
  describe('readonly mode', () => {
    const validator = new QueryValidator(true);

    it('should block INSERT in readonly mode', () => {
      const result = validator.validate('INSERT INTO users (name) VALUES ("test")');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('只读模式下禁止执行 INSERT 操作');
    });

    it('should block UPDATE in readonly mode', () => {
      const result = validator.validate('UPDATE users SET name = "test" WHERE id = 1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('只读模式下禁止执行 UPDATE 操作');
    });

    it('should block DELETE in readonly mode', () => {
      const result = validator.validate('DELETE FROM users WHERE id = 1');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('只读模式'))).toBe(true);
    });

    it('should allow SELECT in readonly mode', () => {
      const result = validator.validate('SELECT * FROM users');
      expect(result.valid).toBe(true);
    });
  });

  describe('dangerous operations', () => {
    const validator = new QueryValidator(false);

    it('should block DELETE without WHERE', () => {
      const result = validator.validate('DELETE FROM users');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DELETE语句必须包含WHERE条件');
    });

    it('should allow DELETE with WHERE', () => {
      const result = validator.validate('DELETE FROM users WHERE id = 1');
      expect(result.valid).toBe(true);
    });

    it('should block UPDATE without WHERE', () => {
      const result = validator.validate('UPDATE users SET name = "test"');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('UPDATE语句必须包含WHERE条件');
    });

    it('should allow UPDATE with WHERE', () => {
      const result = validator.validate('UPDATE users SET name = "test" WHERE id = 1');
      expect(result.valid).toBe(true);
    });

    it('should block DROP DATABASE', () => {
      const result = validator.validate('DROP DATABASE production');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('禁止执行 DROP DATABASE 命令');
    });
  });

  describe('addLimitIfNeeded', () => {
    const validator = new QueryValidator();

    it('should add LIMIT to SELECT without LIMIT', () => {
      const sql = 'SELECT * FROM users';
      const result = validator.addLimitIfNeeded(sql, 100);
      expect(result).toBe('SELECT * FROM users LIMIT 100');
    });

    it('should not add LIMIT if already present', () => {
      const sql = 'SELECT * FROM users LIMIT 50';
      const result = validator.addLimitIfNeeded(sql, 100);
      expect(result).toBe(sql);
    });

    it('should handle SQL with semicolon', () => {
      const sql = 'SELECT * FROM users;';
      const result = validator.addLimitIfNeeded(sql, 100);
      expect(result).toBe('SELECT * FROM users LIMIT 100');
    });

    it('should not add LIMIT to non-SELECT queries', () => {
      const sql = 'SHOW TABLES';
      const result = validator.addLimitIfNeeded(sql, 100);
      expect(result).toBe(sql);
    });
  });

  describe('formatResults', () => {
    const validator = new QueryValidator();

    it('should format empty data', () => {
      const result = validator.formatResults([], ['id', 'name']);
      expect(result).toBe('无数据');
    });

    it('should format data as markdown table', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = validator.formatResults(data, ['id', 'name']);
      expect(result).toContain('| id | name');
      expect(result).toContain('| 1  | Alice');
      expect(result).toContain('| 2  | Bob');
    });

    it('should handle NULL values', () => {
      const data = [{ id: 1, name: null }];
      const result = validator.formatResults(data, ['id', 'name']);
      expect(result).toContain('NULL');
    });
  });
});
