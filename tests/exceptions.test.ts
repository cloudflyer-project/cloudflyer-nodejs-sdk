import {
  CFSolverError,
  CFSolverAPIError,
  CFSolverChallengeError,
  CFSolverTimeoutError,
  CFSolverConnectionError,
} from '../src/exceptions';

describe('CFSolver Exceptions', () => {
  describe('CFSolverError', () => {
    it('should create error with correct message', () => {
      const error = new CFSolverError('test error');
      expect(error.message).toBe('test error');
      expect(error.name).toBe('CFSolverError');
    });

    it('should be instance of Error', () => {
      const error = new CFSolverError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CFSolverError);
    });
  });

  describe('CFSolverAPIError', () => {
    it('should create error with correct message and name', () => {
      const error = new CFSolverAPIError('API failed');
      expect(error.message).toBe('API failed');
      expect(error.name).toBe('CFSolverAPIError');
    });

    it('should be instance of CFSolverError', () => {
      const error = new CFSolverAPIError('test');
      expect(error).toBeInstanceOf(CFSolverError);
      expect(error).toBeInstanceOf(CFSolverAPIError);
    });
  });

  describe('CFSolverChallengeError', () => {
    it('should create error with correct message and name', () => {
      const error = new CFSolverChallengeError('Challenge failed');
      expect(error.message).toBe('Challenge failed');
      expect(error.name).toBe('CFSolverChallengeError');
    });

    it('should be instance of CFSolverError', () => {
      const error = new CFSolverChallengeError('test');
      expect(error).toBeInstanceOf(CFSolverError);
      expect(error).toBeInstanceOf(CFSolverChallengeError);
    });
  });

  describe('CFSolverTimeoutError', () => {
    it('should create error with correct message and name', () => {
      const error = new CFSolverTimeoutError('Operation timed out');
      expect(error.message).toBe('Operation timed out');
      expect(error.name).toBe('CFSolverTimeoutError');
    });

    it('should be instance of CFSolverError', () => {
      const error = new CFSolverTimeoutError('test');
      expect(error).toBeInstanceOf(CFSolverError);
      expect(error).toBeInstanceOf(CFSolverTimeoutError);
    });
  });

  describe('CFSolverConnectionError', () => {
    it('should create error with correct message and name', () => {
      const error = new CFSolverConnectionError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('CFSolverConnectionError');
    });

    it('should be instance of CFSolverError', () => {
      const error = new CFSolverConnectionError('test');
      expect(error).toBeInstanceOf(CFSolverError);
      expect(error).toBeInstanceOf(CFSolverConnectionError);
    });
  });
});
