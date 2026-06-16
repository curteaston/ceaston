const [url, timeoutArg] = process.argv.slice(2);
const timeoutMs = Number(timeoutArg || 30000);

if (!url) {
  console.error('Usage: node scripts/wait-for-url.mjs <url> [timeoutMs]');
  process.exit(1);
}

const started = Date.now();
let lastError;

while (Date.now() - started < timeoutMs) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`${url} is ready (${res.status}).`);
      process.exit(0);
    }
    lastError = new Error(`${url} returned ${res.status}`);
  } catch (err) {
    lastError = err;
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
}

console.error(`${url} was not ready within ${timeoutMs}ms.`);
if (lastError) console.error(lastError.message);
process.exit(1);
