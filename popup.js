// popup.js
document.addEventListener("DOMContentLoaded", () => {
    const status = document.getElementById("status");
    const tbody = document.getElementById("tbody");
    const cookiesTable = document.getElementById("cookiesTable");
    const urlDiv = document.getElementById("url");
    const refreshBtn = document.getElementById("refreshBtn");
    const exportBtn = document.getElementById("exportBtn");
  
    async function update() {
      status.textContent = "Getting active tab...";
      tbody.innerHTML = "";
      cookiesTable.hidden = true;
  
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        status.textContent = "No active tab or URL available.";
        urlDiv.textContent = "";
        return;
      }
      urlDiv.textContent = tab.url;
      status.textContent = "Fetching cookies...";
  
      chrome.runtime.sendMessage({ type: "GET_COOKIES_FOR_URL", url: tab.url }, (response) => {
        if (chrome.runtime.lastError) {
          status.textContent = "Error: " + chrome.runtime.lastError.message;
          return;
        }
        if (!response) {
          status.textContent = "No response from background script.";
          return;
        }
        if (response.error) {
          status.textContent = "Error: " + response.error;
          return;
        }
        const cookies = response.cookies || [];
        if (!cookies.length) {
          status.textContent = "No cookies found for this page.";
          return;
        }
        status.textContent = `${cookies.length} cookie(s) found`;
        cookiesTable.hidden = false;
  
        cookies.forEach(c => {
          const tr = document.createElement("tr");
  
          const nameTd = document.createElement("td");
          nameTd.textContent = c.name;
          tr.appendChild(nameTd);
  
          const valueTd = document.createElement("td");
          // short value preview with ability to expand on click
          const short = c.value.length > 120 ? (c.value.slice(0,120) + "…") : c.value;
          valueTd.textContent = short;
          if (c.value.length > 120) {
            valueTd.title = "Click to copy full value";
            valueTd.style.cursor = "pointer";
            valueTd.addEventListener("click", () => {
              navigator.clipboard.writeText(c.value).then(() => {
                valueTd.style.outline = "2px solid #6cf";
                setTimeout(()=> valueTd.style.outline="", 700);
              });
            });
          }
          tr.appendChild(valueTd);
  
          const domainTd = document.createElement("td");
          domainTd.textContent = c.domain;
          tr.appendChild(domainTd);
  
          const pathTd = document.createElement("td");
          pathTd.textContent = c.path;
          tr.appendChild(pathTd);
  
          const expTd = document.createElement("td");
          expTd.textContent = c.session ? "session" : (c.expirationDate || "—");
          tr.appendChild(expTd);
  
          const flagsTd = document.createElement("td");
          const flags = [];
          if (c.secure) flags.push("Secure");
          if (c.httpOnly) flags.push("HttpOnly");
          if (c.hostOnly) flags.push("HostOnly");
          if (c.sameSite) flags.push("SameSite:" + c.sameSite);
          flagsTd.textContent = flags.join(", ") || "—";
          tr.appendChild(flagsTd);
  
          tbody.appendChild(tr);
        });
  
        // attach export behavior
       /* exportBtn.onclick = () => {
          const json = JSON.stringify(cookies, null, 2);
          navigator.clipboard.writeText(json).then(() => {
            status.textContent = "Cookies copied to clipboard as JSON.";
          }, () => {
            // fallback: open new tab with data
            const w = window.open("");
            w.document.write("<pre>" + escapeHtml(json) + "</pre>");
          });
        };*/
      });
    }
  
    refreshBtn.addEventListener("click", update);
  
    update();
  });
  
  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  