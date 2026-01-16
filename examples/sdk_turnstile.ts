/**
 * Example: Solve Cloudflare Turnstile using cfsolver SDK.
 *
 * This script demonstrates how to use the CloudflareSolver to solve
 * Turnstile challenges and obtain the token.
 *
 * Usage:
 *     npm install
 *     set CLOUDFLYER_API_KEY=your_api_key
 *     npx ts-node examples/sdk_turnstile.ts --proxy http://user:pass@host:port
 */

/// <reference types="node" />
import { CloudflareSolver } from '../src';

const DEMO_URL = 'https://cloudflyer.zetx.site/demo/turnstile';
const SITE_KEY = '0x4AAAAAACJkAlPHW8xr1T2J';

function getArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

async function main() {
  const apiKey = process.env.CLOUDFLYER_API_KEY || '';
  const apiBase = process.env.CLOUDFLYER_API_BASE || 'https://solver.zetx.site';
  const taskProxy = getArgValue('--proxy');

  if (!apiKey) {
    console.error('Please set CLOUDFLYER_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`Target URL: ${DEMO_URL}`);
  console.log(`Site Key: ${SITE_KEY}`);
  if (taskProxy) {
    console.log(`Task Proxy: ${taskProxy}`);
  }

  const solver = new CloudflareSolver(apiKey, {
    apiBase,
    taskProxy,
  });

  try {
    console.log('Solving Turnstile challenge...');
    const token = await solver.solveTurnstile(DEMO_URL, SITE_KEY);

    console.log('Turnstile solved successfully!');
    console.log(`Token: ${token.slice(0, 80)}...`);
    console.log(`Token length: ${token.length}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
