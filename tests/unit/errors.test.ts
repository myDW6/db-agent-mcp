import { describe, it, expect } from 'vitest';
import { DatabaseError, formatErrorForMcp, isDatabaseError } from '../../src/utils/errors.js';

describe('DatabaseError', () => {
  it('should create error with message and code', () => {
    const error = new DatabaseError('Connection failed', 'CONNECTION_FAILED');
    expect(error.message).toBe('Connection failed');
    expect(error.code).toBe('CONNECTION_FAILED');
    expect(error.name).toBe('DatabaseError');
  });

  it('should store original error', () => {
    const original = new Error('Original error');
    const error = new DatabaseError('Wrapped', 'INTERNAL_ERROR', original);
    expect(error.originalError).toBe(original);
  });
});

describe('formatErrorForMcp', () => {
  it('should format DatabaseError correctly', () => {
    const error = new DatabaseError('Test error', 'TEST_ERROR');
    const result = formatErrorForMcp(error);
    
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('数据库错误 [TEST_ERROR]');
    expect(result.content[0].text).toContain('Test error');
  });

  it('should format generic Error', () => {
    const error = new Error('Generic error');
    const result = formatErrorForMcp(error);
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('错误: Generic error');
  });

  it('should format unknown error', () => {
    const result = formatErrorForMcp('string error');
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('未知错误: string error');
  });

  it('should format null error', () => {
    const result = formatErrorForMcp(null);
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('未知错误: null');
  });
});

describe('isDatabaseError', () => {
  it('should return true for DatabaseError', () => {
    const error = new DatabaseError('Test', 'TEST');
    expect(isDatabaseError(error)).toBe(true);
  });

  it('should return false for generic Error', () => {
    const error = new Error('Test');
    expect(isDatabaseError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isDatabaseError('string')).toBe(false);
    expect(isDatabaseError(null)).toBe(false);
    expect(isDatabaseError(undefined)).toBe(false);
    expect(isDatabaseError({})).toBe(false);
  });
});
