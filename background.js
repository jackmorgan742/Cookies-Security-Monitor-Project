// background.js
// Service worker responds to messages from popup to fetch cookies for a tab URL.
console.log("Background service worker started!");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_COOKIES_FOR_URL") {
    const url = message.url;
    fetchCookiesForUrl(url).then(cookies => sendResponse({cookies}))
                       .catch(err => sendResponse({error: err.message}));
    // Return true to indicate we'll respond asynchronously.
    return true;
  }
});

async function fetchCookiesForUrl(url) {
  if (!url) return [];

  // Try to get cookies by URL 
  const cookiesByUrl = await chrome.cookies.getAll({ url }).catch(() => []);
/*
  // Extract domain and also try domain-based lookup to catch domain-scoped cookies.
  const domain = (new URL(url)).hostname;
  // Use leading dot to match domain-scoped cookies
  const domainPattern = domain.startsWith(".") ? domain : "." + domain;
  const cookiesByDomain = await chrome.cookies.getAll({ domain: domainPattern }).catch(() => []);

  // Also attempt without dot
  const cookiesByDomainNoDot = await chrome.cookies.getAll({ domain: domain }).catch(() => []);
*/
  // Merge unique cookies (by name+domain+path+storeId)
  const merged = {};
  [cookiesByUrl].forEach(list => {
    (list || []).forEach(c => {
      const key = `${c.name}|${c.domain}|${c.path}|${c.storeId || ""}`;
      merged[key] = c;
    });
  });

  // Convert to array and normalize fields for UI
  const result = Object.values(merged).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    hostOnly: !!c.hostOnly,
    path: c.path,
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite || "unspecified",
    session: !!c.session,
    expirationDate: c.expirationDate ? new Date(c.expirationDate * 1000).toISOString() : null,
    storeId: c.storeId || null
  }));

  return result;
}
