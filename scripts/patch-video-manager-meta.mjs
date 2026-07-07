import fs from "node:fs";

const path = "admin/video-manager/index.html";
let html = fs.readFileSync(path, "utf8");

const cssNeedle = "    .split { display: grid; grid-template-columns: 1fr 140px; gap: 10px; }\n";
const cssInsert = `    .split { display: grid; grid-template-columns: 1fr 140px; gap: 10px; }
    .url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .metadata-grid { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: start; }
    .thumb-preview { width: 96px; aspect-ratio: 9 / 16; overflow: hidden; display: grid; place-items: center; border: 1px dashed rgba(128,128,128,.32); border-radius: 12px; background: var(--surface2); color: var(--muted); font-size: 11px; font-weight: 800; text-align: center; }
    .thumb-preview img { width: 100%; height: 100%; object-fit: cover; }
    .metadata-fields { display: grid; gap: 10px; }
`;
html = html.replace(cssNeedle, cssInsert);
html = html.replace(
  "@media (max-width: 900px) { .topbar { padding: 10px 16px; } main { padding: 38px 16px 56px; } .layout { grid-template-columns: 1fr; } .split { grid-template-columns: 1fr; } }",
  "@media (max-width: 900px) { .topbar { padding: 10px 16px; } main { padding: 38px 16px 56px; } .layout { grid-template-columns: 1fr; } .split, .url-row, .metadata-grid { grid-template-columns: 1fr; } .thumb-preview { width: 120px; } }"
);

html = html.replace(
  `<p class="copy">Save TikTok video links, captions and the spreadsheet items featured in each video. No MP4 storage needed.</p>`,
  `<p class="copy">Save TikTok video links, auto-fetch captions/thumbnails, and attach spreadsheet items featured in each video.</p>`
);

html = html.replace(
  `<p class="panel-sub">Paste the TikTok link, paste or type the caption, then tick every item shown in the video.</p>`,
  `<p class="panel-sub">Paste the TikTok link, press Fetch from TikTok, then tick every item shown in the video.</p>`
);

html = html.replace(
  `          <div class="field">
            <label for="tiktok-url">TikTok Link</label>
            <input id="tiktok-url" type="url" placeholder="https://www.tiktok.com/@.../video/..." required>
          </div>

          <div class="field">
            <label for="caption">Caption</label>
            <textarea id="caption" placeholder="Paste the TikTok caption here..." required></textarea>
          </div>`,
  `          <div class="field">
            <label for="tiktok-url">TikTok Link</label>
            <div class="url-row">
              <input id="tiktok-url" type="url" placeholder="https://www.tiktok.com/@.../video/..." required>
              <button class="btn" id="fetch-meta-btn" type="button">Fetch from TikTok</button>
            </div>
          </div>

          <div class="field">
            <label for="caption">Caption</label>
            <textarea id="caption" placeholder="Press Fetch from TikTok or paste the caption here..." required></textarea>
          </div>

          <div class="field">
            <label>Fetched Metadata</label>
            <div class="metadata-grid">
              <div class="thumb-preview" id="thumbnail-preview">No thumbnail</div>
              <div class="metadata-fields">
                <input id="thumbnail-url" type="url" placeholder="Thumbnail URL" readonly>
                <input id="author-name" type="text" placeholder="Author name" readonly>
              </div>
            </div>
          </div>`
);

html = html.replace(
  `const saveBtn = document.getElementById("save-btn");
    const resetBtn = document.getElementById("reset-btn");`,
  `const saveBtn = document.getElementById("save-btn");
    const resetBtn = document.getElementById("reset-btn");
    const fetchMetaBtn = document.getElementById("fetch-meta-btn");`
);
html = html.replace(
  `const videoList = document.getElementById("video-list");`,
  `const videoList = document.getElementById("video-list");
    const thumbnailUrlInput = document.getElementById("thumbnail-url");
    const authorNameInput = document.getElementById("author-name");
    const thumbnailPreview = document.getElementById("thumbnail-preview");`
);

html = html.replace(
  `function setStatus(message, type = "") {
      statusEl.textContent = message;
      statusEl.className = \`status \${type}\`.trim();
    }`,
  `function setStatus(message, type = "") {
      statusEl.textContent = message;
      statusEl.className = \`status \${type}\`.trim();
    }

    function setThumbnail(url) {
      thumbnailUrlInput.value = url || "";
      thumbnailPreview.innerHTML = url
        ? \`<img src="\${escapeHtml(url)}" alt="Fetched TikTok thumbnail">\`
        : "No thumbnail";
    }`
);

html = html.replace(
  `function resetForm() {
      form.reset();
      document.getElementById("sort-order").value = "0";
      selectedItemIds.clear();
      renderItems();
      setStatus("");
    }`,
  `function resetForm() {
      form.reset();
      document.getElementById("sort-order").value = "0";
      selectedItemIds.clear();
      setThumbnail("");
      authorNameInput.value = "";
      renderItems();
      setStatus("");
    }

    async function fetchTikTokMetadata() {
      const tiktokUrl = document.getElementById("tiktok-url").value.trim();
      if (!tiktokUrl) {
        setStatus("Paste a TikTok link first.", "error");
        return;
      }

      fetchMetaBtn.disabled = true;
      fetchMetaBtn.textContent = "Fetching...";
      setStatus("Fetching TikTok metadata...");

      try {
        const response = await fetch("/api/tiktok-meta", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: tiktokUrl })
        });

        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Could not fetch metadata.");

        if (data.caption && !document.getElementById("caption").value.trim()) {
          document.getElementById("caption").value = data.caption;
        }

        if (data.title && !document.getElementById("video-title").value.trim()) {
          document.getElementById("video-title").value = data.title.slice(0, 80);
        }

        setThumbnail(data.thumbnailUrl || "");
        authorNameInput.value = data.authorName || "";
        setStatus(\`Fetched metadata from TikTok\${data.source ? \` via \${data.source}\` : ""}.\`, "ok");
      } catch (error) {
        setStatus(\`${error.message} You can still paste the caption manually.\`, "error");
      } finally {
        fetchMetaBtn.disabled = false;
        fetchMetaBtn.textContent = "Fetch from TikTok";
      }
    }`
);

html = html.replace(
  `resetBtn.addEventListener("click", resetForm);
    signOutBtn.addEventListener("click", () => signOut(auth));`,
  `resetBtn.addEventListener("click", resetForm);
    fetchMetaBtn.addEventListener("click", fetchTikTokMetadata);
    signOutBtn.addEventListener("click", () => signOut(auth));`
);

html = html.replace(
  `caption: document.getElementById("caption").value.trim(),
          sortOrder: Number(document.getElementById("sort-order").value || 0),`,
  `caption: document.getElementById("caption").value.trim(),
          thumbnailUrl: thumbnailUrlInput.value.trim(),
          authorName: authorNameInput.value.trim(),
          sortOrder: Number(document.getElementById("sort-order").value || 0),`
);

html = html.replace(
  `sort \${Number(video.sortOrder || 0)}</div>`,
  `sort \${Number(video.sortOrder || 0)}\${video.thumbnailUrl ? " · thumbnail saved" : ""}</div>`
);

fs.writeFileSync(path, html);
console.log("Patched admin/video-manager/index.html");
