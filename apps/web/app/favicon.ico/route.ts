const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b1220"/>
  <path d="M18 42V22h8.5c5.6 0 9 2.8 9 7.3 0 4.7-3.7 7.5-9.3 7.5H22V42h-4zm4-8.4h4.1c3.3 0 5.2-1.5 5.2-4.2 0-2.5-1.8-4-5-4H22v8.2zm17.1 8.4V22h4v16.5h11V42H39.1z" fill="#8fe7ff"/>
</svg>
`.trim();

export async function GET() {
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400"
    }
  });
}
