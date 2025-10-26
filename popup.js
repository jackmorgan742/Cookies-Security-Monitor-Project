// popup.js
document.addEventListener("DOMContentLoaded", () => {
    const status = document.getElementById("status");
    const tbody = document.getElementById("tbody");
    const cookiesTable = document.getElementById("cookiesTable");
    const urlDiv = document.getElementById("url");
    const refreshBtn = document.getElementById("refreshBtn");
  
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
          valueTd.textContent = c.value;
          tr.appendChild(valueTd);
  
          const domainTd = document.createElement("td");
          domainTd.textContent = c.domain;
          tr.appendChild(domainTd);
  
          const expTd = document.createElement("td");
          expTd.textContent = c.session ? "session" : (c.expirationDate || "—");
          tr.appendChild(expTd);
  
          const flagsTd = document.createElement("td");

          const secureTd = document.createElement("td");
          secureTd.textContent = c.secure;
          tr.appendChild(secureTd);

          const httpOnlyTd = document.createElement("td");
          httpOnlyTd.textContent = c.httpOnly;
          tr.appendChild(httpOnlyTd);

          const sameSiteTd = document.createElement("td");
          sameSiteTd.textContent = c.sameSite;
          tr.appendChild(sameSiteTd);

          tbody.appendChild(tr);
        });
  
      });
    }
  
    refreshBtn.addEventListener("click", update);
  
    update();
  });
  
  