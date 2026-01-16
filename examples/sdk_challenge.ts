/**
 * Example: Solve Cloudflare Challenge using cfsolver SDK.
 *
 * This script demonstrates how to use the CloudflareSolver to bypass
 * Cloudflare's challenge protection on the demo site.
 *
 * Usage:
 *     npm install
 *     set CLOUDFLYER_API_KEY=your_api_key
 *     npx ts-node examples/sdk_challenge.ts [--proxy http://user:pass@host:port]
 */

/// <reference types="node" />
import { CloudflareSolver } from '../src';

const DEMO_URL = 'https://cloudflyer.zetx.site/demo/challenge';

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
  const proxy = getArgValue('--proxy');

  if (!apiKey) {
    console.error('Please set CLOUDFLYER_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`Target URL: ${DEMO_URL}`);
  console.log(`API Base: ${apiBase}`);
  if (proxy) {
    console.log(`Upstream Proxy: ${proxy}`);
  }

  const solver = new CloudflareSolver(apiKey, {
    apiBase,
    solve: true,
    onChallenge: true,
    proxy, // Used as upstream proxy for LinkSocks
  });

  try {
    console.log('Sending request to demo page...');
    const response = await solver.get(DEMO_URL);

    console.log(`Response status: ${response.status}`);

    if (response.status === 200) {
      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (text.toLowerCase().includes('cf-turnstile') && text.toLowerCase().includes('challenge')) {
        console.warn('Challenge page still present - solve may have failed');
      } else {
        console.log('Challenge bypassed successfully!');
      }
    } else {
      console.error(`Request failed with status ${response.status}`);
      console.error(`Response: ${JSON.stringify(response.data).slice(0, 500)}`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    solver.close(); // Clean up LinkSocks connection
  }
}

main();
