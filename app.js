
"use strict";

// ==========================================
// SUN & SKY — MEMORY BOOK ☀️
// ==========================================

const $ = id => document.getElementById(id);

const welcomePage = $("welcomePage");
const calendarPage = $("calendarPage");
const peekPage = $("peekPage");

const startBtn = $("startBtn");
const peekBtn = $("peekBtn");
const brandHome = $("brandHome");
const backHomeBtn = $("backHomeBtn");
const backCalendarBtn = $("backCalendarBtn");

const grid = $("calendarGrid");
const monthTitle = $("monthTitle");
const monthSubtitle = $("monthSubtitle");

const dialog = $("memoryDialog");
const dateTitle = $("selectedDateTitle");
const dateSubtitle = $("selectedDateSubtitle");
const photoGrid = $("photoGrid");
const photoInput = $("photoInput");
const saveStatus = $("saveStatus");

const memoryList = $("memoryList");
const memoryCount = $("memoryCount");

const prevMonthBtn = $("prevMonth");
const nextMonthBtn = $("nextMonth");

let currentMonth = new Date();
currentMonth.setDate(1);

let selectedDate = null;
let memories = [];
let db = null;
let storageReady = false;
let isSaving = false;

// ==========================================
// PAGE NAVIGATION
// ==========================================

function showPage(page) {
  welcomePage.hidden = page !== "welcome";
  calendarPage.hidden = page !== "calendar";
  peekPage.hidden = page !== "peek";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

startBtn.addEventListener("click", () => showPage("calendar"));
brandHome.addEventListener("click", event => {
  event.preventDefault();
  showPage("welcome");
});
backHomeBtn.addEventListener("click", () => showPage("welcome"));

peekBtn.addEventListener("click", () => {
  renderMemoryList();
  showPage("peek");
});

backCalendarBtn.addEventListener("click", () => showPage("calendar"));

// Swipe right on the welcome screen to start.
let touchStartX = 0;
let touchStartY = 0;

welcomePage.addEventListener("touchstart", event => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

welcomePage.addEventListener("touchend", event => {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  if (dx > 75 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    showPage("calendar");
  }
}, { passive: true });

// ==========================================
// THEME SELECTOR
// ==========================================

const themeButtons = document.querySelectorAll(".theme-option");

function applyTheme(theme) {
  const allowed = ["90s", "lovey-dovey", "memories"];

  if (!allowed.includes(theme)) theme = "90s";

  document.body.classList.remove(
    "theme-90s",
    "theme-lovey-dovey",
    "theme-memories"
  );

  document.body.classList.add("theme-" + theme);

  themeButtons.forEach(button => {
    const active = button.dataset.theme === theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const themeColor = {
    "90s": "#8F1D2C",
    "lovey-dovey": "#E8A6B5",
    "memories": "#D8EAF7"
  };

  document.querySelector('meta[name="theme-color"]')
    .setAttribute("content", themeColor[theme]);

  try {
    localStorage.setItem("sunsky-theme", theme);
  } catch (error) {
    // Theme still works for this session.
  }
}

themeButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.theme);
  });
});

try {
  applyTheme(localStorage.getItem("sunsky-theme") || "90s");
} catch (error) {
  applyTheme("90s");
}

// ==========================================
// STATUS AND DATE HELPERS
// ==========================================

function showStatus(message) {
  saveStatus.textContent = message;
}

function dateKey(year, month, day) {
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function isValidDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function prettyDate(key) {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "long", year: "numeric" }
  );
}

function makeId() {
  if (window.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "photo-" + Date.now() + "-" +
    Math.random().toString(36).slice(2);
}

// ==========================================
// EXISTING INDEXEDDB DATABASE
// ==========================================

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }

    let request;

    try {
      request = indexedDB.open("SunAndSkyDB", 1);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("memories")) {
        database.createObjectStore("memories", { keyPath: "date" });
      }
    };

    request.onsuccess = event => {
      db = event.target.result;

      db.onversionchange = () => {
        db.close();
        db = null;
        storageReady = false;
        showStatus("Please refresh the app to reconnect storage.");
      };

      resolve(db);
    };

    request.onerror = () => {
      reject(request.error || new Error("Could not open storage."));
    };
  });
}

function loadMemories() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not ready."));
      return;
    }

    const transaction = db.transaction("memories", "readonly");
    const request = transaction.objectStore("memories").getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(
      request.error || new Error("Could not load memories.")
    );
  });
}

function saveMemory(memory) {
  return new Promise((resolve, reject) => {
    if (!db || !storageReady) {
      reject(new Error("Storage isn't ready. Refresh and retry."));
      return;
    }

    let transaction;

    try {
      transaction = db.transaction("memories", "readwrite");
      transaction.objectStore("memories").put(memory);
    } catch (error) {
      reject(error);
      return;
    }

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(
      transaction.error || new Error("Save failed.")
    );
    transaction.onabort = () => reject(
      transaction.error || new Error("Save interrupted.")
    );
  });
}

// Give older photos IDs and notes without deleting their existing data.
function normalizeMemories(items) {
  const usedIds = new Set();

  return items.map(memory => ({
    ...memory,
    photos: (Array.isArray(memory.photos) ? memory.photos : [])
      .map(photo => {
        let id = photo.id || makeId();

        while (usedIds.has(id)) id = makeId();
        usedIds.add(id);

        return {
          ...photo,
          id,
          note: typeof photo.note === "string" ? photo.note : ""
        };
      })
  }));
}

// ==========================================
// CALENDAR
// ==========================================

function renderCalendar() {
  grid.replaceChildren();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  monthTitle.textContent = currentMonth.toLocaleDateString(
    "en-IN",
    { month: "long", year: "numeric" }
  );

  monthSubtitle.textContent = "A month full of possibilities ✨";

  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayKey = dateKey(
    today.getFullYear(), today.getMonth(), today.getDate()
  );

  const datesWithMemories = new Set(
    memories
      .filter(memory => memory.photos && memory.photos.length)
      .map(memory => memory.date)
  );

  for (let i = 0; i < offset; i++) {
    const blank = document.createElement("div");
    blank.className = "day empty";
    blank.setAttribute("aria-hidden", "true");
    grid.appendChild(blank);
  }

  for (let day = 1; day <= totalDays; day++) {
    const key = dateKey(year, month, day);
    const button = document.createElement("button");

    button.type = "button";
    button.className = "day";
    button.textContent = day;
    button.setAttribute("aria-label", prettyDate(key));

    if (key === todayKey) button.classList.add("today");
    if (key === selectedDate) button.classList.add("selected");

    if (datesWithMemories.has(key)) {
      button.classList.add("has-memory");
      button.setAttribute(
        "aria-label", prettyDate(key) + ", has memories"
      );
    }

    button.addEventListener("click", () => openDate(key));
    grid.appendChild(button);
  }
}

prevMonthBtn.addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
});

// ==========================================
// OPEN A DATE'S SCRAPBOOK
// ==========================================

function openDate(key) {
  if (!isValidDateKey(key)) return;

  selectedDate = key;

  dateTitle.textContent = "Your memories ♡";
  dateSubtitle.textContent = prettyDate(key);

  showStatus("");

  try {
    sessionStorage.setItem("sunsky-date", key);
  } catch (error) {
    // Optional.
  }

  renderPhotoGallery();
  renderCalendar();

  if (!dialog.open) dialog.showModal();
}

function renderPhotoGallery() {
  photoGrid.replaceChildren();

  const memory = memories.find(item => item.date === selectedDate);
  const photos = memory ? memory.photos || [] : [];

  if (!photos.length) {
    const empty = document.createElement("p");
    empty.className = "dialog-subtitle";
    empty.textContent =
      "A fresh page, waiting for a memory. Add your first photo! ☀️";
    photoGrid.appendChild(empty);
    return;
  }

  photos.forEach((photo, index) => {
    const frame = document.createElement("figure");
    frame.className = "scrapbook-photo";

    const image = document.createElement("img");
    image.src = photo.data;
    image.alt = "Memory " + (index + 1) + " from " +
      prettyDate(selectedDate);
    image.loading = "lazy";

    const caption = document.createElement("figcaption");
    caption.textContent = "♡ Photo " + (index + 1);

    const noteLabel = document.createElement("label");
    noteLabel.className = "photo-note-label";
    noteLabel.textContent = "A note for THIS photo ✍️";

    const noteInput = document.createElement("textarea");
    noteInput.className = "photo-note-input";
    noteInput.value = photo.note || "";
    noteInput.placeholder = "What is special about this picture?";
    noteInput.maxLength = 2000;
    noteLabel.htmlFor = "note-" + photo.id;
    noteInput.id = "note-" + photo.id;

    const actions = document.createElement("div");
    actions.className = "photo-action-row";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "save-photo-note";
    saveButton.textContent = "Save note ♡";
    saveButton.addEventListener("click", () => {
      updatePhotoNote(photo.id, noteInput.value);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-photo-btn";
    deleteButton.textContent = "Delete photo";
    deleteButton.addEventListener("click", () => {
      deletePhoto(photo.id);
    });

    actions.append(saveButton, deleteButton);
    frame.append(image, caption, noteLabel, noteInput, actions);
    photoGrid.appendChild(frame);
  });
}

// ==========================================
// SAVE A NOTE FOR ONE PARTICULAR PHOTO
// ==========================================

async function updatePhotoNote(photoId, noteText) {
  if (isSaving) {
    showStatus("One moment! Another memory is being saved.");
    return;
  }

  const memory = memories.find(item => item.date === selectedDate);
  if (!memory) return;

  const photo = memory.photos.find(item => item.id === photoId);
  if (!photo) return;

  const previousNote = photo.note || "";
  photo.note = noteText.trim();

  isSaving = true;

  try {
    showStatus("Saving your little note... 💛");
    await saveMemory(memory);

    renderMemoryList();
    showStatus("This photo's note is saved! ♡");
  } catch (error) {
    photo.note = previousNote;
    showStatus("Couldn't save the note. Please try again.");
    renderPhotoGallery();
  } finally {
    isSaving = false;
  }
}

// ==========================================
// DELETE ONE PHOTO ONLY
// ==========================================

async function deletePhoto(photoId) {
  if (isSaving) {
    showStatus("Please wait for the current save to finish.");
    return;
  }

  const memory = memories.find(item => item.date === selectedDate);
  if (!memory) return;

  const photo = memory.photos.find(item => item.id === photoId);
  if (!photo) return;

  if (!window.confirm(
    "Delete this picture and its note? Other photos from this day will stay."
  )) return;

  isSaving = true;

  const oldPhotos = [...memory.photos];

  try {
    memory.photos = memory.photos.filter(item => item.id !== photoId);

    // If the last photo is deleted, remove this date's record.
    if (memory.photos.length === 0) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("memories", "readwrite");
        transaction.objectStore("memories").delete(memory.date);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });

      memories = memories.filter(item => item.date !== memory.date);
    } else {
      await saveMemory(memory);
    }

    renderPhotoGallery();
    renderCalendar();
    renderMemoryList();

    showStatus("Picture removed from your scrapbook.");
  } catch (error) {
    memory.photos = oldPhotos;
    showStatus("Couldn't delete the photo. Please try again.");
    renderPhotoGallery();
  } finally {
    isSaving = false;
  }
}

// ==========================================
// READ AND RESIZE NEW PHOTOS
// ==========================================

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read this photo."));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(
        new Error("This format isn't supported. Try JPEG or PNG.")
      );

      image.onload = () => {
        try {
          const scale = Math.min(
            1,
            1400 / Math.max(image.width, image.height)
          );

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));

          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not prepare the photo.");

          context.drawImage(
            image, 0, 0, canvas.width, canvas.height
          );

          resolve({
            id: makeId(),
            name: file.name,
            note: "",
            data: canvas.toDataURL("image/jpeg", 0.82)
          });
        } catch (error) {
          reject(error);
        }
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

// ==========================================
// ADD MORE PHOTOS WITHOUT LOSING OLD ONES
// ==========================================

photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files || []);

  if (!files.length) return;

  if (isSaving) {
    showStatus("Please wait for the current save to finish.");
    photoInput.value = "";
    return;
  }

  if (!storageReady || !db) {
    showStatus("Storage isn't ready. Refresh and retry.");
    photoInput.value = "";
    return;
  }

  if (!selectedDate) {
    showStatus("Choose a calendar date first.");
    photoInput.value = "";
    return;
  }

  const dateBeingSaved = selectedDate;
  isSaving = true;
  photoInput.disabled = true;

  try {
    const existing = memories.find(
      item => item.date === dateBeingSaved
    );

    const newPhotos = [];
    let failures = 0;

    for (let i = 0; i < files.length; i++) {
      showStatus("Preparing photo " + (i + 1) + " of " +
        files.length + "... 📸");

      try {
        newPhotos.push(await readPhoto(files[i]));
      } catch (error) {
        failures++;
      }
    }

    if (!newPhotos.length) {
      throw new Error("No usable photos were selected.");
    }

    const updated = {
      date: dateBeingSaved,
      photos: [
        ...(existing ? existing.photos : []),
        ...newPhotos
      ]
    };

    await saveMemory(updated);

    const index = memories.findIndex(
      item => item.date === dateBeingSaved
    );

    if (index >= 0) memories[index] = updated;
    else memories.push(updated);

    renderCalendar();
    renderMemoryList();

    if (selectedDate === dateBeingSaved && dialog.open) {
      renderPhotoGallery();
    }

    showStatus(
      newPhotos.length + " photo(s) added! ♡" +
      (failures ? " Some files couldn't be used." : "")
    );
  } catch (error) {
    showStatus("Couldn't add photos: " + error.message);
  } finally {
    isSaving = false;
    photoInput.disabled = false;
    photoInput.value = "";
  }
});

// ==========================================
// PEEK-A-BOO: ALL SAVED MEMORIES
// ==========================================

function renderMemoryList() {
  memoryList.replaceChildren();

  const totalPhotos = memories.reduce(
    (total, memory) => total + (memory.photos?.length || 0),
    0
  );

  memoryCount.textContent = totalPhotos +
    (totalPhotos === 1 ? " photo" : " photos");

  const sorted = [...memories]
    .filter(memory => memory.photos && memory.photos.length)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const sun = document.createElement("div");
    sun.className = "sun";
    sun.textContent = "☀️";

    const heading = document.createElement("h3");
    heading.textContent = "Nothing to peek at... yet!";

    const paragraph = document.createElement("p");
    paragraph.textContent =
      "Save a photo on your calendar and it will appear here. ♡";

    empty.append(sun, heading, paragraph);
    memoryList.appendChild(empty);
    return;
  }

  sorted.forEach(memory => {
    const card = document.createElement("article");
    card.className = "memory-card";
    card.tabIndex = 0;

    const firstPhoto = memory.photos[0];

    const image = document.createElement("img");
    image.src = firstPhoto.data;
    image.alt = "Memories from " + prettyDate(memory.date);
    image.loading = "lazy";

    const heading = document.createElement("h3");
    heading.textContent = prettyDate(memory.date);

    const description = document.createElement("p");
    description.textContent =
      memory.photos.length +
      (memory.photos.length === 1 ? " photo" : " photos");

    const notedPhoto = memory.photos.find(photo => photo.note);

    if (notedPhoto) {
      const note = document.createElement("p");
      note.textContent = "♡ " + notedPhoto.note;
      card.append(image, heading, description, note);
    } else {
      card.append(image, heading, description);
    }

    card.addEventListener("click", () => {
      showPage("calendar");
      openDate(memory.date);
    });

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showPage("calendar");
        openDate(memory.date);
      }
    });

    memoryList.appendChild(card);
  });
}

// ==========================================
// CLOSE AND START
// ==========================================

dialog.addEventListener("close", () => {
  try {
    sessionStorage.removeItem("sunsky-date");
  } catch (error) {
    // Optional.
  }

  renderCalendar();
});

async function startApp() {
  renderCalendar();
  renderMemoryList();
  showPage("welcome");

  try {
    const savedTheme = localStorage.getItem("sunsky-theme");
    if (savedTheme) applyTheme(savedTheme);
  } catch (error) {
    // Default theme.
  }

  try {
    showStatus("");
    await openDatabase();

    const loaded = await loadMemories();
    memories = normalizeMemories(loaded);

    storageReady = true;

    renderCalendar();
    renderMemoryList();

    // Persist IDs and empty per-photo notes for older records.
    for (const memory of memories) {
      await saveMemory(memory);
    }

    try {
      const lastDate = sessionStorage.getItem("sunsky-date");
      if (lastDate && isValidDateKey(lastDate)) {
        selectedDate = lastDate;
      }
    } catch (error) {
      // Optional.
    }
  } catch (error) {
    storageReady = false;
    console.error("Sun & Sky storage error:", error);
    // The welcome screen still opens if storage is unavailable.
  }
}

startApp();
