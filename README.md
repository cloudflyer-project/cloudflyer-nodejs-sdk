# CFSolver Node.js SDK

[![npm version](https://badge.fury.io/js/cfsolver.svg)](https://badge.fury.io/js/cfsolver)
[![Node.js 16+](https://img.shields.io/badge/node-16+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Node.js HTTP client that automatically bypasses Cloudflare challenges using the [CloudFlyer](https://cloudflyer.zetx.site) API.

## Features

- **Axios-like API** - Familiar HTTP client interface (get, post, put, delete, etc.)
- **Automatic challenge detection** - Detects Cloudflare protection and solves transparently
- **Multiple solving modes** - Auto-detect, always pre-solve, or disable
- **Turnstile support** - Solve Cloudflare Turnstile CAPTCHA and get tokens
- **TypeScript support** - Full type definitions included
- **Proxy support** - HTTP/HTTPS proxies for both requests and API calls
- **Command-line interface** - Quick operations without writing code

## Installation

```bash
npm install cfsolver
```

## Quick Start

### Node.js API

Works similar to axios, but automatically handles Cloudflare challenges:

```typescript
import { CloudflareSolver } from 'cfsolver';

const solver = new CloudflareSolver('your-api-key');

try {
  const response = await solver.get('https://protected-site.com');
  console.log(response.data);
} finally {
  solver.close();
}
```

### Command Line

```bash
# Set API key
export CLOUDFLYER_API_KEY="your-api-key"

# Make a request with automatic bypass
npx cfsolver request https://protected-site.com

# Solve Cloudflare challenge
npx cfsolver solve cloudflare https://protected-site.com
```

---

## Table of Contents

- [Node.js API](#nodejs-api)
  - [CloudflareSolver](#cloudflaresolver)
  - [Solving Modes](#solving-modes)
  - [Turnstile Support](#turnstile-support)
  - [Proxy Configuration](#proxy-configuration)
- [Command Line Interface](#command-line-interface)
  - [solve cloudflare](#solve-cloudflare)
  - [solve turnstile](#solve-turnstile)
  - [request](#request)
  - [balance](#balance)
- [Configuration](#configuration)
  - [Parameters](#parameters)
  - [Environment Variables](#environment-variables)
- [Exceptions](#exceptions)

---

## Node.js API

### CloudflareSolver

The main client for bypassing Cloudflare challenges.

```typescript
import { CloudflareSolver } from 'cfsolver';

const solver = new CloudflareSolver('your-api-key');

try {
  const response = await solver.get('https://protected-site.com');
  console.log(response.status);
  console.log(response.data);
} finally {
  solver.close();
}
```

#### Supported HTTP Methods

```typescript
solver.get(url, config?)
solver.post(url, data?, config?)
solver.put(url, data?, config?)
solver.delete(url, config?)
solver.head(url, config?)
solver.options(url, config?)
solver.patch(url, data?, config?)
solver.request(config)
```

All methods accept the same config options as axios:

```typescript
const response = await solver.post(
  'https://api.example.com/data',
  { key: 'value' },
  {
    headers: { 'Authorization': 'Bearer token' },
    timeout: 30000,
  }
);
```

### Solving Modes

CFSolver supports three solving modes to balance speed and reliability:

#### Mode 1: Auto-detect (Default, Recommended)

Solves only when a Cloudflare challenge is detected. Best for most use cases.

```typescript
const solver = new CloudflareSolver('your-api-key');
// or explicitly:
const solver = new CloudflareSolver('your-api-key', { solve: true, onChallenge: true });
```

#### Mode 2: Always Pre-solve

Always solves before each request. Slower but most reliable for heavily protected sites.

```typescript
const solver = new CloudflareSolver('your-api-key', { solve: true, onChallenge: false });
```

#### Mode 3: Disabled

Direct requests only, no challenge solving. Useful for testing or unprotected endpoints.

```typescript
const solver = new CloudflareSolver('your-api-key', { solve: false });
```

### Turnstile Support

Solve Cloudflare Turnstile CAPTCHA and get the token for form submission:

```typescript
import { CloudflareSolver } from 'cfsolver';

const solver = new CloudflareSolver('your-api-key');

try {
  // Get the Turnstile token
  const token = await solver.solveTurnstile(
    'https://example.com/login',
    '0x4AAAAAAA...'  // sitekey from cf-turnstile element
  );

  // Use the token in your form submission
  const response = await solver.post('https://example.com/login', {
    username: 'user',
    password: 'pass',
    'cf-turnstile-response': token,
  });
} finally {
  solver.close();
}
```

#### Finding the Sitekey

The sitekey is found in the page's HTML within the `cf-turnstile` element:

```html
<div class="cf-turnstile" data-sitekey="0x4AAAAAAA..."></div>
```

### Proxy Configuration

#### Single Proxy for All Requests

```typescript
const solver = new CloudflareSolver('your-api-key', {
  proxy: 'http://proxy.example.com:8080',
});
```

#### Separate Proxies for HTTP and API

Use different proxies for your HTTP requests and CloudFlyer API calls:

```typescript
const solver = new CloudflareSolver('your-api-key', {
  proxy: 'http://fast-proxy:8080',      // For your HTTP requests
  apiProxy: 'http://stable-proxy:8081', // For CloudFlyer API calls
});
```

#### Supported Proxy Formats

```typescript
// HTTP proxy
proxy: 'http://host:port'
proxy: 'http://user:pass@host:port'

// HTTPS proxy
proxy: 'https://host:port'
```

---

## Command Line Interface

### solve cloudflare

Solve a Cloudflare challenge and get cookies:

```bash
cfsolver solve cloudflare https://protected-site.com

# With proxy
cfsolver solve cloudflare https://protected-site.com -X http://proxy:8080

# Output as JSON
cfsolver solve cloudflare https://protected-site.com --json
```

### solve turnstile

Solve a Turnstile challenge and get the token:

```bash
cfsolver solve turnstile https://example.com 0x4AAAAAAA...

# Output as JSON
cfsolver solve turnstile https://example.com 0x4AAAAAAA... --json
```

### request

Make an HTTP request with automatic challenge bypass:

```bash
# GET request
cfsolver request https://protected-site.com

# POST request with data
cfsolver request -m POST -d '{"key":"value"}' https://api.example.com

# With custom headers
cfsolver request -H "Authorization: Bearer token" https://api.example.com

# Save response to file
cfsolver request -o output.html https://protected-site.com
```

### balance

Check your CloudFlyer account balance:

```bash
cfsolver balance
```

### CLI Options

```
Global Options:
  -K, --api-key <key>     API key (or set CLOUDFLYER_API_KEY env var)
  -B, --api-base <url>    API base URL (default: https://solver.zetx.site)
  -v, --verbose           Enable verbose output

Solve Options:
  -X, --proxy <url>       Proxy for requests (scheme://host:port)
  --api-proxy <url>       Proxy for API calls
  -T, --timeout <sec>     Timeout in seconds (default: 120)
  --json                  Output result as JSON

Request Options:
  -m, --method <method>   HTTP method (default: GET)
  -d, --data <data>       Request body (JSON)
  -H, --header <header>   Request header (repeatable)
  -o, --output <file>     Save response to file
```

---

## Configuration

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiBase` | `string` | `https://solver.zetx.site` | CloudFlyer service URL |
| `solve` | `boolean` | `true` | Enable automatic challenge solving |
| `onChallenge` | `boolean` | `true` | Solve only when challenge detected |
| `proxy` | `string` | - | Proxy for HTTP requests |
| `apiProxy` | `string` | - | Proxy for CloudFlyer API calls |
| `usePolling` | `boolean` | `false` | Use interval polling instead of long-polling |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `verbose` | `boolean` | `false` | Enable verbose logging |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLYER_API_KEY` | Your CloudFlyer API key |
| `CLOUDFLYER_API_BASE` | CloudFlyer service URL |

```bash
export CLOUDFLYER_API_KEY="your-api-key"
```

```typescript
const solver = new CloudflareSolver(process.env.CLOUDFLYER_API_KEY!);
```

---

## Exceptions

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
  if (error instanceof CFSolverTimeoutError) {
    console.error('Challenge solving timed out');
  } else if (error instanceof CFSolverChallengeError) {
    console.error('Failed to solve challenge:', error.message);
  } else if (error instanceof CFSolverConnectionError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof CFSolverAPIError) {
    console.error('API error:', error.message);
  } else if (error instanceof CFSolverError) {
    console.error('CFSolver error:', error.message);
  } else {
    throw error;
  }
} finally {
  solver.close();
}
```

| Exception | Description |
|-----------|-------------|
| `CFSolverError` | Base exception for all CFSolver errors |
| `CFSolverAPIError` | API request failed |
| `CFSolverChallengeError` | Challenge solving failed |
| `CFSolverTimeoutError` | Operation timed out |
| `CFSolverConnectionError` | Connection to service failed |

---

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [CloudFlyer Website](https://cloudflyer.zetx.site)
- [GitHub Repository](https://github.com/cloudflyer-project/cloudflyer-nodejs-sdk)
- [npm Package](https://www.npmjs.com/package/cfsolver)
