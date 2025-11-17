// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const urlEl = document.getElementById("url");
  const statusEl = document.getElementById("status");
  const cookiesTable = document.getElementById("cookiesTable");
  const tbody = document.getElementById("tbody");

  const compareModeEl = document.getElementById("compareMode");
  const saveBeforeBtn = document.getElementById("saveBefore");
  const saveAfterBtn = document.getElementById("saveAfter");
  const clearSnapshotsBtn = document.getElementById("clearSnapshots");
  const diffPanel = document.getElementById("diffPanel");
  const diffMeta = document.getElementById("diffMeta");
  const diffSummary = document.getElementById("diffSummary");
  const diffBody = document.getElementById("diffBody");

  const refreshBtn = document.getElementById("refreshBtn");

  // ---------- Core helpers ----------
  function cookieKey(c) {
    return `${c.name}|${c.domain}|${c.path}|${c.storeId || ""}`;
  }
  function boolMark(b) { return b ? "✓" : "✗"; }
  function fmtExp(c) {
    if (c.session) return "session";
    if (!c.expirationDate) return "—";
    // expirationDate may be ISO (from background normalization)
    // or seconds since epoch; support both
    const ts = isNaN(c.expirationDate)
      ? Date.parse(c.expirationDate)
      : (Number(c.expirationDate) * 1000);
    return isNaN(ts) ? String(c.expirationDate) : new Date(ts).toLocaleString();
  }
  function securityNotes(c) {
    const notes = [];
    if (!c.secure) notes.push("No Secure");
    if (!c.httpOnly) notes.push("No HttpOnly");
    const ss = (c.sameSite || "unspecified").toString();
    if (ss === "unspecified") notes.push("No SameSite");
    if (ss === "no_restriction" && !c.secure) notes.push("SameSite=None without Secure");
    return notes;
  }

  // Fetch cookies for URL via background service worker
  async function getCookiesForUrl(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_COOKIES_FOR_URL", url }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message, cookies: [] });
          return;
        }
        if (!response) { resolve({ error: "No response from background script.", cookies: [] }); return; }
        if (response.error) { resolve({ error: response.error, cookies: [] }); return; }
        resolve({ cookies: response.cookies || [] });
      });
    });
  }

  // ---------- Render current cookies ----------
  async function renderActiveTabCookies() {
    statusEl.textContent = "Getting active tab…";
    tbody.innerHTML = "";
    cookiesTable.hidden = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
      urlEl.textContent = "";
      statusEl.textContent = "No active HTTP(S) tab.";
      return { tab: null, cookies: [] };
    }

    urlEl.textContent = tab.url;
    statusEl.textContent = "Fetching cookies…";

    const { error, cookies } = await getCookiesForUrl(tab.url);
    if (error) {
      statusEl.textContent = "Error: " + error;
      return { tab, cookies: [] };
    }
    if (!cookies.length) {
      statusEl.textContent = "No cookies found for this page.";
      return { tab, cookies: [] };
    }

    statusEl.textContent = `${cookies.length} cookie(s) found`;
    cookiesTable.hidden = false;

    cookies.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHTML(c.name)}</td>
        <td class="mono">${escapeHTML(c.value ?? "")}</td>
        <td class="mono">${escapeHTML(c.domain)}</td>
        <td>${fmtExp(c)}</td>
        <td>${boolMark(!!c.secure)}</td>
        <td>${boolMark(!!c.httpOnly)}</td>
        <td>${escapeHTML(c.sameSite || "unspecified")}</td>
        <td>${securityNotes(c).map(n => `<span class="chip bad">${n}</span>`).join(" ") || "—"}</td>
      `;
      tbody.appendChild(tr);
    });

    return { tab, cookies };
  }

  // ---------- Snapshot storage (per URL) ----------
  function storageKey(url) { return `snapshots::${url}`; }

  async function loadSnapshots(url) {
    const key = storageKey(url);
    const obj = await chrome.storage.local.get(key);
    return obj[key] || { before: null, after: null };
  }

  async function saveSnapshot(url, kind, cookies) {
    const key = storageKey(url);
    const snaps = await loadSnapshots(url);
    const snap = {
      when: Date.now(),
      count: cookies.length,
      byKey: Object.fromEntries(cookies.map(c => [cookieKey(c), c])),
    };
    snaps[kind] = snap;
    await chrome.storage.local.set({ [key]: snaps });
    return snaps;
  }

  async function clearSnapshots(url) {
    await chrome.storage.local.remove(storageKey(url));
  }

  // ---------- Diff logic ----------
  function diffSnapshots(beforeSnap, afterSnap) {
    const added = [];
    const removed = [];
    const changed = [];

    const b = beforeSnap?.byKey || {};
    const a = afterSnap?.byKey || {};

    const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of allKeys) {
      const cb = b[k];
      const ca = a[k];
      if (cb && !ca) { removed.push(cb); continue; }
      if (!cb && ca) { added.push(ca); continue; }
      if (cb && ca) {
        // compare interesting fields
        const diffs = [];
        if (!!cb.secure !== !!ca.secure) diffs.push(`Secure: ${boolMark(!!cb.secure)} → ${boolMark(!!ca.secure)}`);
        if (!!cb.httpOnly !== !!ca.httpOnly) diffs.push(`HttpOnly: ${boolMark(!!cb.httpOnly)} → ${boolMark(!!ca.httpOnly)}`);
        const ssb = (cb.sameSite || "unspecified").toString();
        const ssa = (ca.sameSite || "unspecified").toString();
        if (ssb !== ssa) diffs.push(`SameSite: ${ssb} → ${ssa}`);

        // Expiration comparison (be tolerant to formats)
        const expb = fmtExp(cb);
        const expa = fmtExp(ca);
        if (expb !== expa) diffs.push(`Expires: ${expb} → ${expa}`);

        // Value change (optional): show only length delta, keep privacy
        if ((cb.value ?? "") !== (ca.value ?? "")) {
          const lb = (cb.value ?? "").length, la = (ca.value ?? "").length;
          diffs.push(`Value changed (${lb}→${la} chars)`);
        }

        if (diffs.length) changed.push({ before: cb, after: ca, diffs });
      }
    }
    return { added, removed, changed };
  }

  // ---------- Render diff ----------
  function renderDiff(url, beforeSnap, afterSnap) {
    const hasBoth = !!beforeSnap && !!afterSnap;
    diffPanel.hidden = !hasBoth;
    diffSummary.innerHTML = "";
    diffBody.innerHTML = "";
    if (!hasBoth) return;

    const { added, removed, changed } = diffSnapshots(beforeSnap, afterSnap);
    diffMeta.textContent = `URL: ${url} • BEFORE: ${new Date(beforeSnap.when).toLocaleString()} (${beforeSnap.count})
      → AFTER: ${new Date(afterSnap.when).toLocaleString()} (${afterSnap.count})`;

    const items = [
      `<strong>Added</strong>: ${added.length}`,
      `<strong>Removed</strong>: ${removed.length}`,
      `<strong>Changed</strong>: ${changed.length}`
    ];
    diffSummary.innerHTML = items.map(i => `<li>${i}</li>`).join("");

    // detail rows
    const row = (type, c, diffs = []) => `
      <tr>
        <td>${type}</td>
        <td class="mono">${escapeHTML(c.name)}</td>
        <td class="mono">${escapeHTML(c.domain)}</td>
        <td class="mono">${escapeHTML(c.path)}</td>
        <td>${boolMark(!!c.secure)}</td>
        <td>${boolMark(!!c.httpOnly)}</td>
        <td>${escapeHTML(c.sameSite || "unspecified")}</td>
        <td>${fmtExp(c)}</td>
        <td>${diffs.map(d => `<span class="chip ${/No|None/.test(d) ? 'bad':'good'}">${escapeHTML(d)}</span>`).join(" ") || "—"}</td>
      </tr>`;

    added.forEach(c => diffBody.insertAdjacentHTML("beforeend", row("Added", c, securityNotes(c))));
    removed.forEach(c => diffBody.insertAdjacentHTML("beforeend", row("Removed", c, securityNotes(c))));
    changed.forEach(({ before, after, diffs }) => {
      diffBody.insertAdjacentHTML("beforeend", row("Changed (BEFORE)", before, securityNotes(before)));
      diffBody.insertAdjacentHTML("beforeend", row("Changed (AFTER)", after, diffs.concat(securityNotes(after))));
    });
  }

  // ---------- UI wiring ----------
  compareModeEl.addEventListener("change", async () => {
    const enabled = compareModeEl.checked;
    saveBeforeBtn.disabled = !enabled;
    saveAfterBtn.disabled = !enabled;
    clearSnapshotsBtn.disabled = !enabled;
    if (!enabled) diffPanel.hidden = true;
  });

  saveBeforeBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const { cookies } = await getCookiesForUrl(tab.url);
    const snaps = await saveSnapshot(tab.url, "before", cookies);
    statusEl.textContent = `Saved BEFORE snapshot (${snaps.before.count} cookies). Now log in and click "Save AFTER".`;
    renderDiff(tab.url, snaps.before, snaps.after);
  });

  saveAfterBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const { cookies } = await getCookiesForUrl(tab.url);
    const snaps = await saveSnapshot(tab.url, "after", cookies);
    statusEl.textContent = `Saved AFTER snapshot (${snaps.after.count} cookies). Compare below.`;
    renderDiff(tab.url, snaps.before, snaps.after);
  });

  document.getElementById("openWorkspace").addEventListener("click", () => {
  const url = chrome.runtime.getURL("workspace.html");
  chrome.tabs.create({ url });
});


  clearSnapshotsBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    await clearSnapshots(tab.url);
    diffPanel.hidden = true;
    statusEl.textContent = "Cleared BEFORE/AFTER snapshots for this page.";
  });

  refreshBtn.addEventListener("click", renderActiveTabCookies);

  // HTML escape to avoid accidental HTML injection in table
  function escapeHTML(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Initial render + show any existing diff (if user re-opens popup)
  (async function init() {
    const { tab } = await renderActiveTabCookies();
    if (tab?.url) {
      const snaps = await loadSnapshots(tab.url);
      // Enable compare buttons if compare mode is already on
      if (compareModeEl.checked) {
        saveBeforeBtn.disabled = false;
        saveAfterBtn.disabled = false;
        clearSnapshotsBtn.disabled = false;
      }
      renderDiff(tab.url, snaps.before, snaps.after);
    }
  })();
});
