/**
 * CFSolver Exceptions
 * 
 * Custom error classes for the CFSolver library.
 */

/**
 * Base error for all CFSolver errors.
 */
export class CFSolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CFSolverError';
    Object.setPrototypeOf(this, CFSolverError.prototype);
  }
}

/**
 * Raised when API request fails.
 */
export class CFSolverAPIError extends CFSolverError {
  constructor(message: string) {
    super(message);
    this.name = 'CFSolverAPIError';
    Object.setPrototypeOf(this, CFSolverAPIError.prototype);
  }
}

/**
 * Raised when challenge solving fails.
 */
export class CFSolverChallengeError extends CFSolverError {
  constructor(message: string) {
    super(message);
    this.name = 'CFSolverChallengeError';
    Object.setPrototypeOf(this, CFSolverChallengeError.prototype);
  }
}

/**
 * Raised when operation times out.
 */
export class CFSolverTimeoutError extends CFSolverError {
  constructor(message: string) {
    super(message);
    this.name = 'CFSolverTimeoutError';
    Object.setPrototypeOf(this, CFSolverTimeoutError.prototype);
  }
}

/**
 * Raised when connection to service fails.
 */
export class CFSolverConnectionError extends CFSolverError {
  constructor(message: string) {
    super(message);
    this.name = 'CFSolverConnectionError';
    Object.setPrototypeOf(this, CFSolverConnectionError.prototype);
  }
}
