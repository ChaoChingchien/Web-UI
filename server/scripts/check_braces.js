const fs = require('fs');
const src = fs.readFileSync('src/index.ts', 'utf8');
let depth = 0;
const lines = src.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Only count braces that aren't in strings or comments (approx)
  let inString = false;
  let inTemplate = false;
  let strChar = '';
  let clean = '';
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (inString) {
      if (ch === strChar && prev !== '\\') inString = false;
    } else if (inTemplate) {
      if (ch === '`' && prev !== '\\') inTemplate = false;
    } else {
      if (ch === '/' && line[j+1] === '/') break; // rest of line is comment
      if (ch === "'" || ch === '"') { inString = true; strChar = ch; }
      else if (ch === '`') { inTemplate = true; }
      else if (ch === '{' || ch === '}') clean += ch;
    }
  }
  const opens = (clean.match(/\{/g) || []).length;
  const closes = (clean.match(/\}/g) || []).length;
  const net = opens - closes;
  if (net !== 0) {
    console.log(`L${i+1}: ${net > 0 ? '+' : ''}${net} depth ${depth}->${depth+net}  ${line.trim().substring(0, 70)}`);
  }
  depth += net;
}
console.log('Final depth:', depth);
