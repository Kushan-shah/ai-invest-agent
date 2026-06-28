export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ quotes: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=0`, {
      headers: {
        'User-Agent': 'Mozilla/5.5 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ quotes: [] }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Yahoo Finance proxy search failed:', err);
    return new Response(JSON.stringify({ error: err.message, quotes: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
