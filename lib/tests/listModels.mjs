/**
 * List Available Gemini Models
 */

const key = process.env.GEMINI_API_KEY;

async function list() {
  if (!key) {
    console.error('No GEMINI_API_KEY set!');
    return;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('Available models:');
    if (data.models) {
      data.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
    } else {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

list();
