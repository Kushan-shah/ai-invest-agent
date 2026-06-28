/**
 * Earnings Call & News Sentiment Sub-Agent
 * 
 * Specialized LLM agent that scans news headlines and simulated transcripts
 * to determine management tone, forward guidance shifts, and market sentiment.
 */

import { SentimentAssessmentSchema } from '../../utils/schemas.js';

export async function runEarningsCallAgent(companyData, news, llm) {
  console.log(`[Swarm] Invoking Earnings Call & News Sub-Agent for ${companyData.profile.ticker}`);
  const structuredModel = llm.withStructuredOutput(SentimentAssessmentSchema);

  const newsContext = news && news.length > 0 
    ? news.map(n => `- ${n.title}\n  Content: ${n.content.substring(0, 500)}...`).join('\n\n')
    : 'No recent news available.';

  const prompt = `You are a specialized Sentiment & Macro Intelligence Director.
Analyze the qualitative news flow and management forward guidance for ${companyData.profile.name} (${companyData.profile.ticker}).

RECENT NEWS & NARRATIVES:
${newsContext}

INSTRUCTIONS:
1. Synthesize the overall market sentiment (Hawkish/Dovish).
2. Identify any shifts in management forward guidance or macro headwinds.
3. Detect if the market is overly optimistic (froth) or overly pessimistic (capitulation).
4. Conclude with a strict Sentiment signal (BULLISH = Positive Flow, NEUTRAL = Mixed, BEARISH = Negative Flow).

Format strictly to the provided output schema. DO NOT USE HEDGES OR BOILERPLATE.`;

  return await structuredModel.invoke(prompt);
}
