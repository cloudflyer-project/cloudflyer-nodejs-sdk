/// <reference types="node" />
import { CloudflareSolver } from '../src';

async function main() {
  const apiKey = process.env.CLOUDFLYER_API_KEY;
  if (!apiKey) {
    console.error('Please set CLOUDFLYER_API_KEY environment variable');
    process.exit(1);
  }

  const solver = new CloudflareSolver(apiKey);

  try {
    // Make a request to a Cloudflare-protected site
    console.log('Making request to protected site...');
    const response = await solver.get('https://example.com');
    console.log('Status:', response.status);
    console.log('Data length:', response.data.length);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
