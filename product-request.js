import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getCountFromServer,
  serverTimestamp,
  Timestamp,
  documentId
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

const BRAND_NAME = "PAIKARI SELL";
const WEBSITE_URL = "https://paikarisell.ghotimarket.com";
const LOGO_URL = "https://paikarisell.ghotimarket.com/photo/logo.png";
const PAGE_SIZE = 20;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes safe session/cache window

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Application State
const state = {
  user: null,
  supplier: null,
  sessionCutoffTimestamp: null,
  sessionServerNowMs: null,
  lastVisibleDoc: null,
  hasMore: false,
  total30DaysCount: 0,
  loadedIds: new Set(),
  loadedItemsMap: new Map(),
  isLoadingInitial: false,
  isLoadingMore: false,
  isExporting: false,
  isCopyingId: null,
  selectedExportId: null,
  selectedExportFormat: "png",
  abortController: null
};

// DOM Elements
const els = {
  dashboardMain: document.getElementById("dashboardMain"),
  supplierBadge: document.getElementById("supplierBadge"),
  supplierNameText: document.getElementById("supplierNameText"),
  refreshDashboardBtn: document.getElementById("refreshDashboardBtn"),
  refreshIcon: document.getElementById("refreshIcon"),
  cutoffRangeText: document.getElementById("cutoffRangeText"),
  statTotal30Days: document.getElementById("statTotal30Days"),
  statLoadedCount: document.getElementById("statLoadedCount"),
  statRemainingCount: document.getElementById("statRemainingCount"),
  feedStatusBox: document.getElementById("feedStatusBox"),
  requestsGrid: document.getElementById("requestsGrid"),
  paginationBar: document.getElementById("paginationBar"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  loadMoreText: document.getElementById("loadMoreText"),
  retryMoreBtn: document.getElementById("retryMoreBtn"),
  gateModal: document.getElementById("gateModal"),
  gateModalTitle: document.getElementById("gateModalTitle"),
  gateModalMessage: document.getElementById("gateModalMessage"),
  gateModalActions: document.getElementById("gateModalActions"),
  exportModal: document.getElementById("exportModal"),
  exportProductSubtitle: document.getElementById("exportProductSubtitle"),
  closeExportModalBtn: document.getElementById("closeExportModalBtn"),
  cancelExportBtn: document.getElementById("cancelExportBtn"),
  confirmExportBtn: document.getElementById("confirmExportBtn"),
  exportBtnText: document.getElementById("exportBtnText"),
  a4RenderStage: document.getElementById("a4RenderStage"),
  toastContainer: document.getElementById("toastContainer")
};

// Toast Helper (No browser alert/confirm/prompt)
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  iconSvg.setAttribute("viewBox", "0 0 24 24");
  iconSvg.setAttribute("width", "18");
  iconSvg.setAttribute("height", "18");
  iconSvg.setAttribute("fill", "none");
  iconSvg.setAttribute("stroke", "currentColor");
  iconSvg.setAttribute("stroke-width", "2");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (type === "success") {
    path.setAttribute("d", "M20 6 9 17l-5-5");
  } else if (type === "error") {
    path.setAttribute("d", "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z");
  } else {
    path.setAttribute("d", "M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z");
  }
  iconSvg.appendChild(path);

  const span = document.createElement("span");
  span.textContent = message;

  toast.appendChild(iconSvg);
  toast.appendChild(span);
  els.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    toast.style.transition = "all 0.2s ease";
    window.setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// Gate Modal for Auth / Verification / Server Time Errors
function showGateModal(title, message, actions = []) {
  els.dashboardMain.classList.add("hidden");
  els.gateModalTitle.textContent = title;
  els.gateModalMessage.textContent = message;
  els.gateModalActions.replaceChildren();

  actions.forEach((act) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn ${act.primary ? "btn-primary" : "btn-secondary"}`;
    btn.textContent = act.label;
    btn.addEventListener("click", act.onClick);
    els.gateModalActions.appendChild(btn);
  });

  els.gateModal.classList.remove("hidden");
}

function hideGateModal() {
  els.gateModal.classList.add("hidden");
}

// Bangla Date & Time Formatter from Firestore Timestamp
function formatBanglaDateTime(ts) {
  if (!ts || typeof ts.toDate !== "function") {
    return {
      dateText: "তারিখ উপলব্ধ নয়",
      timeText: "সময় উপলব্ধ নয়",
      fullText: "তারিখ ও সময় উপলব্ধ নয়"
    };
  }

  const dateObj = ts.toDate();
  const dateText = new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(dateObj);

  const hour24 = dateObj.getHours();
  const minute = dateObj.getMinutes();

  let period = "সকাল";
  if (hour24 >= 12 && hour24 < 15) period = "দুপুর";
  else if (hour24 >= 15 && hour24 < 18) period = "বিকেল";
  else if (hour24 >= 18 && hour24 < 20) period = "সন্ধ্যা";
  else if (hour24 >= 20 || hour24 < 4) period = "রাত";

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const toBnDigits = (num) => String(num).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
  const timeText = `${period} ${toBnDigits(hour12)}:${toBnDigits(String(minute).padStart(2, "0"))}`;

  return {
    dateText,
    timeText,
    fullText: `${dateText} (${timeText})`
  };
}

// Safe string sanitization (never render "undefined" or "null")
function cleanField(val) {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (!str || str.toLowerCase() === "undefined" || str.toLowerCase() === "null") return "";
  return str;
}

// Server Time Probe via system/server_time (No phone clock fallback!)
async function getVerifiedServerCutoff(forceFreshProbe = false) {
  const probeRef = doc(db, "system", "server_time");
  const cacheKey = `paikarisell_server_probe_${state.user.uid}`;

  if (!forceFreshProbe) {
    try {
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const nowLocalForTtlCheck = Date.now();
        if (
          cached &&
          typeof cached.serverNowMs === "number" &&
          typeof cached.cachedAtLocalMs === "number" &&
          nowLocalForTtlCheck - cached.cachedAtLocalMs < PROBE_CACHE_TTL_MS
        ) {
          const serverNowMs = cached.serverNowMs;
          const cutoffTimestamp = Timestamp.fromMillis(serverNowMs - THIRTY_DAYS_MS);
          return { serverNowMs, cutoffTimestamp };
        }
      }
    } catch {
      // Ignore storage read errors and perform live probe
    }
  }

  // Step 2: Write serverTimestamp() to system/server_time
  await setDoc(probeRef, {
    updatedAt: serverTimestamp(),
    probedBy: state.user.uid
  });

  // Step 3: Read back system/server_time
  const snap = await getDoc(probeRef);
  if (!snap.exists()) {
    throw new Error("SERVER_TIME_MISSING");
  }

  const data = snap.data();
  const serverTs = data?.updatedAt;
  if (!serverTs || typeof serverTs.toMillis !== "function") {
    throw new Error("SERVER_TIMESTAMP_INVALID");
  }

  const serverNowMs = serverTs.toMillis();
  const cutoffTimestamp = Timestamp.fromMillis(serverNowMs - THIRTY_DAYS_MS);

  try {
    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        serverNowMs,
        cachedAtLocalMs: Date.now()
      })
    );
  } catch {
    // Ignore storage quota errors
  }

  return { serverNowMs, cutoffTimestamp };
}

// Statistics Update (Uses Firestore Aggregation Count Query + Loaded Count)
function updateStatisticsUI() {
  const loadedCount = state.loadedIds.size;
  const total30Days = Math.max(state.total30DaysCount, loadedCount);
  const remainingCount = Math.max(total30Days - loadedCount, 0);

  els.statTotal30Days.textContent = total30Days.toLocaleString("bn-BD");
  els.statLoadedCount.textContent = loadedCount.toLocaleString("bn-BD");
  els.statRemainingCount.textContent = remainingCount.toLocaleString("bn-BD");

  if (state.hasMore) {
    els.paginationBar.classList.remove("hidden");
    els.loadMoreBtn.classList.remove("hidden");
  } else {
    els.loadMoreBtn.classList.add("hidden");
    if (els.retryMoreBtn.classList.contains("hidden")) {
      els.paginationBar.classList.add("hidden");
    }
  }
}

async function fetchThirtyDayCount(cutoffTimestamp) {
  const countQuery = query(
    collection(db, "product_requests"),
    where("createdAt", ">=", cutoffTimestamp)
  );
  const aggSnap = await getCountFromServer(countQuery);
  return aggSnap.data().count || 0;
}

// Render Skeleton Cards
function renderSkeletons(count = 6) {
  els.requestsGrid.replaceChildren();
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.innerHTML = `
      <div class="skel-line skel-title"></div>
      <div class="skel-line skel-short"></div>
      <div class="skel-line skel-box"></div>
      <div class="skel-line"></div>
    `;
    els.requestsGrid.appendChild(card);
  }
}

// Build a Single Product Demand Card DOM safely
function createDemandCardElement(item) {
  const card = document.createElement("article");
  card.className = "demand-card";
  card.dataset.docId = item.id;

  const topBlock = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "card-product-title";
  title.textContent = item.productName || "পণ্যের নাম উল্লেখ নেই";
  topBlock.appendChild(title);

  // Date & Time Chips
  const metaRow = document.createElement("div");
  metaRow.className = "card-meta-row";

  const dateChip = document.createElement("span");
  dateChip.className = "meta-chip";
  dateChip.innerHTML = `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  `;
  const dateSpan = document.createElement("span");
  dateSpan.textContent = `তারিখ: ${item.formatted.dateText}`;
  dateChip.appendChild(dateSpan);

  const timeChip = document.createElement("span");
  timeChip.className = "meta-chip";
  timeChip.innerHTML = `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  `;
  const timeSpan = document.createElement("span");
  timeSpan.textContent = `সময়: ${item.formatted.timeText}`;
  timeChip.appendChild(timeSpan);

  metaRow.appendChild(dateChip);
  metaRow.appendChild(timeChip);
  topBlock.appendChild(metaRow);

  // Note & Important Display Logic
  const hasNote = Boolean(item.note);
  const hasImportant = Boolean(item.important);

  if (hasNote) {
    const noteBox = document.createElement("div");
    noteBox.className = "detail-box detail-box-note";
    const lbl = document.createElement("div");
    lbl.className = "detail-label";
    lbl.textContent = "নোট / চাহিদার বিবরণ";
    const txt = document.createElement("p");
    txt.className = "detail-text";
    txt.textContent = item.note;
    noteBox.appendChild(lbl);
    noteBox.appendChild(txt);
    topBlock.appendChild(noteBox);
  }

  if (hasImportant) {
    const impBox = document.createElement("div");
    impBox.className = "detail-box detail-box-important";
    const lbl = document.createElement("div");
    lbl.className = "detail-label";
    lbl.textContent = "গুরুত্বপূর্ণ তথ্য";
    const txt = document.createElement("p");
    txt.className = "detail-text";
    txt.textContent = item.important;
    impBox.appendChild(lbl);
    impBox.appendChild(txt);
    topBlock.appendChild(impBox);
  }

  if (!hasNote && !hasImportant) {
    const emptyBox = document.createElement("div");
    emptyBox.className = "detail-box detail-box-empty";
    emptyBox.textContent = "কোনো অতিরিক্ত তথ্য দেওয়া হয়নি";
    topBlock.appendChild(emptyBox);
  }

  // Footer: Doc ID + Copy ID + Download A4
  const footerSec = document.createElement("div");
  footerSec.className = "card-footer-section";

  const idRow = document.createElement("div");
  idRow.className = "doc-id-row";
  const idLbl = document.createElement("span");
  idLbl.textContent = "রিকোয়েস্ট আইডি:";
  const idVal = document.createElement("span");
  idVal.className = "doc-id-value";
  idVal.textContent = item.id;
  idVal.title = item.id;
  idRow.appendChild(idLbl);
  idRow.appendChild(idVal);

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "card-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn-ghost";
  copyBtn.dataset.action = "copy-id";
  copyBtn.dataset.docId = item.id;
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
    <span>কপি আইডি</span>
  `;

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "btn btn-primary";
  downloadBtn.dataset.action = "export-modal";
  downloadBtn.dataset.docId = item.id;
  downloadBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    <span>ডাউনলোড (A4)</span>
  `;

  actionsDiv.appendChild(copyBtn);
  actionsDiv.appendChild(downloadBtn);

  footerSec.appendChild(idRow);
  footerSec.appendChild(actionsDiv);

  card.appendChild(topBlock);
  card.appendChild(footerSec);
  return card;
}

// Map Firestore Doc to Normalized Demand Item
function normalizeRequestDoc(docSnap) {
  const raw = docSnap.data() || {};
  const createdAtTs = raw.createdAt || null;
  return {
    id: docSnap.id,
    productName: cleanField(raw.productName),
    note: cleanField(raw.note),
    important: cleanField(raw.important),
    createdAtTs,
    formatted: formatBanglaDateTime(createdAtTs)
  };
}

// Fetch Page of Requests within Session 30-Day Cutoff
async function fetchRequestsPage({ isInitial = true, runId }) {
  if (!state.sessionCutoffTimestamp) {
    throw new Error("MISSING_CUTOFF");
  }

  const baseConstraints = [
    where("createdAt", ">=", state.sessionCutoffTimestamp),
    orderBy("createdAt", "desc"),
    orderBy(documentId(), "desc")
  ];

  const q = isInitial
    ? query(collection(db, "product_requests"), ...baseConstraints, limit(PAGE_SIZE))
    : query(
        collection(db, "product_requests"),
        ...baseConstraints,
        startAfter(state.lastVisibleDoc),
        limit(PAGE_SIZE)
      );

  const snapshot = await getDocs(q);
  if (runId !== state.activeRunId) return;

  const docs = snapshot.docs;
  if (docs.length > 0) {
    state.lastVisibleDoc = docs[docs.length - 1];
  }

  const fragment = document.createDocumentFragment();
  let addedCount = 0;

  for (const d of docs) {
    if (state.loadedIds.has(d.id)) continue;
    const item = normalizeRequestDoc(d);
    state.loadedIds.add(item.id);
    state.loadedItemsMap.set(item.id, item);
    fragment.appendChild(createDemandCardElement(item));
    addedCount++;
  }

  if (isInitial) {
    els.requestsGrid.replaceChildren();
  }
  els.requestsGrid.appendChild(fragment);

  state.hasMore = docs.length === PAGE_SIZE && state.loadedIds.size < state.total30DaysCount;
  updateStatisticsUI();
}

// Show Feed Status Banner
function showFeedBanner(message, isError = false, onRetry = null) {
  els.feedStatusBox.replaceChildren();
  els.feedStatusBox.className = isError ? "status-banner error" : "status-banner";

  const textSpan = document.createElement("span");
  textSpan.textContent = message;
  els.feedStatusBox.appendChild(textSpan);

  if (onRetry) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "btn btn-secondary";
    retryBtn.textContent = "পুনরায় চেষ্টা করুন";
    retryBtn.addEventListener("click", onRetry);
    els.feedStatusBox.appendChild(retryBtn);
  }

  els.feedStatusBox.classList.remove("hidden");
}

function hideFeedBanner() {
  els.feedStatusBox.classList.add("hidden");
}

// Load / Refresh Dashboard Data
async function loadDashboardData(forceFreshProbe = false) {
  if (state.isLoadingInitial) return;
  state.isLoadingInitial = true;
  const runId = (state.activeRunId = (state.activeRunId || 0) + 1);

  els.refreshDashboardBtn.disabled = true;
  els.retryMoreBtn.classList.add("hidden");
  hideFeedBanner();

  // Reset pagination & session cutoff on fresh dashboard load/refresh
  state.lastVisibleDoc = null;
  state.hasMore = false;
  state.total30DaysCount = 0;
  state.loadedIds.clear();
  state.loadedItemsMap.clear();
  state.sessionCutoffTimestamp = null;
  state.sessionServerNowMs = null;

  els.dashboardMain.classList.remove("hidden");
  els.cutoffRangeText.textContent = "সার্ভার সময় যাচাই হচ্ছে...";
  els.statTotal30Days.textContent = "--";
  els.statLoadedCount.textContent = "0";
  els.statRemainingCount.textContent = "0";
  renderSkeletons(6);

  try {
    const { serverNowMs, cutoffTimestamp } = await getVerifiedServerCutoff(forceFreshProbe);
    if (runId !== state.activeRunId) return;

    state.sessionServerNowMs = serverNowMs;
    state.sessionCutoffTimestamp = cutoffTimestamp;

    const cutoffDateStr = new Intl.DateTimeFormat("bn-BD", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(serverNowMs - THIRTY_DAYS_MS));

    const serverNowStr = new Intl.DateTimeFormat("bn-BD", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(serverNowMs));

    els.cutoffRangeText.textContent = `৩০ দিনের সময়সীমা: ${cutoffDateStr} থেকে ${serverNowStr}`;

    const totalCount = await fetchThirtyDayCount(cutoffTimestamp);
    if (runId !== state.activeRunId) return;
    state.total30DaysCount = totalCount;

    await fetchRequestsPage({ isInitial: true, runId });
    if (runId !== state.activeRunId) return;

    if (state.loadedIds.size === 0) {
      els.requestsGrid.replaceChildren();
      showFeedBanner("গত ৩০ দিনে কোনো প্রোডাক্ট রিকোয়েস্ট পাওয়া যায়নি।", false);
    } else if (!state.hasMore) {
      showFeedBanner("গত ৩০ দিনের সকল প্রোডাক্ট রিকোয়েস্ট দেখানো হয়েছে। আর কোনো রিকোয়েস্ট নেই।", false);
    }
  } catch (err) {
    if (runId !== state.activeRunId) return;
    els.requestsGrid.replaceChildren();
    console.error("Dashboard load error:", err);

    const code = err?.code || err?.message || "";
    if (code === "permission-denied") {
      showFeedBanner(
        "অ্যাক্সেস অনুমোদিত নয় (Firestore Permission Denied)। অনুগ্রহ করে ভেরিফাইড সাপ্লায়ার অ্যাকাউন্ট যাচাই করুন।",
        true,
        () => loadDashboardData(true)
      );
    } else if (
      code === "SERVER_TIME_MISSING" ||
      code === "SERVER_TIMESTAMP_INVALID"
    ) {
      showGateModal(
        "সার্ভার সময় পাওয়া যায়নি",
        "নিরাপদ সার্ভার সময় যাচাই করা যায়নি। ফোনের সময় ব্যবহার করা হবে না। অনুগ্রহ করে কিছুক্ষণ পর পুনরায় চেষ্টা করুন।",
        [
          {
            label: "পুনরায় চেষ্টা করুন",
            primary: true,
            onClick: () => {
              hideGateModal();
              loadDashboardData(true);
            }
          }
        ]
      );
    } else {
      showFeedBanner(
        "প্রোডাক্ট রিকোয়েস্ট লোড করতে সমস্যা হয়েছে। নেটওয়ার্ক বা সার্ভার সংযোগ যাচাই করুন।",
        true,
        () => loadDashboardData(true)
      );
    }
  } finally {
    if (runId === state.activeRunId) {
      state.isLoadingInitial = false;
      els.refreshDashboardBtn.disabled = false;
    }
  }
}

// Load More Handler (Pagination)
async function handleLoadMore() {
  if (state.isLoadingMore || state.isLoadingInitial || !state.hasMore || !state.lastVisibleDoc) {
    return;
  }

  state.isLoadingMore = true;
  const runId = state.activeRunId;
  els.loadMoreBtn.disabled = true;
  els.loadMoreText.textContent = "লোড হচ্ছে...";
  els.retryMoreBtn.classList.add("hidden");

  try {
    await fetchRequestsPage({ isInitial: false, runId });
    if (runId !== state.activeRunId) return;

    if (!state.hasMore) {
      showFeedBanner("গত ৩০ দিনের সকল প্রোডাক্ট রিকোয়েস্ট দেখানো হয়েছে। আর কোনো রিকোয়েস্ট নেই।", false);
    }
  } catch (err) {
    if (runId !== state.activeRunId) return;
    console.error("Pagination error:", err);
    showToast("পরবর্তী রিকোয়েস্ট লোড করা যায়নি। পুনরায় চেষ্টা করুন।", "error");
    els.retryMoreBtn.classList.remove("hidden");
  } finally {
    if (runId === state.activeRunId) {
      state.isLoadingMore = false;
      els.loadMoreBtn.disabled = false;
      els.loadMoreText.textContent = "আরও দেখুন";
    }
  }
}

// Copy Document ID Handler
async function handleCopyDocId(docId) {
  if (!docId || state.isCopyingId === docId) return;
  state.isCopyingId = docId;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(docId);
    } else {
      const tempInput = document.createElement("textarea");
      tempInput.value = docId;
      tempInput.setAttribute("readonly", "");
      tempInput.style.position = "fixed";
      tempInput.style.opacity = "0";
      document.body.appendChild(tempInput);
      tempInput.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(tempInput);
      if (!ok) throw new Error("EXEC_COMMAND_FAILED");
    }
    showToast("রিকোয়েস্ট আইডি সফলভাবে কপি হয়েছে!", "success");
  } catch (err) {
    console.error("Clipboard error:", err);
    showToast("ক্লিপবোর্ডে কপি করার অনুমতি পাওয়া যায়নি।", "error");
  } finally {
    state.isCopyingId = null;
  }
}

// Build A4 Printable / Renderable DOM Element (210mm x 297mm)
function buildA4SheetElement(item) {
  const sheet = document.createElement("div");
  sheet.className = "a4-sheet";

  const topWrap = document.createElement("div");

  // Header
  const header = document.createElement("div");
  header.className = "a4-header";

  const brand = document.createElement("div");
  brand.className = "a4-brand";

  const logoImg = document.createElement("img");
  logoImg.className = "a4-logo";
  logoImg.src = LOGO_URL;
  logoImg.alt = `${BRAND_NAME} Logo`;
  logoImg.crossOrigin = "anonymous";

  const brandTitle = document.createElement("h1");
  brandTitle.className = "a4-brand-title";
  brandTitle.textContent = BRAND_NAME;

  brand.appendChild(logoImg);
  brand.appendChild(brandTitle);

  const docType = document.createElement("div");
  docType.className = "a4-doc-type";
  docType.textContent = "PRODUCT DEMAND REQUEST";

  header.appendChild(brand);
  header.appendChild(docType);
  topWrap.appendChild(header);

  // Product Name Box
  const prodBox = document.createElement("div");
  prodBox.className = "a4-product-box";
  const prodLbl = document.createElement("div");
  prodLbl.className = "a4-field-label";
  prodLbl.textContent = "চাহিদাকৃত পণ্য (PRODUCT NAME)";
  const prodName = document.createElement("h2");
  prodName.className = "a4-product-name";
  prodName.textContent = item.productName || "পণ্যের নাম উল্লেখ নেই";
  prodBox.appendChild(prodLbl);
  prodBox.appendChild(prodName);
  topWrap.appendChild(prodBox);

  // Note & Important Sections
  if (item.note) {
    const noteSec = document.createElement("div");
    noteSec.className = "a4-section";
    const lbl = document.createElement("div");
    lbl.className = "a4-field-label";
    lbl.textContent = "নোট (NOTE)";
    const p = document.createElement("p");
    p.className = "a4-section-text";
    p.textContent = item.note;
    noteSec.appendChild(lbl);
    noteSec.appendChild(p);
    topWrap.appendChild(noteSec);
  }

  if (item.important) {
    const impSec = document.createElement("div");
    impSec.className = "a4-section";
    const lbl = document.createElement("div");
    lbl.className = "a4-field-label";
    lbl.textContent = "গুরুত্বপূর্ণ তথ্য (IMPORTANT)";
    const p = document.createElement("p");
    p.className = "a4-section-text";
    p.textContent = item.important;
    impSec.appendChild(lbl);
    impSec.appendChild(p);
    topWrap.appendChild(impSec);
  }

  if (!item.note && !item.important) {
    const emptySec = document.createElement("div");
    emptySec.className = "a4-section";
    const p = document.createElement("p");
    p.className = "a4-section-text";
    p.textContent = "কোনো অতিরিক্ত তথ্য দেওয়া হয়নি";
    emptySec.appendChild(p);
    topWrap.appendChild(emptySec);
  }

  // Date, Time & Document ID Grid
  const metaGrid = document.createElement("div");
  metaGrid.className = "a4-meta-grid";

  const addMeta = (label, value) => {
    const box = document.createElement("div");
    box.className = "a4-meta-item";
    const k = document.createElement("div");
    k.className = "a4-meta-key";
    k.textContent = label;
    const v = document.createElement("div");
    v.className = "a4-meta-val";
    v.textContent = value;
    box.appendChild(k);
    box.appendChild(v);
    metaGrid.appendChild(box);
  };

  addMeta("রিকোয়েস্টের তারিখ", item.formatted.dateText);
  addMeta("রিকোয়েস্টের সময়", item.formatted.timeText);
  addMeta("রিকোয়েস্ট ডকুমেন্ট আইডি", item.id);
  addMeta("সাপ্লায়ার ভেরিফিকেশন", `ভেরিফাইড (${state.user?.uid || ""})`);

  topWrap.appendChild(metaGrid);

  // Footer
  const footer = document.createElement("div");
  footer.className = "a4-footer";
  const leftFoot = document.createElement("span");
  leftFoot.textContent = `${BRAND_NAME} — A4 Demand Sheet`;
  const rightFoot = document.createElement("span");
  rightFoot.className = "a4-url";
  rightFoot.textContent = WEBSITE_URL;
  footer.appendChild(leftFoot);
  footer.appendChild(rightFoot);

  sheet.appendChild(topWrap);
  sheet.appendChild(footer);
  return sheet;
}

function triggerFileDownload(blobOrUrl, fileName) {
  const a = document.createElement("a");
  a.href = blobOrUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Render A4 Sheet to High-Res Canvas
async function renderA4ToCanvas(sheetEl, scale = 2.5) {
  if (typeof window.html2canvas !== "function") {
    throw new Error("HTML2CANVAS_UNAVAILABLE");
  }
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  return window.html2canvas(sheetEl, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#FFFFFF"
  });
}

// A4 Export Handlers per Format
async function exportAsRaster(item, format) {
  const canvas = await renderA4ToCanvas(buildA4SheetElement(item), 2.5);
  const mimeType =
    format === "jpg"
      ? "image/jpeg"
      : format === "webp"
      ? "image/webp"
      : "image/png";
  const quality = format === "png" ? undefined : 0.94;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("BLOB_FAILED"))),
      mimeType,
      quality
    );
  });

  const url = URL.createObjectURL(blob);
  const ext = format === "jpg" ? "jpg" : format;
  triggerFileDownload(url, `paikarisell-demand-${item.id}.${ext}`);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function exportAsA4Svg(item) {
  const widthMm = 210;
  const heightMm = 297;
  const noteText = item.note || (item.important ? "" : "কোনো অতিরিক্ত তথ্য দেওয়া হয়নি");
  const impText = item.important || "";

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 794 1123">
  <rect x="16" y="16" width="762" height="1091" rx="14" fill="#FFFFFF" stroke="#FF6B35" stroke-width="3" />
  <rect x="44" y="42" width="706" height="82" fill="#FFF2EA" rx="10" />
  <text x="64" y="82" font-family="Hind Siliguri, sans-serif" font-size="28" font-weight="700" fill="#FF6A00">${escapeXml(BRAND_NAME)}</text>
  <text x="64" y="108" font-family="Hind Siliguri, sans-serif" font-size="14" font-weight="600" fill="#665B52">PRODUCT DEMAND REQUEST (A4 — 210mm x 297mm)</text>

  <rect x="44" y="150" width="706" height="110" fill="#FFF9F5" stroke="#FF6B35" stroke-width="2" rx="10" />
  <text x="64" y="180" font-family="Hind Siliguri, sans-serif" font-size="14" font-weight="700" fill="#FF6B35">পণ্যের নাম</text>
  <text x="64" y="222" font-family="Hind Siliguri, sans-serif" font-size="26" font-weight="700" fill="#1E1B18">${escapeXml(item.productName || "পণ্যের নাম উল্লেখ নেই")}</text>

  <rect x="44" y="286" width="706" height="190" fill="#FFFFFF" stroke="#F0DFD4" stroke-width="2" rx="10" />
  <text x="64" y="318" font-family="Hind Siliguri, sans-serif" font-size="14" font-weight="700" fill="#FF6A00">নোট / বিবরণ</text>
  <text x="64" y="352" font-family="Hind Siliguri, sans-serif" font-size="17" fill="#1E1B18">${escapeXml(noteText)}</text>

  <rect x="44" y="502" width="706" height="170" fill="#FFF9F5" stroke="#FFA500" stroke-width="2" rx="10" />
  <text x="64" y="534" font-family="Hind Siliguri, sans-serif" font-size="14" font-weight="700" fill="#B45309">গুরুত্বপূর্ণ তথ্য</text>
  <text x="64" y="568" font-family="Hind Siliguri, sans-serif" font-size="17" fill="#1E1B18">${escapeXml(impText || "—")}</text>

  <text x="44" y="725" font-family="Hind Siliguri, sans-serif" font-size="16" font-weight="600" fill="#1E1B18">তারিখ: ${escapeXml(item.formatted.dateText)}</text>
  <text x="410" y="725" font-family="Hind Siliguri, sans-serif" font-size="16" font-weight="600" fill="#1E1B18">সময়: ${escapeXml(item.formatted.timeText)}</text>
  <text x="44" y="762" font-family="Hind Siliguri, sans-serif" font-size="15" fill="#665B52">ডকুমেন্ট আইডি: ${escapeXml(item.id)}</text>

  <line x1="44" y1="1030" x2="750" y2="1030" stroke="#F0DFD4" stroke-width="2" />
  <text x="44" y="1062" font-family="Hind Siliguri, sans-serif" font-size="15" font-weight="700" fill="#FF6A00">${escapeXml(WEBSITE_URL)}</text>
  <text x="750" y="1062" text-anchor="end" font-family="Hind Siliguri, sans-serif" font-size="14" fill="#665B52">${escapeXml(BRAND_NAME)}</text>
</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerFileDownload(url, `paikarisell-demand-${item.id}.svg`);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportAsA4Pdf(item) {
  const jsPdfGlobal = window.jspdf?.jsPDF;
  if (typeof jsPdfGlobal !== "function") {
    throw new Error("JSPDF_UNAVAILABLE");
  }

  const canvas = await renderA4ToCanvas(buildA4SheetElement(item), 2.5);
  const imgData = canvas.toDataURL("image/png", 1.0);

  const pdf = new jsPdfGlobal({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, "FAST");
  pdf.save(`paikarisell-demand-${item.id}.pdf`);
}

// Export Modal Controls
function openExportModal(docId) {
  const item = state.loadedItemsMap.get(docId);
  if (!item) {
    showToast("রিকোয়েস্টের তথ্য পাওয়া যায়নি।", "error");
    return;
  }

  state.selectedExportId = docId;
  els.exportProductSubtitle.textContent = item.productName || "প্রোডাক্ট রিকোয়েস্ট";
  els.exportModal.classList.remove("hidden");
}

function closeExportModal() {
  if (state.isExporting) return;
  els.exportModal.classList.add("hidden");
  state.selectedExportId = null;
}

async function handleConfirmExport() {
  if (state.isExporting || !state.selectedExportId) return;
  const item = state.loadedItemsMap.get(state.selectedExportId);
  if (!item) return;

  const format = state.selectedExportFormat;
  state.isExporting = true;
  els.confirmExportBtn.disabled = true;
  els.cancelExportBtn.disabled = true;
  els.closeExportModalBtn.disabled = true;
  els.exportBtnText.textContent = "তৈরি হচ্ছে...";

  els.a4RenderStage.replaceChildren();
  const sheet = buildA4SheetElement(item);
  els.a4RenderStage.appendChild(sheet);

  try {
    if (format === "svg") {
      exportAsA4Svg(item);
      showToast("A4 SVG ফাইল ডাউনলোড হয়েছে!", "success");
    } else if (format === "pdf") {
      await exportAsA4Pdf(item);
      showToast("A4 PDF ডকুমেন্ট ডাউনলোড হয়েছে!", "success");
    } else {
      await exportAsRaster(item, format);
      showToast(`A4 ${format.toUpperCase()} ফাইল ডাউনলোড হয়েছে!`, "success");
    }
    state.isExporting = false;
    closeExportModal();
  } catch (err) {
    console.error("Export failed:", err);
    if (format === "pdf") {
      showToast("PDF ফাইল তৈরি করতে সমস্যা হয়েছে।", "error");
    } else {
      showToast("ফাইল এক্সপোর্ট করতে সমস্যা হয়েছে।", "error");
    }
  } finally {
    state.isExporting = false;
    els.confirmExportBtn.disabled = false;
    els.cancelExportBtn.disabled = false;
    els.closeExportModalBtn.disabled = false;
    els.exportBtnText.textContent = "ডাউনলোড করুন";
    els.a4RenderStage.replaceChildren();
  }
}

// Event Listeners Setup
function bindEvents() {
  els.refreshDashboardBtn.addEventListener("click", () => {
    loadDashboardData(true);
  });

  els.loadMoreBtn.addEventListener("click", handleLoadMore);
  els.retryMoreBtn.addEventListener("click", handleLoadMore);

  els.requestsGrid.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const docId = btn.dataset.docId;

    if (action === "copy-id") {
      handleCopyDocId(docId);
    } else if (action === "export-modal") {
      openExportModal(docId);
    }
  });

  els.closeExportModalBtn.addEventListener("click", closeExportModal);
  els.cancelExportBtn.addEventListener("click", closeExportModal);
  els.confirmExportBtn.addEventListener("click", handleConfirmExport);

  els.exportModal.addEventListener("click", (e) => {
    if (e.target === els.exportModal) {
      closeExportModal();
    }
  });

  document.querySelectorAll(".format-option").forEach((optionBtn) => {
    optionBtn.addEventListener("click", () => {
      document.querySelectorAll(".format-option").forEach((el) => el.classList.remove("active"));
      optionBtn.classList.add("active");
      state.selectedExportFormat = optionBtn.dataset.format || "png";
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.exportModal.classList.contains("hidden")) {
      closeExportModal();
    }
  });
}

// Authentication & Supplier Verification Gate
onAuthStateChanged(auth, async (user) => {
  state.activeRunId = (state.activeRunId || 0) + 1;

  if (!user) {
    state.user = null;
    state.supplier = null;
    window.location.replace("/login");
    return;
  }

  state.user = user;

  try {
    const supplierSnap = await getDoc(doc(db, "supplyers", user.uid));

    if (!supplierSnap.exists()) {
      window.location.replace("/signup1");
      return;
    }

    const supplierData = supplierSnap.data() || {};
    state.supplier = supplierData;

    if (supplierData.active !== true) {
      showGateModal(
        "অ্যাকাউন্ট সক্রিয় নয়",
        "আপনার সাপ্লায়ার অ্যাকাউন্টটি বর্তমানে সক্রিয় নয়।",
        [
          {
            label: "হোম পেজে যান",
            primary: true,
            onClick: () => {
              window.location.href = WEBSITE_URL;
            }
          }
        ]
      );
      return;
    }

    if (supplierData.verified !== true) {
      showGateModal(
        "অ্যাকাউন্ট ভেরিফাই করা হয়নি",
        "আপনার অ্যাকাউন্ট এখনো ভেরিফাই করা হয়নি। ভেরিফিকেশন সম্পন্ন হলে এই সুবিধাটি ব্যবহার করতে পারবেন।",
        [
          {
            label: "হোম পেজে যান",
            primary: true,
            onClick: () => {
              window.location.href = WEBSITE_URL;
            }
          }
        ]
      );
      return;
    }

    hideGateModal();
    const displayName =
      cleanField(supplierData.businessName) ||
      cleanField(supplierData.name) ||
      "ভেরিফাইড সাপ্লায়ার";
    els.supplierNameText.textContent = displayName;
    els.supplierBadge.classList.remove("hidden");

    await loadDashboardData(false);
  } catch (err) {
    console.error("Auth / Supplier verification error:", err);
    showGateModal(
      "ভেরিফিকেশন যাচাই ব্যর্থ",
      "আপনার সাপ্লায়ার তথ্য যাচাই করার সময় একটি ত্রুটি ঘটেছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।",
      [
        {
          label: "পুনরায় লোড করুন",
          primary: true,
          onClick: () => window.location.reload()
        }
      ]
    );
  }
});

bindEvents();
