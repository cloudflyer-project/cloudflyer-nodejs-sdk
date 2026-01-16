import {
  CloudflareSolver,
  CFSolverError,
  CFSolverAPIError,
  CFSolverChallengeError,
  CFSolverTimeoutError,
  CFSolverConnectionError,
  LocalProvider,
  VERSION,
} from '../src/index';

describe('Module Exports', () => {
  it('should export CloudflareSolver', () => {
    expect(CloudflareSolver).toBeDefined();
    expect(typeof CloudflareSolver).toBe('function');
  });

  it('should export all error classes', () => {
    expect(CFSolverError).toBeDefined();
    expect(CFSolverAPIError).toBeDefined();
    expect(CFSolverChallengeError).toBeDefined();
    expect(CFSolverTimeoutError).toBeDefined();
    expect(CFSolverConnectionError).toBeDefined();
  });

  it('should export LocalProvider', () => {
    expect(LocalProvider).toBeDefined();
    expect(typeof LocalProvider).toBe('function');
  });

  it('should export VERSION', () => {
    expect(VERSION).toBeDefined();
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
