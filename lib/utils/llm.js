/**
 * Google Gemini Model Orchestrator Setup
 * 
 * Configures Gemini Pro and Gemini Flash instances.
 * Enforces temperature = 0 for consistency and structured outputs.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set in the environment.');
}

/**
 * Gemini Pro (using gemini-3.1-flash-lite for free tier): Recommended for deep framework synthesis,
 * evidence battle debates, and final thesis generation.
 */
export const geminiPro = new ChatGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
  model: 'gemini-3.1-flash-lite',
  temperature: 0,
  maxOutputTokens: 8192,
});

/**
 * Gemini Flash (using gemini-3.1-flash-lite for free tier): Recommended for high-speed parallel tasks
 * such as news text extraction and disambiguation.
 */
export const geminiFlash = new ChatGoogleGenerativeAI({
  apiKey: GEMINI_API_KEY,
  model: 'gemini-3.1-flash-lite',
  temperature: 0,
  maxOutputTokens: 2048,
});
