// background.js
// Service worker responds to messages from popup to fetch cookies for a tab URL.
console.log("Background service worker started!");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_COOKIES_FOR_URL") {
    const url = message.url;
    fetchCookiesForUrl(url).then(cookies => sendResponse({cookies}))
                       .catch(err => sendResponse({error: err.message}));
    return true;
  }
});

async function fetchCookiesForUrl(url) {
  if (!url) return [];

  const cookiesByUrl = await chrome.cookies.getAll({ url }).catch(() => []);

  const merged = {};
  [cookiesByUrl].forEach(list => {
    (list || []).forEach(c => {
      const key = `${c.name}|${c.domain}|${c.path}|${c.storeId || ""}`;
      merged[key] = c;
    });
  });

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
