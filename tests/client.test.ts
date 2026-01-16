import { CloudflareSolver } from '../src/client';

describe('CloudflareSolver', () => {
  describe('constructor', () => {
    it('should create instance with API key', () => {
      const solver = new CloudflareSolver('test-api-key');
      expect(solver).toBeInstanceOf(CloudflareSolver);
    });

    it('should use default options', () => {
      const solver = new CloudflareSolver('test-api-key');
      expect(solver).toBeDefined();
    });

    it('should accept custom options', () => {
      const solver = new CloudflareSolver('test-api-key', {
        apiBase: 'https://custom.api.com',
        solve: false,
        onChallenge: false,
        timeout: 60000,
        verbose: true,
      });
      expect(solver).toBeDefined();
    });

    it('should accept proxy configuration', () => {
      const solver = new CloudflareSolver('test-api-key', {
        proxy: 'http://127.0.0.1:8080',
      });
      expect(solver).toBeDefined();
    });

    it('should accept proxy object configuration', () => {
      const solver = new CloudflareSolver('test-api-key', {
        proxy: {
          host: '127.0.0.1',
          port: 8080,
        },
      });
      expect(solver).toBeDefined();
    });
  });

  describe('close', () => {
    it('should close without error', () => {
      const solver = new CloudflareSolver('test-api-key');
      expect(() => solver.close()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      const solver = new CloudflareSolver('test-api-key');
      solver.close();
      expect(() => solver.close()).not.toThrow();
    });
  });
});
