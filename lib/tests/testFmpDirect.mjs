/**
 * Direct FMP API Test
 */

const apikey = process.env.FMP_API_KEY || 'YOUR_FMP_API_KEY';
const ticker = 'TSLA';

async function test() {
  const urls = [
    `https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${apikey}`,
    `https://financialmodelingprep.com/api/v3/stock_peers?symbol=${ticker}&apikey=${apikey}`,
    `https://financialmodelingprep.com/stable/stock-peers?symbol=${ticker}&apikey=${apikey}`,
    `https://financialmodelingprep.com/stable/key-metrics?symbol=${ticker}&apikey=${apikey}`
  ];

  for (const url of urls) {
    try {
      console.log(`Fetching: ${url.replace(apikey, 'REDACTED')}`);
      const res = await fetch(url);
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      console.log(`Response Snippet: ${text.substring(0, 300)}\n`);
    } catch (e) {
      console.error(`Error: ${e.message}\n`);
    }
  }
}

test();
