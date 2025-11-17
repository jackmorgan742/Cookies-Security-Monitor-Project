// --- DOM ---
const useActiveBtn = document.getElementById("useActiveTab");
const setTargetBtn  = document.getElementById("setTarget");
const targetUrlInp  = document.getElementById("targetUrl");
const targetLabel   = document.getElementById("targetLabel");
const statusEl      = document.getElementById("status");

const refreshBtn    = document.getElementById("refresh");
const saveBeforeBtn = document.getElementById("saveBefore");
const saveAfterBtn  = document.getElementById("saveAfter");
const clearBtn      = document.getElementById("clearSnapshots");
const snapMeta      = document.getElementById("snapMeta");

const diffPanel   = document.getElementById("diffPanel");
const diffMeta    = document.getElementById("diffMeta");
const diffSummary = document.getElementById("diffSummary");
const diffBody    = document.getElementById("diffBody");
const cookieBody  = document.getElementById("cookieBody");

// --- state ---
let targetUrl = "";

// --- helpers ---
function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));}
function bool(b){return b?"✓":"✗";}
function fmtExp(c){
  if (c.session) return "session";
  if (!c.expirationDate) return "—";
  const ts = isNaN(c.expirationDate) ? Date.parse(c.expirationDate) : Number(c.expirationDate)*1000;
  return isNaN(ts) ? String(c.expirationDate) : new Date(ts).toLocaleString();
}
function notes(c){
  const out=[];
  const ss=(c.sameSite||"unspecified").toString();
  if(!c.secure) out.push("No Secure");
  if(!c.httpOnly) out.push("No HttpOnly");
  if(ss==="unspecified") out.push("No SameSite");
  if(ss==="no_restriction" && !c.secure) out.push("SameSite=None without Secure");
  return out;
}
function cookieKey(c){ return `${c.name}|${c.domain}|${c.path}|${c.storeId||""}`; }
function storageKey(url){ return `snapshots::${url}`; }

async function getCookiesForUrl(url){
  return new Promise(resolve=>{
    chrome.runtime.sendMessage({type:"GET_COOKIES_FOR_URL", url}, (res)=>{
      if(chrome.runtime.lastError) return resolve({error: chrome.runtime.lastError.message, cookies:[]});
      if(!res) return resolve({error:"No response from background", cookies:[]});
      if(res.error) return resolve({error:res.error, cookies:[]});
      resolve({cookies: res.cookies||[]});
    });
  });
}

async function loadSnapshots(url){
  const obj = await chrome.storage.local.get(storageKey(url));
  return obj[storageKey(url)] || { before:null, after:null };
}
async function saveSnapshot(url, kind, cookies){
  const snaps = await loadSnapshots(url);
  snaps[kind] = {
    when: Date.now(),
    count: cookies.length,
    byKey: Object.fromEntries(cookies.map(c=>[cookieKey(c), c]))
  };
  await chrome.storage.local.set({ [storageKey(url)]: snaps });
  return snaps;
}
async function clearSnapshots(url){
  await chrome.storage.local.remove(storageKey(url));
}

function diffSnapshots(beforeSnap, afterSnap){
  const added=[], removed=[], changed=[];
  const b=beforeSnap?.byKey||{}, a=afterSnap?.byKey||{};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for(const k of keys){
    const cb=b[k], ca=a[k];
    if(cb && !ca) { removed.push(cb); continue; }
    if(!cb && ca) { added.push(ca); continue; }
    if(cb && ca){
      const diffs=[];
      if(!!cb.secure!==!!ca.secure) diffs.push(`Secure: ${bool(!!cb.secure)} → ${bool(!!ca.secure)}`);
      if(!!cb.httpOnly!==!!ca.httpOnly) diffs.push(`HttpOnly: ${bool(!!cb.httpOnly)} → ${bool(!!ca.httpOnly)}`);
      const ssb=(cb.sameSite||"unspecified").toString(), ssa=(ca.sameSite||"unspecified").toString();
      if(ssb!==ssa) diffs.push(`SameSite: ${ssb} → ${ssa}`);
      const expb=fmtExp(cb), expa=fmtExp(ca);
      if(expb!==expa) diffs.push(`Expires: ${expb} → ${expa}`);
      if((cb.value??"")!==(ca.value??"")){
        const lb=(cb.value??"").length, la=(ca.value??"").length;
        diffs.push(`Value changed (${lb}→${la} chars)`);
      }
      if(diffs.length) changed.push({before:cb, after:ca, diffs});
    }
  }
  return {added, removed, changed};
}

function renderCookies(list){
  cookieBody.innerHTML="";
  for(const c of list){
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHTML(c.name)}</td>
      <td class="mono">${escapeHTML(c.value??"")}</td>
      <td class="mono">${escapeHTML(c.domain)}</td>
      <td>${fmtExp(c)}</td>
      <td>${bool(!!c.secure)}</td>
      <td>${bool(!!c.httpOnly)}</td>
      <td>${escapeHTML(c.sameSite||"unspecified")}</td>
      <td>${notes(c).map(n=>`<span class="chip bad">${escapeHTML(n)}</span>`).join(" ")||"—"}</td>
    `;
    cookieBody.appendChild(tr);
  }
}

function renderDiff(url, snaps){
  const {before, after}=snaps;
  const ready = !!before && !!after;
  diffPanel.hidden = !ready;
  diffBody.innerHTML=""; diffSummary.innerHTML=""; diffMeta.textContent="";
  if(!ready) return;
  const d = diffSnapshots(before, after);
  diffMeta.textContent = `URL: ${url} • BEFORE: ${new Date(before.when).toLocaleString()} (${before.count}) → AFTER: ${new Date(after.when).toLocaleString()} (${after.count})`;
  diffSummary.innerHTML = [
    `<strong>Added</strong>: ${d.added.length}`,
    `<strong>Removed</strong>: ${d.removed.length}`,
    `<strong>Changed</strong>: ${d.changed.length}`
  ].map(x=>`<li>${x}</li>`).join("");

  const row = (type, c, chips=[]) => `
    <tr>
      <td>${type}</td>
      <td class="mono">${escapeHTML(c.name)}</td>
      <td class="mono">${escapeHTML(c.domain)}</td>
      <td class="mono">${escapeHTML(c.path)}</td>
      <td>${bool(!!c.secure)}</td>
      <td>${bool(!!c.httpOnly)}</td>
      <td>${escapeHTML(c.sameSite||"unspecified")}</td>
      <td>${fmtExp(c)}</td>
      <td>${chips.map(n=>`<span class="chip ${/No|None/.test(n)?'bad':'good'}">${escapeHTML(n)}</span>`).join(" ")||"—"}</td>
    </tr>`;
  d.added.forEach(c=>diffBody.insertAdjacentHTML("beforeend", row("Added", c, notes(c))));
  d.removed.forEach(c=>diffBody.insertAdjacentHTML("beforeend", row("Removed", c, notes(c))));
  d.changed.forEach(({before, after, diffs})=>{
    diffBody.insertAdjacentHTML("beforeend", row("Changed (BEFORE)", before, notes(before)));
    diffBody.insertAdjacentHTML("beforeend", row("Changed (AFTER)",  after,  diffs.concat(notes(after))));
  });
}

function setTarget(url){
  targetUrl = url;
  targetLabel.textContent = url || "(none)";
  const enabled = /^https?:/i.test(url||"");
  saveBeforeBtn.disabled = !enabled;
  saveAfterBtn.disabled  = !enabled;
  clearBtn.disabled      = !enabled;
}

// --- events ---
useActiveBtn.addEventListener("click", async ()=>{
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
  if(!tab?.url) return;
  targetUrlInp.value = tab.url;
  setTarget(tab.url);
});

setTargetBtn.addEventListener("click", ()=>{
  setTarget(targetUrlInp.value.trim());
});

refreshBtn.addEventListener("click", async ()=>{
  if(!/^https?:/i.test(targetUrl||"")) { statusEl.textContent="Set a valid http(s) target first."; return; }
  statusEl.textContent="Fetching cookies…";
  const {error, cookies} = await getCookiesForUrl(targetUrl);
  if(error){ statusEl.textContent="Error: "+error; return; }
  statusEl.textContent=`${cookies.length} cookie(s) found`;
  renderCookies(cookies);
});

saveBeforeBtn.addEventListener("click", async ()=>{
  const {cookies} = await getCookiesForUrl(targetUrl);
  const snaps = await saveSnapshot(targetUrl, "before", cookies);
  snapMeta.textContent = `Saved BEFORE @ ${new Date(snaps.before.when).toLocaleString()} (${snaps.before.count} cookies)`;
  renderDiff(targetUrl, snaps);
});

saveAfterBtn.addEventListener("click", async ()=>{
  const {cookies} = await getCookiesForUrl(targetUrl);
  const snaps = await saveSnapshot(targetUrl, "after", cookies);
  snapMeta.textContent = `Saved AFTER  @ ${new Date(snaps.after.when).toLocaleString()} (${snaps.after.count} cookies)`;
  renderDiff(targetUrl, snaps);
});

clearBtn.addEventListener("click", async ()=>{
  if(!targetUrl) return;
  await clearSnapshots(targetUrl);
  snapMeta.textContent = "Cleared snapshots.";
  diffPanel.hidden = true;
});

// --- init ---
(async function init(){
  // Restore last target if you want (optional; comment out if not desired)
  const saved = await chrome.storage.local.get("lastTargetUrl");
  if(saved.lastTargetUrl){ targetUrlInp.value = saved.lastTargetUrl; setTarget(saved.lastTargetUrl); }
})();
window.addEventListener("beforeunload", ()=>{
  if(targetUrl) chrome.storage.local.set({ lastTargetUrl: targetUrl });
});
