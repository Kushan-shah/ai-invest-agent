/**
 * Server-Sent Events (SSE) Research Stream API Route
 * 
 * Runs the LangGraph agent graph and streams step progress and computed datasets.
 */

import { investmentGraph } from '../../../lib/agent/graph.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();

  if (!ticker) {
    return new Response(JSON.stringify({ error: 'Ticker query parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse optional custom weights
  const wFund = parseFloat(searchParams.get('w_fundamental') || '');
  const wMoat = parseFloat(searchParams.get('w_moat') || '');
  const wRisk = parseFloat(searchParams.get('w_risk') || '');
  const wVal = parseFloat(searchParams.get('w_valuation') || '');

  let customWeights = null;
  if (!isNaN(wFund) && !isNaN(wMoat) && !isNaN(wRisk) && !isNaN(wVal)) {
    const total = wFund + wMoat + wRisk + wVal;
    if (Math.abs(total - 1.0) < 0.02) {
      customWeights = {
        fundamental: wFund,
        moat: wMoat,
        risk: wRisk,
        valuation: wVal
      };
    }
  }

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event, data) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          console.warn('SSE Controller enqueue failed (client probably disconnected):', e.message);
        }
      };

      try {
        console.log(`Starting SSE Stream for: ${ticker} (Custom Weights: ${customWeights ? JSON.stringify(customWeights) : 'None'})`);
        sendEvent('progress', {
          step: 'INIT',
          status: 'RUNNING',
          message: `Initializing multi-source financial wrappers for: ${ticker}...`,
          timestamp: new Date().toISOString()
        });

        // Run the LangGraph stream
        const stream = await investmentGraph.stream(
          { ticker, customWeights },
          { streamMode: 'updates' }
        );

        let latestProfile = null;
        let latestGateway = null;
        const cumulativeState = { ticker, customWeights };

        for await (const chunk of stream) {
          const nodeName = Object.keys(chunk)[0];
          const nodeState = chunk[nodeName];

          console.log(`SSE Node Finished: ${nodeName}`);
          
          // Accumulate the node state values
          Object.assign(cumulativeState, nodeState);

          // Emit latest progress logs
          if (nodeState.progressLogs && nodeState.progressLogs.length > 0) {
            const latestLog = nodeState.progressLogs[nodeState.progressLogs.length - 1];
            sendEvent('progress', latestLog);
          }

          // Emit partial data states as they resolve to populate UI
          if (nodeName === 'collectData' && nodeState.rawData) {
            latestProfile = nodeState.rawData.profile;
            latestGateway = nodeState.gatewayStatus;
            sendEvent('partial_data', {
              profile: latestProfile,
              gateway: latestGateway,
              dataConfidence: nodeState.gatewayStatus?.dataConfidence || 'HIGH',
              dataProvenance: nodeState.gatewayStatus?.dataProvenance || []
            });
          }
        }

        sendEvent('complete', {
          reportId: crypto.randomUUID(),
          fetchedAt: new Date().toISOString(),
          profile: cumulativeState.rawData?.profile || latestProfile,
          quote: cumulativeState.rawData?.quote || {},
          analystTargets: cumulativeState.rawData?.analystTargets || {},
          historical: cumulativeState.rawData?.historical || {},
          gateway: cumulativeState.gatewayStatus || latestGateway,
          dataConfidence: cumulativeState.gatewayStatus?.dataConfidence || latestGateway?.dataConfidence || 'HIGH',
          dataProvenance: cumulativeState.gatewayStatus?.dataProvenance || latestGateway?.dataProvenance || [],
          metrics: cumulativeState.metrics || {},
          percentiles: cumulativeState.percentiles || {},
          anomalies: cumulativeState.anomalies || [],
          macro: cumulativeState.macroAnalysis || {},
          frameworkSignals: cumulativeState.frameworkSignals || {},
          validationLogs: cumulativeState.validationLogs || {},
          debate: cumulativeState.debate || {},
          verdict: cumulativeState.verdict || {},
          report: cumulativeState.report || {}
        });

      } catch (error) {
        console.error('SSE Stream execution error:', error);
        sendEvent('error', {
          message: error.message || 'An internal error occurred during graph execution'
        });
      } finally {
        try {
          controller.close();
        } catch (e) {
          // Stream already closed
        }
      }
    }
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}
