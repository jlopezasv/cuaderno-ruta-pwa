const html = await fetch("https://cuaderno-demo-ab.vercel.app/index.html").then((r) => r.text());
const entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
console.log("entry", entry);
const entryJs = await fetch("https://cuaderno-demo-ab.vercel.app" + entry).then((r) => r.text());
const assets = [...new Set(entryJs.match(/\/assets\/[a-zA-Z0-9_.-]+\.js/g) || [])];
console.log("assets", assets);
for (const a of [entry, ...assets]) {
  const js = await fetch("https://cuaderno-demo-ab.vercel.app" + a).then((r) => r.text());
  const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/g);
  const ref = js.match(/fezacjtbavgdosncxlzw/g);
  const jwt = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
  console.log(a, { len: js.length, url: url?.[0], jwt: jwt?.[0]?.slice(0, 40), ref: !!ref });
}
