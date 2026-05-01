const fs = require('fs');
const html = fs.readFileSync('C:/Users/T/Documents/GitHub/bt-locations/docs/index.html', 'utf8');
const m = html.match(/<script id="embeddedData"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.log('No embedded data found'); process.exit(1); }
try {
    const d = JSON.parse(m[1]);
    console.log('OK! Parsed', d.length, 'locations');
    console.log('First:', d[0].name, d[0].lat, d[0].lng);
} catch(e) {
    console.log('PARSE ERROR:', e.message);
}
