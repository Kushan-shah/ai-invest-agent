import { getFredMacroData } from '../tools/fred.js';


async function run() {
  console.log('=== Testing FRED API Integration ===');
  console.log('FRED_API_KEY present:', !!process.env.FRED_API_KEY);
  
  const result = await getFredMacroData();
  console.log('\nFRED Response Result:', JSON.stringify(result, null, 2));
}

run();
