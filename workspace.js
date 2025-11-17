// workspace.js

// ---------- DOM ----------
const useActiveBtn   = document.getElementById("useActiveTab");
const setTargetBtn   = document.getElementById("setTarget");
const targetUrlInp   = document.getElementById("targetUrl");
const targetLabel    = document.getElementById("targetLabel");
const statusEl       = document.getElementById("status");

const refreshBtn     = document.getElementById("refresh");
const saveBeforeBtn  = document.getElementById("saveBefore");
const saveAfterBtn   = document.getElementById("saveAfter");
const clearBtn       = document.getElementById("clearSnapshots");
const snapMeta       = document.getElementById("snapMeta");

const diffPanel      = document.getElementById("diffPanel");
const diffMeta       = document.getElementById("diffMeta");
const diffSummary    = document.getElementById("diffSummary");
const diffBody       = document.getElementById("diffBody");

const cookieBody     = document.getElementById("cookieBody");
const siteStats = document.getElementById("siteStats");

// NEW: filters in diff
const fAdded         = document.getElementById("fAdded");
const fRemoved       = document.getElementById("fRemoved");
const fChanged       = document.getElementById("fChanged");

// ---------- State ----------
let targetUrl = "";

// ---------- Helpers ----------
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function boolMark(b) { return b ? "✓" : "✗"; }

function fmtExp(c) {
  if (c.session) return "session";
  if (!c.expirationDate) return "—";
  const ts = isNaN(c.expirationDate)
    ? Date.parse(c.expirationDate)
    : Number(c.expirationDate) * 1000;
  return isNaN(ts) ? String(c.expirationDate) : new Date(ts).toLocaleString();
}

function samesiteLabel(raw) {
  const v = (raw || "").toString().toLowerCase();
  if (v === "no_restriction") return "none";
  if (v === "lax" || v === "strict") return v;
  return "unspecified";
}

function cookieKey(c) {
  return `${c.name}|${c.domain}|${c.path}|${c.storeId || ""}`;
}
function storageKey(url) { return `snapshots::${url}`; }

// Attack-oriented notes from flags
function riskChips(c) {
  const chips = [];
  const ss = samesiteLabel(c.sameSite);

  // base attribute issues
  if (!c.secure)   chips.push("No Secure");
  if (!c.httpOnly) chips.push("No HttpOnly");
  if (ss === "unspecified") chips.push("No SameSite");
  if (ss === "none" && !c.secure) chips.push("SameSite=None without Secure");

  // attack exposure suggestions
  if (!c.httpOnly) chips.push("XSS: cookie theft risk");
  if (ss === "none" || ss === "unspecified") chips.push("CSRF risk");
  // If you want to be stricter, uncomment:
  // if (ss === "lax") chips.push("CSRF risk (limited)");

  if (!c.secure) chips.push("MITM risk over HTTP");

  // persistence/tracking heuristic
  const ts = isNaN(c.expirationDate)
    ? Date.parse(c.expirationDate || 0)
    : Number(c.expirationDate || 0) * 1000;
  if (!isNaN(ts) && ts - Date.now() > 1000 * 60 * 60 * 24 * 180) {
    chips.push("Tracking/persistent session");
  }

  return chips;
}

function pct(n, d) {
  if (!d) return "0.0%";
  return (Math.round((n / d) * 1000) / 10).toFixed(1) + "%"; // one decimal
}

function summarizeCookies(list) {
  const total = list.length;
  let secure = 0, httpOnly = 0, ssSet = 0;
  let ssStrict = 0, ssLax = 0, ssNone = 0, ssUnspec = 0;

  for (const c of list) {
    if (c.secure) secure++;
    if (c.httpOnly) httpOnly++;
    const ss = samesiteLabel(c.sameSite); // strict | lax | none | unspecified
    if (ss !== "unspecified") ssSet++;
    if (ss === "strict") ssStrict++;
    else if (ss === "lax") ssLax++;
    else if (ss === "none") ssNone++;
    else ssUnspec++;
  }

  return {
    total,
    securePct: pct(secure, total),
    httpOnlyPct: pct(httpOnly, total),
    sameSiteSetPct: pct(ssSet, total),
    ssStrictPct: pct(ssStrict, total),
    ssLaxPct: pct(ssLax, total),
    ssNonePct: pct(ssNone, total),
    ssUnspecPct: pct(ssUnspec, total),
  };
}

function renderStats(list) {
  if (!siteStats) return;
  const s = summarizeCookies(list);
  siteStats.innerHTML = (s.total === 0)
    ? "No cookies to summarize."
    : `
      <div>Total cookies: <strong>${s.total}</strong></div>
      <ul style="margin:6px 0; padding-left:18px;">
        <li><strong>Secure</strong>: ${s.securePct}</li>
        <li><strong>HttpOnly</strong>: ${s.httpOnlyPct}</li>
        <li><strong>SameSite set</strong> (any of strict/lax/none): ${s.sameSiteSetPct}</li>
      </ul>
      <div style="opacity:.8;">SameSite breakdown:</div>
      <ul style="margin:6px 0; padding-left:18px;">
        <li>strict: ${s.ssStrictPct}</li>
        <li>lax: ${s.ssLaxPct}</li>
        <li>none: ${s.ssNonePct}</li>
        <li>unspecified: ${s.ssUnspecPct}</li>
      </ul>
    `;
}


// ---------- Background bridge ----------
async function getCookiesForUrl(url) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_COOKIES_FOR_URL", url }, (res) => {
      if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message, cookies: [] });
      if (!res) return resolve({ error: "No response from background", cookies: [] });
      if (res.error) return resolve({ error: res.error, cookies: [] });
      resolve({ cookies: res.cookies || [] });
    });
  });
}

// ---------- Snapshots ----------
async function loadSnapshots(url) {
  const obj = await chrome.storage.local.get(storageKey(url));
  return obj[storageKey(url)] || { before: null, after: null };
}

async function saveSnapshot(url, kind, cookies) {
  const snaps = await loadSnapshots(url);
  snaps[kind] = {
    when: Date.now(),
    count: cookies.length,
    byKey: Object.fromEntries(cookies.map(c => [cookieKey(c), c]))
  };
  await chrome.storage.local.set({ [storageKey(url)]: snaps });
  return snaps;
}

async function clearSnapshots(url) {
  await chrome.storage.local.remove(storageKey(url));
}

// ---------- Diff ----------
function diffSnapshots(beforeSnap, afterSnap) {
  const added = [], removed = [], changed = [];
  const b = beforeSnap?.byKey || {};
  const a = afterSnap?.byKey || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);

  for (const k of keys) {
    const cb = b[k], ca = a[k];
    if (cb && !ca) { removed.push(cb); continue; }
    if (!cb && ca) { added.push(ca); continue; }
    if (cb && ca) {
      const diffs = [];
      if (!!cb.secure   !== !!ca.secure)   diffs.push(`Secure: ${boolMark(!!cb.secure)} → ${boolMark(!!ca.secure)}`);
      if (!!cb.httpOnly !== !!ca.httpOnly) diffs.push(`HttpOnly: ${boolMark(!!cb.httpOnly)} → ${boolMark(!!ca.httpOnly)}`);
      const ssb = samesiteLabel(cb.sameSite), ssa = samesiteLabel(ca.sameSite);
      if (ssb !== ssa) diffs.push(`SameSite: ${ssb} → ${ssa}`);
      const expb = fmtExp(cb), expa = fmtExp(ca);
      if (expb !== expa) diffs.push(`Expires: ${expb} → ${expa}`);
      if ((cb.value ?? "") !== (ca.value ?? "")) {
        const lb = (cb.value ?? "").length, la = (ca.value ?? "").length;
        diffs.push(`Value changed (${lb}→${la} chars)`);
      }
      if (diffs.length) changed.push({ before: cb, after: ca, diffs });
    }
  }
  return { added, removed, changed };
}

// ---------- Renderers ----------
function renderCookies(list) {
  cookieBody.innerHTML = "";
  for (const c of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHTML(c.name)}</td>
      <td class="mono">${escapeHTML(c.value ?? "")}</td>
      <td class="mono">${escapeHTML(c.domain)}</td>
      <td>${fmtExp(c)}</td>
      <td>${boolMark(!!c.secure)}</td>
      <td>${boolMark(!!c.httpOnly)}</td>
      <td>${escapeHTML(samesiteLabel(c.sameSite))}</td>
      <td>${riskChips(c).map(n => `<span class="chip ${/risk|No|None/i.test(n)?'bad':'good'}">${escapeHTML(n)}</span>`).join(" ") || "—"}</td>
    `;
    cookieBody.appendChild(tr);
  }
  renderStats(list);
}

function renderDiff(url, snaps) {
  const { before, after } = snaps;
  const ready = !!before && !!after;
  diffPanel.hidden = !ready;
  diffBody.innerHTML = "";
  diffSummary.innerHTML = "";
  diffMeta.textContent = "";
  if (!ready) return;

  const d = diffSnapshots(before, after);
  diffMeta.textContent = `URL: ${url} • BEFORE: ${new Date(before.when).toLocaleString()} (${before.count}) → AFTER: ${new Date(after.when).toLocaleString()} (${after.count})`;
  diffSummary.innerHTML = [
    `<strong>Added</strong>: ${d.added.length}`,
    `<strong>Removed</strong>: ${d.removed.length}`,
    `<strong>Changed</strong>: ${d.changed.length}`
  ].map(x => `<li>${x}</li>`).join("");

  const row = (type, c, details = []) => {
    const tr = document.createElement("tr");
    tr.dataset.change = type.startsWith("Changed") ? "changed" : type.toLowerCase(); // added|removed|changed
    tr.innerHTML = `
      <td>${type}</td>
      <td class="mono">${escapeHTML(c.name)}</td>
      <td class="mono">${escapeHTML(c.domain)}</td>
      <!-- Path column intentionally removed -->
      <td>${boolMark(!!c.secure)}</td>
      <td>${boolMark(!!c.httpOnly)}</td>
      <td>${escapeHTML(samesiteLabel(c.sameSite))}</td>
      <td>${fmtExp(c)}</td>
      <td>${details.map(n => `<span class="chip ${/risk|No|None/i.test(n)?'bad':'good'}">${escapeHTML(n)}</span>`).join(" ") || "—"}</td>
    `;
    return tr;
  };

  d.added.forEach(c =>   diffBody.appendChild(row("Added", c,   riskChips(c))));
  d.removed.forEach(c => diffBody.appendChild(row("Removed", c, riskChips(c))));
  d.changed.forEach(({ before, after, diffs }) => {
    diffBody.appendChild(row("Changed (BEFORE)", before, riskChips(before)));
    diffBody.appendChild(row("Changed (AFTER)",  after,  diffs.concat(riskChips(after))));
  });

  applyDiffFilters();
}

function applyDiffFilters() {
  const showA = !!(fAdded && fAdded.checked);
  const showR = !!(fRemoved && fRemoved.checked);
  const showC = !!(fChanged && fChanged.checked);
  for (const tr of diffBody.querySelectorAll("tr")) {
    const t = tr.dataset.change; // added|removed|changed
    const visible =
      (t === "added"   && showA) ||
      (t === "removed" && showR) ||
      (t === "changed" && showC);
    tr.style.display = visible ? "" : "none";
  }
}

// ---------- Target selection ----------
function setTarget(url) {
  targetUrl = url;
  targetLabel.textContent = url || "(none)";
  const enabled = /^https?:/i.test(url || "");
  saveBeforeBtn.disabled = !enabled;
  saveAfterBtn.disabled  = !enabled;
  clearBtn.disabled      = !enabled;
  chrome.storage.local.set({ lastTargetUrl: targetUrl }).catch(()=>{});
}

// ---------- Events ----------
useActiveBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  targetUrlInp.value = tab.url;
  setTarget(tab.url);
});

setTargetBtn.addEventListener("click", () => {
  const val = targetUrlInp.value.trim();
  setTarget(val);
});

refreshBtn.addEventListener("click", async () => {
  if (!/^https?:/i.test(targetUrl || "")) {
    statusEl.textContent = "Set a valid http(s) target first.";
    return;
  }
  statusEl.textContent = "Fetching cookies…";
  const { error, cookies } = await getCookiesForUrl(targetUrl);
  if (error) { statusEl.textContent = "Error: " + error; return; }
  statusEl.textContent = `${cookies.length} cookie(s) found`;
  renderCookies(cookies);
});


saveBeforeBtn.addEventListener("click", async () => {
  const { cookies } = await getCookiesForUrl(targetUrl);
  const snaps = await saveSnapshot(targetUrl, "before", cookies);
  snapMeta.textContent = `Saved BEFORE @ ${new Date(snaps.before.when).toLocaleString()} (${snaps.before.count} cookies)`;
  renderDiff(targetUrl, snaps);
});

saveAfterBtn.addEventListener("click", async () => {
  const { cookies } = await getCookiesForUrl(targetUrl);
  const snaps = await saveSnapshot(targetUrl, "after", cookies);
  snapMeta.textContent = `Saved AFTER  @ ${new Date(snaps.after.when).toLocaleString()} (${snaps.after.count} cookies)`;
  renderDiff(targetUrl, snaps);
});

clearBtn.addEventListener("click", async () => {
  if (!targetUrl) return;
  await clearSnapshots(targetUrl);
  snapMeta.textContent = "Cleared snapshots.";
  diffPanel.hidden = true;
});

// Filters
[fAdded, fRemoved, fChanged].forEach(cb => cb?.addEventListener("change", applyDiffFilters));

// ---------- Init ----------
(async function init() {
  // Restore last target (optional convenience)
  const saved = await chrome.storage.local.get("lastTargetUrl");
  if (saved.lastTargetUrl) {
    targetUrlInp.value = saved.lastTargetUrl;
    setTarget(saved.lastTargetUrl);
  }
})();
