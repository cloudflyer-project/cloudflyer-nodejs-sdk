# CFSolver Node.js SDK

[![npm version](https://badge.fury.io/js/cfsolver.svg)](https://badge.fury.io/js/cfsolver)
[![Node.js 16+](https://img.shields.io/badge/node-16+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Node.js HTTP client that automatically bypasses Cloudflare challenges using the [CloudFlyer](https://cloudflyer.zetx.site) API. Uses LinkSocks tunnel technology for secure challenge solving.

## Features

- **Axios-like API** - Familiar HTTP client interface (get, post, put, delete, etc.)
- **Automatic challenge detection** - Detects Cloudflare protection and solves transparently
- **LinkSocks tunnel** - Secure WebSocket-based tunnel for challenge solving
- **Turnstile support** - Solve Cloudflare Turnstile CAPTCHA and get tokens
- **CLI tool** - Command-line interface for quick operations
- **TypeScript support** - Full type definitions included
- **Upstream proxy support** - Route traffic through your own proxy

## Installation

```bash
npm install cfsolver
```

## Quick Start

```typescript
import { CloudflareSolver } from 'cfsolver';

const solver = new CloudflareSolver('your-api-key');

try {
  // Make a request with automatic bypass
  const response = await solver.get('https://protected-site.com');
  console.log(response.data);
} finally {
  solver.close(); // Clean up LinkSocks connection
}
```

## API Reference

### CloudflareSolver

```typescript
const solver = new CloudflareSolver(apiKey: string, options?: CloudflareSolverOptions);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiBase` | `string` | `https://solver.zetx.site` | CloudFlyer service URL |
| `solve` | `boolean` | `true` | Enable automatic challenge solving |
| `onChallenge` | `boolean` | `true` | Solve only when challenge detected (false = pre-solve) |
| `proxy` | `string \| AxiosProxyConfig` | - | Upstream proxy for LinkSocks tunnel |
| `apiProxy` | `string \| AxiosProxyConfig` | - | Proxy for CloudFlyer API calls |
| `usePolling` | `boolean` | `false` | Use interval polling instead of long-polling |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `verbose` | `boolean` | `false` | Enable verbose logging |

### HTTP Methods

```typescript
// GET request
const response = await solver.get(url, config?);

// POST request
const response = await solver.post(url, data?, config?);

// PUT request
const response = await solver.put(url, data?, config?);

// DELETE request
const response = await solver.delete(url, config?);

// PATCH request
const response = await solver.patch(url, data?, config?);

// HEAD request
const response = await solver.head(url, config?);

// OPTIONS request
const response = await solver.options(url, config?);

// Generic request
const response = await solver.request(config);
```

### Direct Challenge Solving

```typescript
// Solve Cloudflare challenge directly (returns cookies and user agent)
const result = await solver.solveCloudflare('https://protected-site.com');
console.log(result.cookies);   // { cf_clearance: '...', ... }
console.log(result.userAgent); // Browser user agent string
```

### Turnstile Support

```typescript
// Solve a Turnstile challenge
const token = await solver.solveTurnstile(
  'https://example.com/page-with-turnstile',
  '0x4AAAAAAA...' // Turnstile sitekey
);

// Use the token in your form submission
await solver.post('https://example.com/submit', {
  'cf-turnstile-response': token,
});
```

### Resource Cleanup

Always call `close()` when done to properly close the LinkSocks connection:

```typescript
const solver = new CloudflareSolver('your-api-key');
try {
  // ... your operations
} finally {
  solver.close();
}
```

## CLI Usage

The package includes a command-line tool:

```bash
# Set API key
export CLOUDFLYER_API_KEY=your_api_key
# Or on Windows:
set CLOUDFLYER_API_KEY=your_api_key

# Solve Cloudflare challenge
npx cfsolver solve cloudflare https://protected-site.com

# Solve Turnstile challenge
npx cfsolver solve turnstile https://example.com 0x4AAAAAAA...

# Make HTTP request with automatic bypass
npx cfsolver request https://protected-site.com

# Check account balance
npx cfsolver balance

# Show help
npx cfsolver help
```

### CLI Options

```
Global Options:
  -K, --api-key <key>     API key (or set CLOUDFLYER_API_KEY env var)
  -B, --api-base <url>    API base URL (default: https://solver.zetx.site)
  -v, --verbose           Enable verbose output

Solve Options:
  -X, --proxy <url>       Upstream proxy (scheme://host:port)
  --api-proxy <url>       Proxy for API calls
  -T, --timeout <sec>     Timeout in seconds (default: 120)
  --json                  Output result as JSON

Request Options:
  -m, --method <method>   HTTP method (default: GET)
  -d, --data <data>       Request body (JSON)
  -H, --header <header>   Request header (repeatable)
  -o, --output <file>     Save response to file
```

## Examples

### Basic Usage

```typescript
import { CloudflareSolver } from 'cfsolver';

async function main() {
  const solver = new CloudflareSolver(process.env.CLOUDFLYER_API_KEY!);
  
  try {
    const response = await solver.get('https://protected-site.com');
    console.log('Status:', response.status);
    console.log('Data:', response.data);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    solver.close();
  }
}

main();
```

### With Upstream Proxy

```typescript
import { CloudflareSolver } from 'cfsolver';

// The proxy is used as upstream for the LinkSocks tunnel
const solver = new CloudflareSolver('your-api-key', {
  proxy: 'http://user:pass@proxy.example.com:8080',
});

try {
  const response = await solver.get('https://protected-site.com');
} finally {
  solver.close();
}
```

### Pre-solve Mode

```typescript
import { CloudflareSolver } from 'cfsolver';

// Always solve challenge before making request
const solver = new CloudflareSolver('your-api-key', {
  onChallenge: false,
});

try {
  const response = await solver.get('https://protected-site.com');
} finally {
  solver.close();
}
```

### Disable Solving

```typescript
import { CloudflareSolver } from 'cfsolver';

// Use as a regular HTTP client without solving
const solver = new CloudflareSolver('your-api-key', {
  solve: false,
});

const response = await solver.get('https://regular-site.com');
// No need to call close() when solve is disabled
```

### Run Example Scripts

```bash
npm install

# Set environment variables
set CLOUDFLYER_API_KEY=your_api_key
set CLOUDFLYER_API_BASE=https://solver.zetx.site

# Run examples
npx ts-node examples/sdk_challenge.ts
npx ts-node examples/sdk_turnstile.ts

# With upstream proxy
npx ts-node examples/sdk_challenge.ts --proxy http://user:pass@host:port
```

## Error Handling

```typescript
import { 
  CloudflareSolver, 
  CFSolverError,
  CFSolverAPIError,
  CFSolverChallengeError,
  CFSolverTimeoutError,
  CFSolverConnectionError,
} from 'cfsolver';

const solver = new CloudflareSolver('your-api-key');

try {
  const response = await solver.get('https://protected-site.com');
} catch (error) {
  if (error instanceof CFSolverConnectionError) {
    console.error('LinkSocks connection failed:', error.message);
  } else if (error instanceof CFSolverTimeoutError) {
    console.error('Challenge solving timed out');
  } else if (error instanceof CFSolverChallengeError) {
    console.error('Failed to solve challenge:', error.message);
  } else if (error instanceof CFSolverAPIError) {
    console.error('API error:', error.message);
  } else if (error instanceof CFSolverError) {
    console.error('CFSolver error:', error.message);
  } else {
    throw error;
  }
}
```

## Environment Variables

You can set the API key via environment variable:

```bash
export CLOUDFLYER_API_KEY="your-api-key"
```

```typescript
const solver = new CloudflareSolver(process.env.CLOUDFLYER_API_KEY!);
```

## License

MIT License - see [LICENSE](LICENSE) for details.
