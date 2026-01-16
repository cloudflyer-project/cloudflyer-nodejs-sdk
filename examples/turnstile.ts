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
    // Solve a Turnstile challenge
    console.log('Solving Turnstile challenge...');
    const token = await solver.solveTurnstile(
      'https://example.com/page-with-turnstile',
      'your-turnstile-sitekey'
    );
    console.log('Token:', token);

    // Use the token in a form submission
    const response = await solver.post('https://example.com/submit', {
      'cf-turnstile-response': token,
      // ... other form data
    });
    console.log('Submit response:', response.status);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
