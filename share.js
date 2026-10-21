"use strict";

// ==========================================
// SUN & SKY — SHARING (no server needed)
// Send your memories as a file, add a friend's file,
// and see both on the same calendar date.
// Load this AFTER app.js
// ==========================================

let sharedDb = null;
let sharedMemories = [];

// ---------- Separate database for friends' memories ----------

function openSharedDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("SunAndSkyShared", 1);

    request.onupgradeneeded = event => {
      event.target.result.createObjectStore("shared", { keyPath: "id" });
    };
    request.onsuccess = event => {
      sharedDb = event.target.result;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function loadShared() {
  return new Promise((resolve, reject) => {
    const request = sharedDb
      .transaction("shared", "readonly")
      .objectStore("shared")
      .getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function putShared(record) {
  return new Promise((resolve, reject) => {
    const tx = sharedDb.transaction("shared", "readwrite");
    tx.objectStore("shared").put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function removeOwner(owner) {
  return new Promise((resolve, reject) => {
    const tx = sharedDb.transaction("shared", "readwrite");
    const store = tx.objectStore("shared");

    sharedMemories
      .filter(item => item.owner === owner)
      .forEach(item => store.delete(item.id));

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Send my memories ----------

async function exportMine() {
  if (!memories.length) {
    alert("Add some photos first, then you can send them! 📸");
    return;
  }

  const name = (prompt("Your name? (your friend will see it)") || "").trim();
  if (!name) return;

  const pack = { app: "sun-and-sky", owner: name, memories };
  const fileName = "memories-from-" + name.replace(/[^\w-]+/g, "_") + ".json";
  const blob = new Blob([JSON.stringify(pack)], { type: "application/json" });
  const file = new File([blob], fileName, { type: "application/json" });

  // On phones this opens the share sheet (WhatsApp, Messages, Drive...)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My Sun & Sky memories" });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  // Otherwise just download the file
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

// ---------- Add a friend's memories ----------

async function importPack(file) {
  try {
    const pack = JSON.parse(await file.text());

    if (pack.app !== "sun-and-sky" || !Array.isArray(pack.memories)) {
      throw new Error("Not a Sun & Sky file");
    }

    const owner = String(pack.owner || "Friend").slice(0, 40);

    await removeOwner(owner); // replaces their older copy

    for (const memory of pack.memories) {
      if (!isValidDateKey(memory.date)) continue;

      const photos = (Array.isArray(memory.photos) ? memory.photos : [])
        .filter(photo => String(photo.data).startsWith("data:image/"))
        .map(photo => ({
          data: photo.data,
          note: typeof photo.note === "string" ? photo.note : ""
        }));

      if (photos.length) {
        await putShared({
          id: owner + "|" + memory.date,
          owner,
          date: memory.date,
          photos
        });
      }
    }

    sharedMemories = await loadShared();
    refreshSharedUI();
    alert("Added " + owner + "'s memories! 💛");
  } catch (error) {
    alert("That doesn't look like a Sun & Sky memories file.");
  }
}

// ---------- Show friends' photos next to mine ----------

const baseRenderCalendar = renderCalendar;

renderCalendar = function () {
  baseRenderCalendar();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const dates = new Set(sharedMemories.map(item => item.date));

  grid.querySelectorAll(".day:not(.empty)").forEach(button => {
    const key = dateKey(year, month, Number(button.textContent));
    if (dates.has(key)) button.classList.add("has-memory");
  });
};

const baseRenderPhotoGallery = renderPhotoGallery;

renderPhotoGallery = function () {
  baseRenderPhotoGallery();

  sharedMemories
    .filter(item => item.date === selectedDate)
    .forEach(record => {
      const title = document.createElement("p");
      title.className = "scrapbook-note";
      title.textContent = "💛 From " + record.owner;
      photoGrid.appendChild(title);

      record.photos.forEach((photo, index) => {
        const frame = document.createElement("figure");
        frame.className = "scrapbook-photo";

        const image = document.createElement("img");
        image.src = photo.data;
        image.alt = record.owner + "'s memory " + (index + 1);
        image.loading = "lazy";

        const caption = document.createElement("figcaption");
        caption.textContent = photo.note || "♡ " + record.owner;

        frame.append(image, caption);
        photoGrid.appendChild(frame);
      });
    });
};

// ---------- Buttons on the calendar page ----------

const shareStyle = document.createElement("style");
shareStyle.textContent = `
  .share-buttons { display: grid; gap: 8px; margin-top: 8px; }
  .share-buttons .text-btn { margin: 0; text-align: center; cursor: pointer; display: block; }
  .friend-row { display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-top: 8px; padding: 8px 12px; border: 1px dashed var(--accent);
    border-radius: 10px; background: var(--surface-alt); font-size: 12px; }
  .friend-row button { border: 1px solid #B33A3A; background: transparent;
    color: #B33A3A; border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 700; }
`;
document.head.appendChild(shareStyle);

const friendList = document.createElement("div");

function buildShareCard() {
  const card = document.createElement("section");
  card.className = "theme-section";
  card.innerHTML = `
    <span class="eyebrow">SHARE YOUR MEMORIES</span>
    <div class="share-buttons">
      <button id="exportBtn" class="text-btn" type="button">📤 Send my memories</button>
      <label class="text-btn">📥 Add a friend's memories
        <input id="importInput" type="file" accept=".json,application/json" hidden>
      </label>
    </div>
  `;
  card.appendChild(friendList);
  calendarPage.insertBefore(card, backHomeBtn);

  card.querySelector("#exportBtn").addEventListener("click", exportMine);
  card.querySelector("#importInput").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (file) importPack(file);
  });
}

function refreshSharedUI() {
  friendList.replaceChildren();

  const owners = [...new Set(sharedMemories.map(item => item.owner))];

  owners.forEach(owner => {
    const days = sharedMemories.filter(item => item.owner === owner).length;

    const row = document.createElement("div");
    row.className = "friend-row";

    const label = document.createElement("span");
    label.textContent = "💛 " + owner + " · " + days + (days === 1 ? " day" : " days");

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      if (!confirm("Remove " + owner + "'s memories from this device?")) return;
      await removeOwner(owner);
      sharedMemories = await loadShared();
      refreshSharedUI();
    });

    row.append(label, remove);
    friendList.appendChild(row);
  });

  renderCalendar();
  if (dialog.open) renderPhotoGallery();
}

(async function startSharing() {
  buildShareCard();

  try {
    await openSharedDb();
    sharedMemories = await loadShared();
  } catch (error) {
    console.error("Sharing storage error:", error);
  }

  refreshSharedUI();
})();
