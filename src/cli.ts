#!/usr/bin/env node
/**
 * CFSolver CLI - Command line interface for CloudFlyer API.
 *
 * Usage:
 *   npx cfsolver solve cloudflare <url>
 *   npx cfsolver solve turnstile <url> <sitekey>
 *   npx cfsolver request <url>
 *   npx cfsolver balance
 */

import { CloudflareSolver } from './client';
import { VERSION } from './index';
import axios from 'axios';

interface GlobalOptions {
  apiKey: string;
  apiBase: string;
  verbose: boolean;
}

function parseGlobalOptions(): GlobalOptions {
  const apiKey = getArgValue('-K') || getArgValue('--api-key') || process.env.CLOUDFLYER_API_KEY || '';
  const apiBase = getArgValue('-B') || getArgValue('--api-base') || process.env.CLOUDFLYER_API_BASE || 'https://solver.zetx.site';
  const verbose = hasFlag('-v') || hasFlag('--verbose');
  return { apiKey, apiBase, verbose };
}

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function getPositionalArgs(): string[] {
  const args: string[] = [];
  let skipNext = false;
  
  for (let i = 2; i < process.argv.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const arg = process.argv[i];
    if (arg.startsWith('-')) {
      // Check if this flag takes a value
      if (['-K', '--api-key', '-B', '--api-base', '-X', '--proxy', '--api-proxy', '-m', '--method', '-d', '--data', '-H', '--header', '-o', '--output', '-T', '--timeout'].includes(arg)) {
        skipNext = true;
      }
      continue;
    }
    args.push(arg);
  }
  return args;
}

function requireAPIKey(options: GlobalOptions): void {
  if (!options.apiKey) {
    console.error('Error: API key required. Use -K/--api-key or set CLOUDFLYER_API_KEY environment variable.');
    process.exit(1);
  }
}

function printJSON(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

function printHelp(): void {
  console.log(`CFSolver CLI v${VERSION} - Cloudflare challenge solver using CloudFlyer API

Usage:
  cfsolver <command> [options]

Commands:
  solve cloudflare <url>              Solve Cloudflare challenge for a URL
  solve turnstile <url> <sitekey>     Solve Turnstile challenge and get token
  request <url>                       Make HTTP request with automatic challenge bypass
  balance                             Check account balance
  help                                Show this help message
  version                             Show version

Global Options:
  -K, --api-key <key>     API key (or set CLOUDFLYER_API_KEY env var)
  -B, --api-base <url>    API base URL (default: https://solver.zetx.site)
  -v, --verbose           Enable verbose output

Solve Cloudflare Options:
  -X, --proxy <url>       Proxy for HTTP requests (scheme://host:port)
  --api-proxy <url>       Proxy for API calls (scheme://host:port)
  -T, --timeout <sec>     Timeout in seconds (default: 120)
  --json                  Output result as JSON

Solve Turnstile Options:
  --api-proxy <url>       Proxy for API calls (scheme://host:port)
  -T, --timeout <sec>     Timeout in seconds (default: 120)
  --json                  Output result as JSON

Request Options:
  -X, --proxy <url>       Proxy for HTTP requests (scheme://host:port)
  --api-proxy <url>       Proxy for API calls (scheme://host:port)
  -m, --method <method>   HTTP method (default: GET)
  -d, --data <data>       Request body data
  -H, --header <header>   Request header (can be used multiple times)
  -o, --output <file>     Output file path
  --json                  Output response info as JSON

Examples:
  cfsolver solve cloudflare https://example.com
  cfsolver solve turnstile https://example.com 0x4AAAAAAA...
  cfsolver request https://example.com
  cfsolver request -m POST -d '{"key":"value"}' https://api.example.com
  cfsolver balance
`);
}

async function solveCloudflare(url: string, options: GlobalOptions): Promise<void> {
  requireAPIKey(options);
  
  const proxy = getArgValue('-X') || getArgValue('--proxy');
  const apiProxy = getArgValue('--api-proxy');
  const timeout = parseInt(getArgValue('-T') || getArgValue('--timeout') || '120', 10);
  const outputJSON = hasFlag('--json');

  if (!outputJSON) {
    console.log(`[*] Target URL: ${url}`);
    console.log(`[*] API Base: ${options.apiBase}`);
    if (proxy) {
      console.log(`[*] Proxy: ${proxy}`);
    }
    if (apiProxy) {
      console.log(`[*] API Proxy: ${apiProxy}`);
    }
    console.log(`[*] Timeout: ${timeout}s`);
    console.log();
  }

  const solver = new CloudflareSolver(options.apiKey, {
    apiBase: options.apiBase,
    proxy,
    apiProxy,
    timeout: timeout * 1000,
    verbose: options.verbose,
  });

  const startTime = Date.now();

  try {
    const result = await solver.solveCloudflare(url);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (outputJSON) {
      printJSON({
        success: true,
        url,
        cookies: result.cookies,
        user_agent: result.userAgent,
        elapsed_seconds: elapsed,
      });
    } else {
      console.log();
      console.log(`[+] Challenge solved successfully! (${elapsed}s)`);
      if (result.userAgent) {
        console.log(`    User-Agent: ${result.userAgent}`);
      }
      if (Object.keys(result.cookies).length > 0) {
        console.log('    Cookies:');
        for (const [k, v] of Object.entries(result.cookies)) {
          console.log(`      ${k}: ${v}`);
        }
      } else {
        console.log('    Cookies: (none)');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (outputJSON) {
      printJSON({ success: false, error: message });
    } else {
      console.error(`[x] Error: ${message}`);
    }
    process.exit(1);
  } finally {
    solver.close();
  }
}

async function solveTurnstile(url: string, sitekey: string, options: GlobalOptions): Promise<void> {
  requireAPIKey(options);

  const apiProxy = getArgValue('--api-proxy');
  const timeout = parseInt(getArgValue('-T') || getArgValue('--timeout') || '120', 10);
  const outputJSON = hasFlag('--json');

  if (!outputJSON) {
    console.log(`[*] Target URL: ${url}`);
    console.log(`[*] Site Key: ${sitekey}`);
    console.log(`[*] API Base: ${options.apiBase}`);
    if (apiProxy) {
      console.log(`[*] API Proxy: ${apiProxy}`);
    }
    console.log(`[*] Timeout: ${timeout}s`);
    console.log();
  }

  const solver = new CloudflareSolver(options.apiKey, {
    apiBase: options.apiBase,
    apiProxy,
    timeout: timeout * 1000,
    verbose: options.verbose,
  });

  const startTime = Date.now();

  try {
    const token = await solver.solveTurnstile(url, sitekey);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    if (outputJSON) {
      printJSON({
        success: true,
        url,
        sitekey,
        token,
        elapsed_seconds: elapsed,
      });
    } else {
      console.log();
      console.log(`[+] Turnstile solved successfully! (${elapsed}s)`);
      const tokenPreview = token.length > 80 ? token.slice(0, 80) + '...' : token;
      console.log(`    Token: ${tokenPreview}`);
      console.log(`    Token length: ${token.length}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (outputJSON) {
      printJSON({ success: false, error: message });
    } else {
      console.error(`[x] Error: ${message}`);
    }
    process.exit(1);
  } finally {
    solver.close();
  }
}

async function makeRequest(url: string, options: GlobalOptions): Promise<void> {
  requireAPIKey(options);

  const proxy = getArgValue('-X') || getArgValue('--proxy');
  const method = (getArgValue('-m') || getArgValue('--method') || 'GET').toUpperCase();
  const data = getArgValue('-d') || getArgValue('--data');
  const output = getArgValue('-o') || getArgValue('--output');
  const outputJSON = hasFlag('--json');

  // Collect all headers
  const headers: Record<string, string> = {};
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '-H' || process.argv[i] === '--header') {
      const headerValue = process.argv[i + 1];
      if (headerValue) {
        const colonIndex = headerValue.indexOf(':');
        if (colonIndex > 0) {
          const key = headerValue.slice(0, colonIndex).trim();
          const value = headerValue.slice(colonIndex + 1).trim();
          headers[key] = value;
        }
      }
    }
  }

  if (options.verbose) {
    console.log(`Making ${method} request to: ${url}`);
  }

  const solver = new CloudflareSolver(options.apiKey, {
    apiBase: options.apiBase,
    solve: true,
    onChallenge: true,
    proxy,
    verbose: options.verbose,
  });

  try {
    let response;
    
    switch (method) {
      case 'GET':
        response = await solver.get(url, { headers });
        break;
      case 'POST':
        response = await solver.post(url, data ? JSON.parse(data) : undefined, { headers });
        break;
      case 'PUT':
        response = await solver.put(url, data ? JSON.parse(data) : undefined, { headers });
        break;
      case 'DELETE':
        response = await solver.delete(url, { headers });
        break;
      case 'PATCH':
        response = await solver.patch(url, data ? JSON.parse(data) : undefined, { headers });
        break;
      case 'HEAD':
        response = await solver.head(url, { headers });
        break;
      case 'OPTIONS':
        response = await solver.options(url, { headers });
        break;
      default:
        console.error(`Unsupported method: ${method}`);
        process.exit(1);
    }

    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    if (output) {
      const fs = await import('fs');
      fs.writeFileSync(output, body);
      console.log(`[+] Response saved to: ${output}`);
    } else if (outputJSON) {
      const respHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        if (typeof v === 'string') {
          respHeaders[k] = v;
        } else if (Array.isArray(v) && v.length > 0) {
          respHeaders[k] = v[0];
        }
      }
      printJSON({
        url,
        method,
        status_code: response.status,
        headers: respHeaders,
        content_length: body.length,
      });
    } else {
      console.log(body);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (outputJSON) {
      printJSON({ success: false, error: message });
    } else {
      console.error(`[x] Error: ${message}`);
    }
    process.exit(1);
  } finally {
    solver.close();
  }
}

async function checkBalance(options: GlobalOptions): Promise<void> {
  requireAPIKey(options);

  try {
    const response = await axios.post(`${options.apiBase}/api/getBalance`, {
      apiKey: options.apiKey,
    }, { timeout: 30000 });

    if (response.data.errorId) {
      console.error(`[x] Error: ${response.data.errorDescription}`);
      process.exit(1);
    }

    console.log(`[+] Balance: ${response.data.balance}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[x] Error: ${message}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseGlobalOptions();
  const args = getPositionalArgs();

  if (args.length === 0 || args[0] === 'help' || hasFlag('-h') || hasFlag('--help')) {
    printHelp();
    return;
  }

  if (args[0] === 'version' || hasFlag('--version')) {
    console.log(`cfsolver v${VERSION}`);
    return;
  }

  const command = args[0];

  switch (command) {
    case 'solve':
      if (args.length < 2) {
        console.error('Error: solve requires a subcommand (cloudflare or turnstile)');
        process.exit(1);
      }
      const solveType = args[1];
      if (solveType === 'cloudflare') {
        if (args.length < 3) {
          console.error('Error: solve cloudflare requires a URL');
          process.exit(1);
        }
        await solveCloudflare(args[2], options);
      } else if (solveType === 'turnstile') {
        if (args.length < 4) {
          console.error('Error: solve turnstile requires a URL and sitekey');
          process.exit(1);
        }
        await solveTurnstile(args[2], args[3], options);
      } else {
        console.error(`Error: Unknown solve type: ${solveType}`);
        process.exit(1);
      }
      break;

    case 'request':
      if (args.length < 2) {
        console.error('Error: request requires a URL');
        process.exit(1);
      }
      await makeRequest(args[1], options);
      break;

    case 'balance':
      await checkBalance(options);
      break;

    default:
      console.error(`Error: Unknown command: ${command}`);
      console.error('Run "cfsolver help" for usage information');
      process.exit(1);
  }
}

main().catch(error => {
  console.error(`[x] Fatal error: ${error.message}`);
  process.exit(1);
});
