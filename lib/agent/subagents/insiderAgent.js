import { InsiderAssessmentSchema } from '../../utils/schemas.js';

/**
 * Insider Trading & Corporate Confidence Swarm Sub-Agent
 * 
 * Purpose: Analyze Form 4 SEC filings and insider sentiment aggregates
 * to determine if management is signaling high conviction (cluster buying)
 * or capitulation (exodus selling).
 */
export async function runInsiderAgent(normalizedData, llm) {
  const { profile, insiderTrading } = normalizedData;
  const { sentiment, transactions } = insiderTrading || { sentiment: [], transactions: [] };

  if (!sentiment.length && !transactions.length) {
    return {
      key_transactions: ['No insider trading data available for analysis.'],
      management_confidence: 'Insufficient data to determine management conviction.',
      signal: 'NEUTRAL'
    };
  }

  // Summarize sentiment aggregates
  const recentSentiment = sentiment.slice(0, 6).map(s => 
    `${s.year}-${s.month}: Net Change: ${s.change} shares | MSPR: ${s.mspr}%`
  ).join('\n');

  // Summarize recent notable transactions
  // Filter out zero-share or minor option exercises to reduce noise
  const significantTransactions = transactions
    .filter(t => t.change !== 0 && Math.abs(t.change) > 1000)
    .slice(0, 15)
    .map(t => 
      `${t.transactionDate} | ${t.name} (${t.transactionCode}) | ${t.change > 0 ? 'BOUGHT' : 'SOLD'} ${Math.abs(t.change)} shares @ $${t.transactionPrice || 'N/A'}`
    ).join('\n');

  const systemPrompt = `You are a forensic Insider Trading analyst.
Your objective is to analyze SEC Form 4 filings and insider sentiment aggregates for ${profile.ticker} (${profile.name}).

Corporate Insider Data:
--- Monthly Sentiment Aggregates ---
${recentSentiment || 'None available.'}

--- Recent Significant Transactions ---
${significantTransactions || 'None available.'}

Analytical Guidelines:
1. Differentiate between routine 10b5-1 selling (which is normal and neutral) versus cluster buying (highly bullish).
2. Look for capitulation (multiple executives selling aggressively at low prices).
3. "M" codes are option exercises. Look closely at "P" (Purchases) and "S" (Sales) on the open market.
4. Output your analysis precisely matching the required schema.

Output exactly a JSON object matching the InsiderAssessmentSchema.`;

  try {
    const structuredLlm = llm.withStructuredOutput(InsiderAssessmentSchema);
    const response = await structuredLlm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Execute insider trading assessment.' }
    ]);
    return response;
  } catch (error) {
    console.error(`[Swarm: Insider Agent] Error:`, error.message);
    return {
      key_transactions: ['Error processing insider data.'],
      management_confidence: 'Data corrupted or unparseable.',
      signal: 'NEUTRAL'
    };
  }
}
