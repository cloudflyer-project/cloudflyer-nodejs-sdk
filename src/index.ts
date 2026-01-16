/**
 * CFSolver - Node.js SDK for CloudFlyer API
 * 
 * Automatically bypass Cloudflare challenges using the CloudFlyer cloud service.
 * Uses LinkSocks tunnel for secure challenge solving.
 * 
 * @example
 * ```typescript
 * import { CloudflareSolver } from 'cfsolver';
 * 
 * const solver = new CloudflareSolver('your-api-key');
 * try {
 *   const response = await solver.get('https://protected-site.com');
 *   console.log(response.data);
 * } finally {
 *   solver.close(); // Clean up LinkSocks connection
 * }
 * ```
 * 
 * @example With upstream proxy
 * ```typescript
 * import { CloudflareSolver } from 'cfsolver';
 * 
 * const solver = new CloudflareSolver('your-api-key', {
 *   proxy: 'http://127.0.0.1:1080' // Used as upstream proxy for LinkSocks
 * });
 * try {
 *   const response = await solver.get('https://protected-site.com');
 *   console.log(response.data);
 * } finally {
 *   solver.close();
 * }
 * ```
 */

export { CloudflareSolver, CloudflareSolverOptions, TaskResult, CreateTaskResponse } from './client';
export {
  CFSolverError,
  CFSolverAPIError,
  CFSolverChallengeError,
  CFSolverTimeoutError,
  CFSolverConnectionError,
} from './exceptions';
export { LocalProvider, ProviderOptions } from './linksocks';

export const VERSION = '0.3.0';
