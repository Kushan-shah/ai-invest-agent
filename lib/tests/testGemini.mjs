/**
 * Test Gemini API Connection and Structured Output Parsing
 * 
 * Run with: node --env-file=.env.local lib/tests/testGemini.mjs
 */

import { geminiPro } from '../utils/llm.js';
import { z } from 'zod';

const TestSchema = z.object({
  company: z.string(),
  verdict: z.string(),
  reason: z.string()
});

async function main() {
  console.log('🚀 Testing Gemini API connection with structured output...');

  try {
    const structuredModel = geminiPro.withStructuredOutput(TestSchema);
    
    console.log('Sending structured query...');
    const result = await structuredModel.invoke(
      'Analyze Apple Inc (AAPL) in one sentence and give a positive verdict.'
    );

    console.log('\n✅ Success! Response object:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

main();
