/**
 * CFSolver - Node.js HTTP client with automatic Cloudflare challenge bypass.
 * 
 * This module provides an HTTP client that automatically detects and solves
 * Cloudflare challenges using the CloudFlyer cloud API.
 * 
 * @example
 * ```typescript
 * import { CloudflareSolver } from 'cfsolver';
 * 
 * const solver = new CloudflareSolver('your-api-key');
 * const response = await solver.get('https://protected-site.com');
 * console.log(response.data);
 * ```
 * 
 * @copyright 2024 CloudFlyer Team. MIT License.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosProxyConfig } from 'axios';
import {
  CFSolverAPIError,
  CFSolverChallengeError,
  CFSolverTimeoutError,
  CFSolverConnectionError,
} from './exceptions';
import { LocalProvider } from './linksocks';

export interface CloudflareSolverOptions {
  /** CloudFlyer service URL (default: https://solver.zetx.site) */
  apiBase?: string;
  /** Enable automatic challenge solving (default: true) */
  solve?: boolean;
  /** Solve only when challenge detected (default: true) */
  onChallenge?: boolean;
  /** HTTP proxy for your requests (used as upstream proxy for LinkSocks) */
  proxy?: string | AxiosProxyConfig;
  /** Proxy for service API calls */
  apiProxy?: string | AxiosProxyConfig;
  /** Use interval polling instead of long-polling (default: false) */
  usePolling?: boolean;
  /** Interval in milliseconds between polling attempts when usePolling=true (default: 2000) */
  pollingInterval?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

export interface TaskResult {
  status: string;
  success?: boolean;
  result?: {
    cookies?: Record<string, string>;
    userAgent?: string;
    headers?: Record<string, string>;
    token?: string;
  };
  error?: string;
}

export interface CreateTaskResponse {
  taskId?: string;
  errorId?: number;
  errorDescription?: string;
}

/**
 * HTTP client that automatically bypasses Cloudflare challenges.
 */
export class CloudflareSolver {
  private apiKey: string;
  private apiBase: string;
  private solve: boolean;
  private onChallenge: boolean;
  private proxy?: string | AxiosProxyConfig;
  private apiProxy?: string | AxiosProxyConfig;
  private usePolling: boolean;
  private pollingInterval: number;
  private timeout: number;
  private verbose: boolean;
  private client: AxiosInstance;
  private apiClient: AxiosInstance;
  private cookies: Map<string, Map<string, string>> = new Map();
  private userAgent?: string;
  
  // LinkSocks provider state
  private linkSocksProvider?: LocalProvider;
  private linkSocksConfig?: { url: string; token: string; connector_token: string };
  private linkSocksConnecting: boolean = false;
  private linkSocksConnectError?: string;

  /**
   * Create a new CloudflareSolver instance.
   * 
   * @param apiKey - Your CloudFlyer API key
   * @param options - Configuration options
   */
  constructor(apiKey: string, options: CloudflareSolverOptions = {}) {
    this.apiKey = apiKey;
    this.apiBase = (options.apiBase || 'https://solver.zetx.site').replace(/\/$/, '');
    this.solve = options.solve !== false;
    this.onChallenge = options.onChallenge !== false;
    this.proxy = options.proxy;
    this.apiProxy = options.apiProxy;
    this.usePolling = options.usePolling || false;
    this.pollingInterval = options.pollingInterval || 2000;
    this.timeout = options.timeout || 30000;
    this.verbose = options.verbose || false;

    // Create HTTP client for user requests
    this.client = axios.create({
      timeout: this.timeout,
      validateStatus: () => true, // Don't throw on any status
      ...(this.proxy && { proxy: this.parseProxy(this.proxy) }),
    });

    // Create HTTP client for API requests
    this.apiClient = axios.create({
      timeout: this.timeout,
      ...(this.apiProxy && { proxy: this.parseProxy(this.apiProxy) }),
    });
  }

  /**
   * Log message if verbose mode is enabled.
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Parse proxy string to Axios proxy config.
   */
  private parseProxy(proxy: string | AxiosProxyConfig): AxiosProxyConfig | false {
    if (typeof proxy !== 'string') {
      return proxy;
    }

    try {
      const url = new URL(proxy);
      return {
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        protocol: url.protocol.replace(':', ''),
        ...(url.username && { auth: { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password || '') } }),
      };
    } catch {
      return false;
    }
  }

  /**
   * Detect if response contains a Cloudflare challenge.
   */
  private detectChallenge(response: AxiosResponse): boolean {
    if (![403, 503].includes(response.status)) {
      return false;
    }

    const server = response.headers['server'] || '';
    if (!server.toLowerCase().includes('cloudflare')) {
      return false;
    }

    const text = typeof response.data === 'string' ? response.data : '';
    return ['cf-turnstile', 'cf-challenge', 'Just a moment'].some(k => text.includes(k));
  }

  /**
   * Convert http(s) URL to ws(s) URL if needed.
   */
  private normalizeWsUrl(url: string): string {
    if (url.startsWith('https://')) {
      return 'wss://' + url.slice(8);
    } else if (url.startsWith('http://')) {
      return 'ws://' + url.slice(7);
    }
    return url;
  }

  /**
   * Get LinkSocks configuration from the API.
   */
  private async getLinkSocksConfig(): Promise<{ url: string; token: string; connector_token: string }> {
    const response = await this.apiClient.post(
      `${this.apiBase}/getLinkSocks`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (response.status !== 200) {
      const errorDetail = response.data?.detail || response.data?.error || `HTTP ${response.status}`;
      throw new CFSolverConnectionError(`Failed to get linksocks config: ${errorDetail}`);
    }

    const config = response.data;
    if (!config.url || !config.token || !config.connector_token) {
      throw new CFSolverConnectionError('Invalid linksocks config received from server');
    }

    return {
      url: this.normalizeWsUrl(config.url),
      token: config.token,
      connector_token: config.connector_token,
    };
  }

  /**
   * Parse upstream proxy string for LinkSocks provider.
   */
  private parseUpstreamProxy(proxy?: string | AxiosProxyConfig): {
    host?: string;
    username?: string;
    password?: string;
    type?: 'socks5' | 'http';
  } {
    if (!proxy) {
      return {};
    }

    if (typeof proxy !== 'string') {
      const host = proxy.host && proxy.port ? `${proxy.host}:${proxy.port}` : undefined;
      return {
        host,
        username: proxy.auth?.username,
        password: proxy.auth?.password,
        type: proxy.protocol === 'socks5' ? 'socks5' : 'http',
      };
    }

    try {
      const url = new URL(proxy);
      const host = url.hostname && url.port ? `${url.hostname}:${url.port}` : undefined;
      return {
        host,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        type: url.protocol === 'socks5:' ? 'socks5' : 'http',
      };
    } catch {
      return {};
    }
  }

  /**
   * Connect to LinkSocks relay server as a provider.
   */
  private async connectLinkSocks(): Promise<void> {
    if (this.linkSocksProvider?.isConnected()) {
      return;
    }

    if (this.linkSocksConnecting) {
      // Wait for existing connection attempt
      await new Promise<void>((resolve) => {
        const checkInterval: NodeJS.Timeout = setInterval(() => {
          if (!this.linkSocksConnecting) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      return;
    }

    this.linkSocksConnecting = true;
    this.linkSocksConnectError = undefined;

    try {
      // Get LinkSocks config from API
      this.linkSocksConfig = await this.getLinkSocksConfig();
      this.log(`LinkSocks config received: ${this.linkSocksConfig.url}`);

      // Parse upstream proxy settings
      const upstreamProxy = this.parseUpstreamProxy(this.proxy);

      // Create and connect provider
      this.linkSocksProvider = new LocalProvider({
        serverUrl: this.linkSocksConfig.url,
        token: this.linkSocksConfig.token,
        debug: false,
        silent: !this.verbose,
        reconnectInterval: 5000,
        maxReconnectAttempts: 3,
        connectTimeout: 10000,
        upstreamProxy: upstreamProxy.host,
        upstreamProxyType: upstreamProxy.type,
        upstreamUsername: upstreamProxy.username,
        upstreamPassword: upstreamProxy.password,
      });

      await this.linkSocksProvider.connect();
      this.log('LinkSocks Provider connected successfully');
    } catch (error) {
      this.linkSocksConnectError = error instanceof Error ? error.message : String(error);
      console.error(`LinkSocks connection failed: ${this.linkSocksConnectError}`);
      throw new CFSolverConnectionError(`Failed to connect to LinkSocks: ${this.linkSocksConnectError}`);
    } finally {
      this.linkSocksConnecting = false;
    }
  }

  /**
   * Solve a Cloudflare challenge for the given URL.
   * Returns the solved cookies and user agent.
   */
  async solveCloudflare(url: string): Promise<{ cookies: Record<string, string>; userAgent: string }> {
    this.log(`Starting challenge solve: ${url}`);

    // Connect to LinkSocks (required for challenge solving)
    await this.connectLinkSocks();

    if (!this.linkSocksConfig) {
      throw new CFSolverConnectionError('LinkSocks connection required but not established');
    }

    const task: Record<string, unknown> = {
      type: 'CloudflareTask',
      websiteURL: url,
      linksocks: {
        url: this.linkSocksConfig.url,
        token: this.linkSocksConfig.connector_token,
      },
    };

    const response = await this.apiClient.post<CreateTaskResponse>(
      `${this.apiBase}/api/createTask`,
      {
        apiKey: this.apiKey,
        task,
      }
    );

    if (response.data.errorId) {
      throw new CFSolverChallengeError(`Challenge solve failed: ${response.data.errorDescription}`);
    }

    const taskId = response.data.taskId;
    if (!taskId) {
      throw new CFSolverChallengeError('Challenge solve failed: no taskId returned');
    }

    this.log(`Task created: ${taskId}`);

    const result = await this.waitForResult(taskId);

    // Extract solution from result
    const workerResult = result.result || {};
    const solution = (workerResult as any).result || workerResult;

    const cookies = solution.cookies || {};
    const userAgent = solution.userAgent || solution.headers?.['User-Agent'] || '';

    // Store cookies for the domain
    const domain = new URL(url).hostname;
    if (!this.cookies.has(domain)) {
      this.cookies.set(domain, new Map());
    }
    const domainCookies = this.cookies.get(domain)!;
    for (const [key, value] of Object.entries(cookies)) {
      domainCookies.set(key, value as string);
    }

    if (userAgent) {
      this.userAgent = userAgent;
    }

    this.log('Challenge solved successfully');
    return { cookies, userAgent };
  }

  /**
   * Internal method to solve challenge (used by request methods).
   */
  private async solveChallenge(url: string): Promise<void> {
    await this.solveCloudflare(url);
  }

  /**
   * Wait for task result using either long-polling or interval polling.
   */
  private async waitForResult(taskId: string, timeout: number = 120): Promise<TaskResult> {
    const start = Date.now();

    while ((Date.now() - start) / 1000 < timeout) {
      const endpoint = this.usePolling
        ? `${this.apiBase}/api/getTaskResult`
        : `${this.apiBase}/api/waitTaskResult`;

      const requestTimeout = this.usePolling
        ? 30000
        : Math.min((timeout - (Date.now() - start) / 1000 + 10) * 1000, 310000);

      try {
        const response = await this.apiClient.post<TaskResult>(
          endpoint,
          { apiKey: this.apiKey, taskId },
          { timeout: requestTimeout }
        );

        if (response.status !== 200) {
          if (this.usePolling) {
            await this.sleep(this.pollingInterval);
          }
          continue;
        }

        const result = response.data;
        const status = result.status;

        if (status === 'processing') {
          if (this.usePolling) {
            await this.sleep(this.pollingInterval);
          }
          continue;
        }

        if (status === 'timeout') {
          continue;
        }

        const success = typeof result.success === 'boolean'
          ? result.success
          : ['completed', 'ready'].includes(status) && !result.error;

        if (!success) {
          const error = result.error || (result as any).result?.error || `Unknown error`;
          throw new CFSolverChallengeError(`Task failed: ${error}`);
        }

        return result;
      } catch (error) {
        if (error instanceof CFSolverChallengeError) {
          throw error;
        }
        if (this.usePolling) {
          await this.sleep(this.pollingInterval);
        }
      }
    }

    throw new CFSolverTimeoutError('Task timed out');
  }

  /**
   * Solve a Turnstile challenge and return the token.
   * 
   * @param url - The website URL containing the Turnstile widget
   * @param sitekey - The Turnstile sitekey
   * @returns The solved Turnstile token
   */
  async solveTurnstile(url: string, sitekey: string): Promise<string> {
    this.log(`Starting Turnstile solve: ${url}`);

    // Connect to LinkSocks (required for challenge solving)
    await this.connectLinkSocks();

    if (!this.linkSocksConfig) {
      throw new CFSolverConnectionError('LinkSocks connection required but not established');
    }

    const task: Record<string, unknown> = {
      type: 'TurnstileTask',
      websiteURL: url,
      websiteKey: sitekey,
      linksocks: {
        url: this.linkSocksConfig.url,
        token: this.linkSocksConfig.connector_token,
      },
    };

    const response = await this.apiClient.post<CreateTaskResponse>(
      `${this.apiBase}/api/createTask`,
      {
        apiKey: this.apiKey,
        task,
      }
    );

    if (response.data.errorId) {
      throw new CFSolverChallengeError(`Turnstile solve failed: ${response.data.errorDescription}`);
    }

    const taskId = response.data.taskId;
    if (!taskId) {
      throw new CFSolverChallengeError('Turnstile solve failed: no taskId returned');
    }

    const result = await this.waitForResult(taskId);

    const workerResult = result.result || {};
    const solution = (workerResult as any).result || workerResult;
    const token = solution.token;

    if (!token) {
      throw new CFSolverChallengeError('Turnstile solve failed: no token returned');
    }

    this.log('Turnstile solved successfully');
    return token;
  }

  /**
   * Build request config with cookies and user agent.
   */
  private buildRequestConfig(url: string, config: AxiosRequestConfig = {}): AxiosRequestConfig {
    const domain = new URL(url).hostname;
    const domainCookies = this.cookies.get(domain);

    const headers: Record<string, string> = { ...(config.headers as Record<string, string>) };

    if (domainCookies && domainCookies.size > 0) {
      const cookieStr = Array.from(domainCookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      headers['Cookie'] = cookieStr;
    }

    if (this.userAgent) {
      headers['User-Agent'] = this.userAgent;
    }

    return { ...config, headers };
  }

  /**
   * Make an HTTP request with automatic challenge bypass.
   */
  async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const url = config.url!;

    if (!this.solve) {
      return this.client.request<T>(this.buildRequestConfig(url, config));
    }

    if (!this.onChallenge) {
      try {
        await this.solveChallenge(url);
      } catch (e) {
        console.warn(`Pre-solve failed: ${e}`);
      }
    }

    let response = await this.client.request<T>(this.buildRequestConfig(url, config));

    if (this.onChallenge && this.detectChallenge(response)) {
      this.log('Cloudflare challenge detected');
      await this.solveChallenge(url);
      response = await this.client.request<T>(this.buildRequestConfig(url, config));
    }

    return response;
  }

  /**
   * Make a GET request.
   */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  /**
   * Make a POST request.
   */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  /**
   * Make a PUT request.
   */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  /**
   * Make a DELETE request.
   */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  /**
   * Make a PATCH request.
   */
  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  /**
   * Make a HEAD request.
   */
  async head<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'HEAD', url });
  }

  /**
   * Make an OPTIONS request.
   */
  async options<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'OPTIONS', url });
  }

  /**
   * Close the solver and clean up resources.
   * Call this when you're done using the solver to properly close LinkSocks connection.
   */
  close(): void {
    if (this.linkSocksProvider) {
      this.linkSocksProvider.close();
      this.linkSocksProvider = undefined;
      this.linkSocksConfig = undefined;
      this.log('LinkSocks Provider closed');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
