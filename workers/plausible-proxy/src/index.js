/**
 * Cloudflare Worker to proxy Plausible Analytics
 *
 * This proxies requests to Plausible to avoid ad blockers
 * - /js/script.js -> Plausible script (with extensions support)
 * - /api/event -> Plausible event endpoint
 */

const ProxyScript = 'https://plausible.io/js/pa-BcRrHMb-WDJL_dgiM5A81.js';
const ScriptName = '/js/script.js';
const Endpoint = '/api/event';

const ScriptWithoutExtension = ScriptName.replace('.js', '');

addEventListener('fetch', event => {
  event.passThroughOnException();
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const pathname = new URL(event.request.url).pathname;
  const [baseUri, ...extensions] = pathname.split('.');

  if (baseUri.endsWith(ScriptWithoutExtension)) {
    return getScript(event, extensions);
  } else if (pathname.endsWith(Endpoint)) {
    return postData(event);
  }
  return new Response(null, { status: 404 });
}

async function getScript(event, extensions) {
  let response = await caches.default.match(event.request);
  if (!response) {
    response = await fetch(ProxyScript);
    event.waitUntil(caches.default.put(event.request, response.clone()));
  }
  return response;
}

async function postData(event) {
  const request = new Request(event.request);
  request.headers.delete('cookie');
  return await fetch('https://plausible.io/api/event', request);
}
