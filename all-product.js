import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// APPLICATION STATE
// ==========================================
const PAGE_SIZE = 20;
const FALLBACK_IMAGE = "https://paikarisell.ghotimarket.com/photo/logo.png";
const SUBSCRIPTION_PAGE_URL = "/subscription";

const state = {
    currentUser: null,
    supplierData: null,
    categoriesMap: new Map(), // categoryId -> { id, categoryName, categoryImage }
    categoriesLoaded: false,

    // Pagination & Filter State
    activeFilter: "all",
    products: [],             // Currently loaded list
    loadedIds: new Set(),     // Prevent duplicate product rendering
    lastVisibleDoc: null,     // Firestore DocumentSnapshot cursor
    hasMore: false,
    isLoadingInitial: false,
    isLoadingMore: false,

    // Search State
    isSearchMode: false,
    searchedProduct: null,

    // Action Locks
    isUpdating: false,
    activatingProductIds: new Set()
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const dom = {
    authGateLoader: document.getElementById("authGateLoader"),
    authGateMessage: document.getElementById("authGateMessage"),
    dashboardApp: document.getElementById("dashboardApp"),
    toastContainer: document.getElementById("toastContainer"),

    // Header & Stats
    subscriptionBadge: document.getElementById("subscriptionBadge"),
    subscriptionText: document.getElementById("subscriptionText"),
    supplierShopName: document.getElementById("supplierShopName"),
    statTotalProducts: document.getElementById("statTotalProducts"),
    statLiveProducts: document.getElementById("statLiveProducts"),
    statTotalLoader: document.getElementById("statTotalLoader"),
    statLiveLoader: document.getElementById("statLiveLoader"),

    // Search & Filters
    productSearchForm: document.getElementById("productSearchForm"),
    searchProductIdInput: document.getElementById("searchProductIdInput"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    searchSubmitBtn: document.getElementById("searchSubmitBtn"),
    filterChips: document.querySelectorAll(".filter-chip"),
    searchResultBanner: document.getElementById("searchResultBanner"),
    searchedIdDisplay: document.getElementById("searchedIdDisplay"),
    resetFromBannerBtn: document.getElementById("resetFromBannerBtn"),

    // Grid & States
    productsGrid: document.getElementById("productsGrid"),
    errorStateBox: document.getElementById("errorStateBox"),
    errorTitle: document.getElementById("errorTitle"),
    errorMessage: document.getElementById("errorMessage"),
    retryLoadBtn: document.getElementById("retryLoadBtn"),
    emptyStateBox: document.getElementById("emptyStateBox"),
    emptyStateTitle: document.getElementById("emptyStateTitle"),
    emptyStateDesc: document.getElementById("emptyStateDesc"),

    // Pagination
    paginationSection: document.getElementById("paginationSection"),
    loadMoreBtn: document.getElementById("loadMoreBtn"),
    loadMoreSpinner: document.getElementById("loadMoreSpinner"),
    loadMoreText: document.getElementById("loadMoreText"),
    loadMoreIcon: document.getElementById("loadMoreIcon"),

    // Edit Modal
    editProductModal: document.getElementById("editProductModal"),
    closeEditModalBtn: document.getElementById("closeEditModalBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    editProductForm: document.getElementById("editProductForm"),
    editProductId: document.getElementById("editProductId"),
    editDisplayProductId: document.getElementById("editDisplayProductId"),
    editProductName: document.getElementById("editProductName"),
    editProductDescription: document.getElementById("editProductDescription"),
    editPrice: document.getElementById("editPrice"),
    editHighRate: document.getElementById("editHighRate"),
    editCategoryId: document.getElementById("editCategoryId"),
    categoryTriggerBtn: document.getElementById("categoryTriggerBtn"),
    selectedCatPreview: document.getElementById("selectedCatPreview"),
    categoryDropdownList: document.getElementById("categoryDropdownList"),
    editActive: document.getElementById("editActive"),
    editFreeDelivery: document.getElementById("editFreeDelivery"),
    addVariantGroupBtn: document.getElementById("addVariantGroupBtn"),
    variantsEditorContainer: document.getElementById("variantsEditorContainer"),
    saveEditBtn: document.getElementById("saveEditBtn"),
    saveEditSpinner: document.getElementById("saveEditSpinner"),
    saveEditText: document.getElementById("saveEditText")
};

// ==========================================
// UTILITY & SECURITY HELPERS
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconSvg = "";
    if (type === "success") {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === "error") {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }

    toast.innerHTML = `
        <div class="toast-icon">${iconSvg}</div>
        <div class="toast-msg">${escapeHTML(message)}</div>
    `;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "all 0.25s ease";
        setTimeout(() => toast.remove(), 260);
    }, 3500);
}

function getBengaliErrorMessage(error, fallbackMsg = "একটি অপ্রত্যাশিত সমস্যা হয়েছে।") {
    if (!error) return fallbackMsg;
    const code = error.code || "";
    if (code === "permission-denied") {
        return "অনুমতি নেই (Permission Denied): এই কাজটি করার অনুমতি আপনার নেই।";
    }
    if (code === "unavailable" || !navigator.onLine) {
        return "নেটওয়ার্ক ত্রুটি (Network Error): আপনার ইন্টারনেট সংযোগ পরীক্ষা করুন।";
    }
    if (code === "not-found") {
        return "তথ্যটি খুঁজে পাওয়া যায়নি (Not Found)।";
    }
    if (code === "failed-precondition") {
        return "ডাটাবেস ইনডেক্স প্রস্তুত হচ্ছে বা অনুপস্থিত। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।";
    }
    return fallbackMsg;
}

function formatBengaliDate(timestamp) {
    if (!timestamp) return "তারিখ নেই";
    try {
        const dateObj = typeof timestamp.toDate === "function"
            ? timestamp.toDate()
            : new Date(timestamp);
        if (isNaN(dateObj.getTime())) return "তারিখ নেই";
        return dateObj.toLocaleDateString("bn-BD", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    } catch {
        return "তারিখ নেই";
    }
}

function verifyCurrentUid() {
    const user = auth.currentUser;
    if (!user || !user.uid) {
        window.location.replace("/login");
        throw new Error("UNAUTHENTICATED");
    }
    return user.uid;
}

// ==========================================
// 1. AUTHENTICATION & SUPPLIER VERIFICATION
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("/login");
        return;
    }

    state.currentUser = user;
    dom.authGateMessage.textContent = "সাপ্লায়ার প্রোফাইল যাচাই করা হচ্ছে...";

    try {
        const supplierRef = doc(db, "supplyers", user.uid);
        const supplierSnap = await getDoc(supplierRef);

        if (!supplierSnap.exists()) {
            window.location.replace("/signup1");
            return;
        }

        state.supplierData = supplierSnap.data();

        // Hide Gate Loader & Show Dashboard immediately so Summary Stats render before products
        dom.authGateLoader.classList.add("hidden");
        dom.dashboardApp.classList.remove("hidden");

        renderSupplierHeaderAndStats();

        // Load Categories & Initial 20 Products
        await Promise.all([
            loadCategories(),
            fetchProducts({ reset: true })
        ]);

    } catch (error) {
        console.error("Supplier Verification Error:", error);
        dom.authGateMessage.textContent = getBengaliErrorMessage(
            error,
            "সাপ্লায়ার তথ্য লোড করতে সমস্যা হয়েছে। পেজ রিফ্রেশ করুন।"
        );
    }
});

// ==========================================
// 2. SUPPLIER STATS & SUBSCRIPTION LOGIC
// ==========================================
function getSupplierUnlockedUntil() {
    const raw = Number(state.supplierData?.profileUnlockedUntil);
    return Number.isFinite(raw) ? raw : 0;
}

function isSubscriptionActive() {
    if (!state.supplierData) return false;
    const unlockedUntil = getSupplierUnlockedUntil();
    return unlockedUntil > Date.now();
}

function renderSupplierHeaderAndStats() {
    const data = state.supplierData || {};

    // Shop / Supplier Name
    const displayName = data.shopName || data.businessName || data.name || "সাপ্লায়ার প্যানেল";
    dom.supplierShopName.textContent = displayName;

    // Subscription Status Pill
    const subActive = isSubscriptionActive();
    dom.subscriptionBadge.classList.remove("skeleton-pill", "active", "expired");
    if (subActive) {
        dom.subscriptionBadge.classList.add("active");
        dom.subscriptionText.textContent = "সাবস্ক্রিপশন সক্রিয়";
    } else {
        dom.subscriptionBadge.classList.add("expired");
        dom.subscriptionText.textContent = "সাবস্ক্রিপশন মেয়াদোত্তীর্ণ";
    }

    // Direct Counter Fields from supplyers/{uid}
    const totalCount = Number.isFinite(Number(data.product)) ? Number(data.product) : 0;
    const liveCount = Number.isFinite(Number(data.activeProduct)) ? Number(data.activeProduct) : 0;

    dom.statTotalProducts.textContent = totalCount.toLocaleString("bn-BD");
    dom.statLiveProducts.textContent = liveCount.toLocaleString("bn-BD");
}

// ==========================================
// 3. LOAD CATEGORIES
// ==========================================
async function loadCategories() {
    try {
        const catSnap = await getDocs(collection(db, "categories"));
        state.categoriesMap.clear();

        catSnap.forEach((docSnap) => {
            const d = docSnap.data();
            state.categoriesMap.set(docSnap.id, {
                id: docSnap.id,
                categoryName: d.categoryName || d.name || "সাধারণ ক্যাটাগরি",
                categoryImage: d.categoryImage || d.image || FALLBACK_IMAGE
            });
        });

        state.categoriesLoaded = true;
        populateCategoryDropdown();
    } catch (error) {
        console.error("Category Load Error:", error);
        showToast("ক্যাটাগরি লোড করতে ব্যর্থ হয়েছে (Category Load Failed)।", "error");
    }
}

function populateCategoryDropdown() {
    dom.categoryDropdownList.innerHTML = "";

    if (state.categoriesMap.size === 0) {
        dom.categoryDropdownList.innerHTML = `<div class="cat-option-item">কোনো ক্যাটাগরি পাওয়া যায়নি</div>`;
        return;
    }

    state.categoriesMap.forEach((cat) => {
        const item = document.createElement("div");
        item.className = "cat-option-item";
        item.dataset.id = cat.id;
        item.innerHTML = `
            <div class="cat-opt-left">
                <img src="${escapeHTML(cat.categoryImage)}" alt="${escapeHTML(cat.categoryName)}" onerror="this.src='${FALLBACK_IMAGE}'">
                <span class="cat-opt-name">${escapeHTML(cat.categoryName)}</span>
            </div>
            <span class="cat-opt-id">${escapeHTML(cat.id)}</span>
        `;

        item.addEventListener("click", () => {
            selectCategoryInModal(cat.id);
            dom.categoryDropdownList.classList.add("hidden");
        });

        dom.categoryDropdownList.appendChild(item);
    });
}

function selectCategoryInModal(categoryId) {
    dom.editCategoryId.value = categoryId || "";
    const cat = state.categoriesMap.get(categoryId);

    document.querySelectorAll(".cat-option-item").forEach((el) => {
        el.classList.toggle("selected", el.dataset.id === categoryId);
    });

    if (cat) {
        dom.selectedCatPreview.innerHTML = `
            <img src="${escapeHTML(cat.categoryImage)}" alt="${escapeHTML(cat.categoryName)}" onerror="this.src='${FALLBACK_IMAGE}'">
            <span><strong>${escapeHTML(cat.categoryName)}</strong> <small style="color:#71717a;">(${escapeHTML(cat.id)})</small></span>
        `;
    } else {
        dom.selectedCatPreview.innerHTML = `<span class="placeholder-text">ক্যাটাগরি নির্বাচন করুন...</span>`;
    }
}

// ==========================================
// 4. PRODUCT QUERY BUILDER & PAGINATION (LIMIT 20)
// ==========================================
function buildProductsQuery(uid, filterType, cursorDoc = null) {
    const productsRef = collection(db, "products");
    const constraints = [where("uid", "==", uid)];

    switch (filterType) {
        case "active":
            constraints.push(where("active", "==", true));
            break;
        case "inactive":
            constraints.push(where("active", "==", false));
            break;
        case "approved":
            constraints.push(where("approved", "==", true));
            break;
        case "review":
            constraints.push(where("approved", "==", false));
            break;
        case "freeDelivery":
            constraints.push(where("freeDelivery", "==", true));
            break;
        case "all":
        default:
            break;
    }

    constraints.push(orderBy("createdAt", "desc"));

    if (cursorDoc) {
        constraints.push(startAfter(cursorDoc));
    }

    constraints.push(limit(PAGE_SIZE));

    return query(productsRef, ...constraints);
}

async function fetchProducts({ reset = false } = {}) {
    const uid = verifyCurrentUid();

    if (reset) {
        if (state.isLoadingInitial) return;
        state.isLoadingInitial = true;
        state.products = [];
        state.loadedIds.clear();
        state.lastVisibleDoc = null;
        state.hasMore = false;

        hideStateBoxes();
        dom.paginationSection.classList.add("hidden");
        renderSkeletonCards(6);
    } else {
        if (state.isLoadingMore || !state.hasMore || !state.lastVisibleDoc) return;
        state.isLoadingMore = true;
        setLoadMoreLoading(true);
    }

    try {
        const q = buildProductsQuery(
            uid,
            state.activeFilter,
            reset ? null : state.lastVisibleDoc
        );

        const snapshot = await getDocs(q);

        if (reset) {
            dom.productsGrid.innerHTML = "";
        }

        const newDocs = snapshot.docs;

        newDocs.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.uid === uid && !state.loadedIds.has(docSnap.id)) {
                state.loadedIds.add(docSnap.id);
                state.products.push({
                    id: docSnap.id,
                    ...data
                });
            }
        });

        if (newDocs.length > 0) {
            state.lastVisibleDoc = newDocs[newDocs.length - 1];
        }
        state.hasMore = newDocs.length === PAGE_SIZE;

        if (state.products.length === 0) {
            showEmptyState(
                "কোনো পণ্য পাওয়া যায়নি",
                "নির্বাচিত ফিল্টারে আপনার কোনো পণ্য নেই।"
            );
            dom.paginationSection.classList.add("hidden");
        } else {
            renderProductsList(state.products);
            if (state.hasMore) {
                dom.paginationSection.classList.remove("hidden");
            } else {
                dom.paginationSection.classList.add("hidden");
            }
        }

    } catch (error) {
        console.error("Fetch Products Error:", error);
        if (reset) {
            dom.productsGrid.innerHTML = "";
            showErrorState(
                "পণ্য লোড করতে সমস্যা হয়েছে",
                getBengaliErrorMessage(error, "পণ্য তালিকা লোড করা সম্ভব হয়নি।")
            );
        } else {
            showToast(
                getBengaliErrorMessage(error, "আরও পণ্য লোড করতে ব্যর্থ হয়েছে (Pagination Failed)।"),
                "error"
            );
        }
    } finally {
        state.isLoadingInitial = false;
        state.isLoadingMore = false;
        setLoadMoreLoading(false);
    }
}

function setLoadMoreLoading(isLoading) {
    dom.loadMoreBtn.disabled = isLoading;
    if (isLoading) {
        dom.loadMoreSpinner.classList.remove("hidden");
        dom.loadMoreIcon.classList.add("hidden");
        dom.loadMoreText.textContent = "লোড হচ্ছে...";
    } else {
        dom.loadMoreSpinner.classList.add("hidden");
        dom.loadMoreIcon.classList.remove("hidden");
        dom.loadMoreText.textContent = "আরও দেখুন";
    }
}

// ==========================================
// 5. SINGLE DOCUMENT SEARCH BY PRODUCT ID
// ==========================================
async function handleProductIdSearch(rawId) {
    const uid = verifyCurrentUid();
    const productId = rawId.trim();

    if (!productId) {
        clearProductSearch();
        return;
    }

    state.isSearchMode = true;
    dom.clearSearchBtn.classList.remove("hidden");
    dom.searchResultBanner.classList.remove("hidden");
    dom.searchedIdDisplay.textContent = productId;
    dom.paginationSection.classList.add("hidden");
    hideStateBoxes();

    dom.searchSubmitBtn.disabled = true;
    renderSkeletonCards(1);

    try {
        const productRef = doc(db, "products", productId);
        const productSnap = await getDoc(productRef);

        dom.productsGrid.innerHTML = "";

        if (!productSnap.exists() || productSnap.data().uid !== uid) {
            state.searchedProduct = null;
            showEmptyState(
                "এই প্রোডাক্টটি পাওয়া যায়নি",
                "প্রদত্ত আইডি দিয়ে আপনার অ্যাকাউন্টে কোনো পণ্য খুঁজে পাওয়া যায়নি।"
            );
            return;
        }

        const productObj = {
            id: productSnap.id,
            ...productSnap.data()
        };

        state.searchedProduct = productObj;
        renderProductsList([productObj]);

    } catch (error) {
        console.error("Search Product Error:", error);
        dom.productsGrid.innerHTML = "";
        if (error.code === "permission-denied") {
            showEmptyState(
                "এই প্রোডাক্টটি পাওয়া যায়নি",
                "প্রদত্ত আইডি দিয়ে আপনার অ্যাকাউন্টে কোনো পণ্য খুঁজে পাওয়া যায়নি।"
            );
        } else {
            showErrorState(
                "সার্চ করতে সমস্যা হয়েছে",
                getBengaliErrorMessage(error, "প্রোডাক্ট খুঁজতে ব্যর্থ হয়েছে।")
            );
        }
    } finally {
        dom.searchSubmitBtn.disabled = false;
    }
}

function clearProductSearch() {
    if (!state.isSearchMode && !dom.searchProductIdInput.value) return;

    state.isSearchMode = false;
    state.searchedProduct = null;
    dom.searchProductIdInput.value = "";
    dom.clearSearchBtn.classList.add("hidden");
    dom.searchResultBanner.classList.add("hidden");
    hideStateBoxes();

    if (state.products.length > 0) {
        renderProductsList(state.products);
        if (state.hasMore) {
            dom.paginationSection.classList.remove("hidden");
        }
    } else {
        fetchProducts({ reset: true });
    }
}

// ==========================================
// 6. PRODUCT STATUS & UNLOCK LOGIC
// ==========================================
function isProductExpired(product) {
    const prodUnlockedUntil = Number(product?.profileUnlockedUntil);
    if (!Number.isFinite(prodUnlockedUntil)) return false;
    return prodUnlockedUntil < Date.now();
}

function hasSameUnlockedUntilAsSupplier(product) {
    const supplierUnlocked = getSupplierUnlockedUntil();
    const productUnlocked = Number(product?.profileUnlockedUntil);
    if (!Number.isFinite(productUnlocked) || !Number.isFinite(supplierUnlocked)) {
        return false;
    }
    return productUnlocked === supplierUnlocked;
}

function determineProductStatus(product) {
    // ১. প্রোডাক্টের profileUnlockedUntil < Date.now() হলে মেয়াদ শেষ
    if (isProductExpired(product)) {
        return {
            cssClass: "status-expired",
            text: "প্রোডাক্টের মেয়াদ শেষ!",
            showLiveButton: true,
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
        };
    }

    const subActive = isSubscriptionActive();
    const isApproved = product.approved === true;
    const isActive = product.active === true;

    if (!subActive) {
        return {
            cssClass: "status-expired",
            text: "সাবস্ক্রিপশন কেনার পর পণ্য অটোমেটিক লাইভ হয়ে যাবে!",
            showLiveButton: false,
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
        };
    }

    if (!isApproved) {
        return {
            cssClass: "status-review",
            text: "প্রোডাক্টটি রিভিউতে আছে!",
            showLiveButton: false,
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
        };
    }

    if (!isActive) {
        return {
            cssClass: "status-inactive",
            text: "এই পণ্যটা এখনো এক্টিভ করা হয়নি!",
            showLiveButton: false,
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
        };
    }

    return {
        cssClass: "status-live",
        text: "এই পণ্যটা লাইভ আছে!",
        showLiveButton: false,
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
    };
}

function updateProductInLocalState(productId, patchObj) {
    const idx = state.products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
        state.products[idx] = { ...state.products[idx], ...patchObj };
    }
    if (state.searchedProduct && state.searchedProduct.id === productId) {
        state.searchedProduct = { ...state.searchedProduct, ...patchObj };
    }

    if (state.isSearchMode && state.searchedProduct) {
        renderProductsList([state.searchedProduct]);
    } else {
        renderProductsList(state.products);
    }
}

async function handleLiveProductClick(product) {
    if (!product || !product.id) return;
    if (state.activatingProductIds.has(product.id)) return;

    const uid = verifyCurrentUid();
    state.activatingProductIds.add(product.id);

    if (state.isSearchMode && state.searchedProduct) {
        renderProductsList([state.searchedProduct]);
    } else {
        renderProductsList(state.products);
    }

    try {
        // Fresh read from supplyers/{uid} to verify latest profileUnlockedUntil
        const supplierRef = doc(db, "supplyers", uid);
        const supplierSnap = await getDoc(supplierRef);

        if (!supplierSnap.exists()) {
            showToast("সাপ্লায়ার তথ্য পাওয়া যায়নি।", "error");
            return;
        }

        const freshSupplierData = supplierSnap.data();
        state.supplierData = freshSupplierData;
        renderSupplierHeaderAndStats();

        const supplierUnlockedUntil = Number(freshSupplierData.profileUnlockedUntil) || 0;
        const productUnlockedUntil = Number(product.profileUnlockedUntil) || 0;

        // ২. সাপ্লায়ারের profileUnlockedUntil কি প্রোডাক্টের profileUnlockedUntil থেকে বড়?
        if (supplierUnlockedUntil > productUnlockedUntil) {
            const productRef = doc(db, "products", product.id);
            await updateDoc(productRef, {
                profileUnlockedUntil: supplierUnlockedUntil
            });

            updateProductInLocalState(product.id, {
                profileUnlockedUntil: supplierUnlockedUntil
            });

            showToast("প্রোডাক্ট আবার লাইভ হয়ে গেছে!", "success");
        } else {
            // সাপ্লায়ারের নিজেরই মেয়াদ শেষ বা বড় নয়
            showToast("আপনার সাবস্ক্রিপশনের মেয়াদ শেষ! সাবস্ক্রিপশন পেজে নেওয়া হচ্ছে...", "warning");
            setTimeout(() => {
                window.location.href = SUBSCRIPTION_PAGE_URL;
            }, 900);
        }

    } catch (error) {
        console.error("Live Product Update Error:", error);
        showToast(
            getBengaliErrorMessage(error, "পণ্য লাইভ করতে সমস্যা হয়েছে।"),
            "error"
        );
    } finally {
        state.activatingProductIds.delete(product.id);
        if (state.isSearchMode && state.searchedProduct) {
            renderProductsList([state.searchedProduct]);
        } else {
            renderProductsList(state.products);
        }
    }
}

// ==========================================
// 7. RENDERING PRODUCT CARDS & SKELETONS
// ==========================================
function renderSkeletonCards(count = 6) {
    dom.productsGrid.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const sk = document.createElement("div");
        sk.className = "skeleton-card";
        sk.innerHTML = `
            <div class="skeleton-box sk-img"></div>
            <div class="sk-body">
                <div class="skeleton-box sk-line w-40"></div>
                <div class="skeleton-box sk-line w-80"></div>
                <div class="skeleton-box sk-line w-100"></div>
                <div class="skeleton-box sk-box-lg"></div>
                <div class="skeleton-box sk-line w-100"></div>
            </div>
        `;
        dom.productsGrid.appendChild(sk);
    }
}

function renderProductsList(list) {
    dom.productsGrid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    list.forEach((product) => {
        const card = createProductCardElement(product);
        fragment.appendChild(card);
    });

    dom.productsGrid.appendChild(fragment);
}

function createProductCardElement(product) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.productId = product.id;

    // Images handling
    const images = Array.isArray(product.images) && product.images.length > 0
        ? product.images
        : [FALLBACK_IMAGE];
    const mainImgUrl = images[0];

    // Category lookup
    const catInfo = state.categoriesMap.get(product.categoryId) || {
        categoryName: product.categoryId || "ক্যাটাগরি নেই",
        categoryImage: FALLBACK_IMAGE
    };

    // Status Banner & Live Button
    const statusInfo = determineProductStatus(product);
    const isActivatingThis = state.activatingProductIds.has(product.id);

    // ৩. নতুন ব্যাজ লজিক: supplyers/{uid} ও products এর profileUnlockedUntil হুবহু সমান হলে
    const showSameUnlockedBadge = hasSameUnlockedUntilAsSupplier(product);

    // Approval & Active Badges
    const isApproved = product.approved === true;
    const isActive = product.active === true;

    // Description Truncation
    const fullDesc = String(product.productDescription || "কোনো বিবরণ দেওয়া হয়নি।");
    const isLongDesc = fullDesc.length > 95;
    const shortDesc = isLongDesc ? fullDesc.slice(0, 95) + "..." : fullDesc;

    // Variants HTML
    let variantsHtml = "";
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        variantsHtml = `<div class="variants-display">` + product.variants.map((v) => {
            const vals = Array.isArray(v.values) ? v.values.map((valObj) => {
                const extra = Number(valObj.extraPrice) || 0;
                const extraText = extra > 0 ? `<span class="variant-extra">(+৳${extra})</span>` : "";
                return `<span class="variant-val-chip">${escapeHTML(valObj.value)}${extraText}</span>`;
            }).join("") : "";
            return `
                <div class="variant-row">
                    <span class="variant-name">${escapeHTML(v.name)}:</span>
                    ${vals}
                </div>
            `;
        }).join("") + `</div>`;
    }

    // Multiple Image Thumbnails HTML
    let thumbsHtml = "";
    if (images.length > 1) {
        thumbsHtml = `<div class="thumb-strip">` + images.map((imgUrl, idx) => `
            <button type="button" class="thumb-btn ${idx === 0 ? "active" : ""}" data-img="${escapeHTML(imgUrl)}" aria-label="ছবি ${idx + 1}">
                <img src="${escapeHTML(imgUrl)}" alt="Thumbnail" onerror="this.src='${FALLBACK_IMAGE}'">
            </button>
        `).join("") + `</div>`;
    }

    card.innerHTML = `
        <div class="card-media">
            <img src="${escapeHTML(mainImgUrl)}" alt="${escapeHTML(product.productName)}" class="card-main-img" onerror="this.src='${FALLBACK_IMAGE}'">
            
            <div class="media-top-badges">
                ${product.freeDelivery === true ? `
                    <span class="badge-pill badge-free-delivery">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                        ফ্রি ডেলিভারি
                    </span>
                ` : `<span></span>`}

                <span class="badge-pill badge-active-state ${isActive ? "" : "is-inactive"}">
                    ${isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
                </span>
            </div>

            ${thumbsHtml}
        </div>

        <div class="card-body">
            <!-- Status Message Banner -->
            <div class="product-status-block">
                <div class="product-status-banner ${statusInfo.cssClass}">
                    ${statusInfo.icon}
                    <span>${escapeHTML(statusInfo.text)}</span>
                </div>
                ${statusInfo.showLiveButton ? `
                    <button type="button" class="btn btn-primary btn-sm live-now-btn" ${isActivatingThis ? "disabled" : ""}>
                        ${isActivatingThis ? "লাইভ হচ্ছে..." : "লাইভ করুন"}
                    </button>
                ` : ""}
            </div>

            ${showSameUnlockedBadge ? `
                <div class="subscription-sync-badge">
                    সাবস্ক্রিপশন কিনুন আপনার পণ্য এখনো লাইভ করা নেই!
                </div>
            ` : ""}

            <!-- Category & Approval -->
            <div class="card-meta-top">
                <span class="category-tag">
                    <img src="${escapeHTML(catInfo.categoryImage)}" alt="${escapeHTML(catInfo.categoryName)}" onerror="this.src='${FALLBACK_IMAGE}'">
                    <span>${escapeHTML(catInfo.categoryName)}</span>
                </span>

                <span class="approval-tag ${isApproved ? "approved" : "pending"}">
                    ${isApproved ? "অনুমোদিত" : "রিভিউ পেন্ডিং"}
                </span>
            </div>

            <!-- Product Name -->
            <h3 class="product-title">${escapeHTML(product.productName || "নামহীন পণ্য")}</h3>

            <!-- Description -->
            <div class="product-desc-box">
                <span class="desc-text">${escapeHTML(shortDesc)}</span>
                ${isLongDesc ? `<button type="button" class="desc-toggle-btn" data-expanded="false">বিস্তারিত দেখুন</button>` : ""}
            </div>

            <!-- Pricing -->
            <div class="pricing-box">
                <div class="price-item">
                    <span class="price-label">পাইকারি দাম</span>
                    <span class="price-amount">৳${Number(product.price || 0).toLocaleString("bn-BD")}</span>
                </div>
                <div class="price-item">
                    <span class="price-label">সর্বোচ্চ বিক্রির রেট</span>
                    <span class="price-amount high-rate">৳${Number(product.highRate || 0).toLocaleString("bn-BD")}</span>
                </div>
            </div>

            <!-- Variants -->
            ${variantsHtml}

            <!-- Product ID & Created Date -->
            <div class="id-date-footer">
                <div class="id-copy-row">
                    <span class="id-text">ID: ${escapeHTML(product.id)}</span>
                    <button type="button" class="icon-copy-btn copy-id-btn" title="প্রোডাক্ট আইডি কপি করুন">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div>যুক্ত করার তারিখ: ${formatBengaliDate(product.createdAt)}</div>
            </div>
        </div>

        <!-- Card Actions (Edit + JSON Copy) -->
        <div class="card-actions card-actions-two">
            <button type="button" class="action-btn edit-btn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>এডিট</span>
            </button>

            <button type="button" class="action-btn json-btn" title="প্রোডাক্ট JSON কপি করুন">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>JSON</span>
            </button>
        </div>
    `;

    // Bind "লাইভ করুন" Button
    const liveNowBtn = card.querySelector(".live-now-btn");
    if (liveNowBtn) {
        liveNowBtn.addEventListener("click", () => {
            handleLiveProductClick(product);
        });
    }

    // Bind Thumbnail Switcher
    const mainImgEl = card.querySelector(".card-main-img");
    card.querySelectorAll(".thumb-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            mainImgEl.src = btn.dataset.img;
            card.querySelectorAll(".thumb-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // Bind Description Expand/Collapse
    const descToggle = card.querySelector(".desc-toggle-btn");
    if (descToggle) {
        const descTextEl = card.querySelector(".desc-text");
        descToggle.addEventListener("click", () => {
            const expanded = descToggle.dataset.expanded === "true";
            if (expanded) {
                descTextEl.textContent = shortDesc;
                descToggle.textContent = "বিস্তারিত দেখুন";
                descToggle.dataset.expanded = "false";
            } else {
                descTextEl.textContent = fullDesc;
                descToggle.textContent = "সংক্ষিপ্ত করুন";
                descToggle.dataset.expanded = "true";
            }
        });
    }

    // Bind Copy Product ID
    card.querySelector(".copy-id-btn").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(product.id);
            showToast("প্রোডাক্ট আইডি কপি হয়েছে!", "success");
        } catch {
            showToast("আইডি কপি করতে সমস্যা হয়েছে।", "error");
        }
    });

    // Bind Copy Product JSON
    card.querySelector(".json-btn").addEventListener("click", async () => {
        await copyProductJsonToClipboard(product);
    });

    // Bind Edit Button
    card.querySelector(".edit-btn").addEventListener("click", () => {
        openEditModal(product);
    });

    return card;
}

// ==========================================
// 8. PRODUCT JSON COPY FEATURE
// ==========================================
async function copyProductJsonToClipboard(product) {
    const formattedCreatedAt = product.createdAt && typeof product.createdAt.toDate === "function"
        ? product.createdAt.toDate().toISOString()
        : product.createdAt || null;

    const exportObj = {
        id: product.id,
        productName: product.productName || "",
        productDescription: product.productDescription || "",
        price: Number(product.price || 0),
        highRate: Number(product.highRate || 0),
        categoryId: product.categoryId || "",
        freeDelivery: Boolean(product.freeDelivery),
        variants: Array.isArray(product.variants) ? product.variants : [],
        images: Array.isArray(product.images) ? product.images : [],
        active: Boolean(product.active),
        uid: product.uid,
        createdAt: formattedCreatedAt
    };

    if (Object.prototype.hasOwnProperty.call(product, "approved")) {
        exportObj.approved = product.approved;
    }

    try {
        await navigator.clipboard.writeText(JSON.stringify(exportObj, null, 2));
        showToast("প্রোডাক্টের JSON সফলভাবে কপি হয়েছে!", "success");
    } catch (error) {
        console.error("JSON Copy Error:", error);
        showToast("JSON কপি করতে ব্যর্থ হয়েছে।", "error");
    }
}

// ==========================================
// 9. PRODUCT EDIT SYSTEM (STRICT 8 FIELDS)
// ==========================================
function openEditModal(product) {
    const uid = verifyCurrentUid();
    if (product.uid !== uid) {
        showToast("আপনি শুধুমাত্র নিজের পণ্য সম্পাদনা করতে পারবেন।", "error");
        return;
    }

    dom.editProductId.value = product.id;
    dom.editDisplayProductId.textContent = product.id;
    dom.editProductName.value = product.productName || "";
    dom.editProductDescription.value = product.productDescription || "";
    dom.editPrice.value = product.price ?? "";
    dom.editHighRate.value = product.highRate ?? "";
    dom.editActive.checked = product.active === true;
    dom.editFreeDelivery.checked = product.freeDelivery === true;

    selectCategoryInModal(product.categoryId || "");

    dom.variantsEditorContainer.innerHTML = "";
    const variants = Array.isArray(product.variants) ? product.variants : [];
    variants.forEach((v) => addVariantGroupToEditor(v.name, v.values));

    dom.editProductModal.classList.remove("hidden");
}

function closeEditModal() {
    if (state.isUpdating) return;
    dom.editProductModal.classList.add("hidden");
    dom.categoryDropdownList.classList.add("hidden");
}

function addVariantGroupToEditor(variantName = "", values = []) {
    const groupBox = document.createElement("div");
    groupBox.className = "variant-group-box";

    groupBox.innerHTML = `
        <div class="variant-group-top">
            <input type="text" class="form-control variant-name-input" placeholder="ভ্যারিয়েন্টের নাম (যেমন: সাইজ, রঙ)" value="${escapeHTML(variantName)}">
            <button type="button" class="btn btn-outline btn-sm add-val-btn">+ ভ্যালু</button>
            <button type="button" class="icon-remove-btn remove-group-btn" title="ভ্যারিয়েন্ট মুছুন">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
            </button>
        </div>
        <div class="variant-values-list"></div>
    `;

    const valuesList = groupBox.querySelector(".variant-values-list");

    const addValueRow = (val = "", extra = 0) => {
        const row = document.createElement("div");
        row.className = "variant-value-row";
        row.innerHTML = `
            <input type="text" class="form-control val-text-input" placeholder="ভ্যালু (যেমন: XL, লাল)" value="${escapeHTML(val)}">
            <input type="number" class="form-control val-extra-input" placeholder="অতিরিক্ত দাম" min="0" step="any" value="${Number(extra) || 0}">
            <button type="button" class="icon-remove-btn remove-val-btn" title="ভ্যালু মুছুন">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        row.querySelector(".remove-val-btn").addEventListener("click", () => row.remove());
        valuesList.appendChild(row);
    };

    if (Array.isArray(values) && values.length > 0) {
        values.forEach((v) => addValueRow(v.value, v.extraPrice));
    } else {
        addValueRow("", 0);
    }

    groupBox.querySelector(".add-val-btn").addEventListener("click", () => addValueRow("", 0));
    groupBox.querySelector(".remove-group-btn").addEventListener("click", () => groupBox.remove());

    dom.variantsEditorContainer.appendChild(groupBox);
}

function collectAndValidateVariants() {
    const groupEls = dom.variantsEditorContainer.querySelectorAll(".variant-group-box");
    const variants = [];

    for (const groupEl of groupEls) {
        const name = groupEl.querySelector(".variant-name-input").value.trim();
        if (!name) {
            throw new Error("প্রতিটি ভ্যারিয়েন্টের নাম দিতে হবে অথবা অপ্রয়োজনীয় ভ্যারিয়েন্ট মুছে ফেলুন।");
        }

        const valueRows = groupEl.querySelectorAll(".variant-value-row");
        const values = [];

        for (const row of valueRows) {
            const valText = row.querySelector(".val-text-input").value.trim();
            const extraRaw = row.querySelector(".val-extra-input").value;
            const extraPrice = extraRaw === "" ? 0 : Number(extraRaw);

            if (!valText) {
                throw new Error(`"${name}" ভ্যারিয়েন্টের সব ভ্যালুর নাম পূরণ করুন।`);
            }
            if (!Number.isFinite(extraPrice) || extraPrice < 0) {
                throw new Error(`"${valText}"-এর অতিরিক্ত দাম ০ বা তার বেশি হতে হবে।`);
            }

            values.push({
                value: valText,
                extraPrice: extraPrice
            });
        }

        if (values.length === 0) {
            throw new Error(`"${name}" ভ্যারিয়েন্টে কমপক্ষে একটি ভ্যালু থাকতে হবে।`);
        }

        variants.push({ name, values });
    }

    return variants;
}

async function handleEditFormSubmit(e) {
    e.preventDefault();
    if (state.isUpdating) return;

    const uid = verifyCurrentUid();
    const productId = dom.editProductId.value.trim();
    const productName = dom.editProductName.value.trim();
    const productDescription = dom.editProductDescription.value.trim();
    const price = Number(dom.editPrice.value);
    const highRate = Number(dom.editHighRate.value);
    const categoryId = dom.editCategoryId.value.trim();
    const freeDelivery = Boolean(dom.editFreeDelivery.checked);
    const active = Boolean(dom.editActive.checked);

    if (!productId) {
        showToast("অবৈধ প্রোডাক্ট আইডি (Invalid Product Data)।", "error");
        return;
    }
    if (!productName) {
        showToast("অনুগ্রহ করে পণ্যের নাম লিখুন।", "warning");
        return;
    }
    if (!productDescription) {
        showToast("অনুগ্রহ করে পণ্যের বিবরণ লিখুন।", "warning");
        return;
    }
    if (!Number.isFinite(price) || price <= 0) {
        showToast("পাইকারি দাম অবশ্যই ০-এর বেশি হতে হবে।", "warning");
        return;
    }
    if (!Number.isFinite(highRate) || highRate <= price) {
        showToast("সর্বোচ্চ বিক্রির রেট অবশ্যই পাইকারি দামের চেয়ে বেশি হতে হবে।", "warning");
        return;
    }
    if (!categoryId || !state.categoriesMap.has(categoryId)) {
        showToast("অনুগ্রহ করে একটি সঠিক ক্যাটাগরি নির্বাচন করুন।", "warning");
        return;
    }

    let variants = [];
    try {
        variants = collectAndValidateVariants();
    } catch (valErr) {
        showToast(valErr.message, "warning");
        return;
    }

    const allowedUpdatePayload = {
        productName,
        productDescription,
        price,
        highRate,
        categoryId,
        freeDelivery,
        variants,
        active
    };

    state.isUpdating = true;
    dom.saveEditBtn.disabled = true;
    dom.saveEditSpinner.classList.remove("hidden");
    dom.saveEditText.textContent = "সংরক্ষণ হচ্ছে...";

    try {
        const productRef = doc(db, "products", productId);
        await updateDoc(productRef, allowedUpdatePayload);

        updateProductInLocalState(productId, allowedUpdatePayload);

        state.isUpdating = false;
        dom.saveEditBtn.disabled = false;
        dom.saveEditSpinner.classList.add("hidden");
        dom.saveEditText.textContent = "পরিবর্তন সংরক্ষণ করুন";

        closeEditModal();
        showToast("পণ্যের তথ্য সফলভাবে হালনাগাদ হয়েছে!", "success");

    } catch (error) {
        console.error("Update Product Error:", error);
        showToast(
            getBengaliErrorMessage(error, "পণ্য আপডেট করতে ব্যর্থ হয়েছে (Update Failed)।"),
            "error"
        );
    } finally {
        state.isUpdating = false;
        dom.saveEditBtn.disabled = false;
        dom.saveEditSpinner.classList.add("hidden");
        dom.saveEditText.textContent = "পরিবর্তন সংরক্ষণ করুন";
    }
}

// ==========================================
// 10. UI STATE HELPERS & EVENT LISTENERS
// ==========================================
function hideStateBoxes() {
    dom.errorStateBox.classList.add("hidden");
    dom.emptyStateBox.classList.add("hidden");
}

function showErrorState(title, message) {
    dom.emptyStateBox.classList.add("hidden");
    dom.errorTitle.textContent = title;
    dom.errorMessage.textContent = message;
    dom.errorStateBox.classList.remove("hidden");
}

function showEmptyState(title, desc) {
    dom.errorStateBox.classList.add("hidden");
    dom.emptyStateTitle.textContent = title;
    dom.emptyStateDesc.textContent = desc;
    dom.emptyStateBox.classList.remove("hidden");
}

dom.filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
        const selectedFilter = chip.dataset.filter;
        if (selectedFilter === state.activeFilter && !state.isSearchMode) return;

        if (state.isSearchMode) {
            state.isSearchMode = false;
            state.searchedProduct = null;
            dom.searchProductIdInput.value = "";
            dom.clearSearchBtn.classList.add("hidden");
            dom.searchResultBanner.classList.add("hidden");
        }

        dom.filterChips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");

        state.activeFilter = selectedFilter;
        fetchProducts({ reset: true });
    });
});

dom.loadMoreBtn.addEventListener("click", () => {
    fetchProducts({ reset: false });
});

dom.retryLoadBtn.addEventListener("click", () => {
    if (state.isSearchMode) {
        handleProductIdSearch(dom.searchProductIdInput.value);
    } else {
        fetchProducts({ reset: true });
    }
});

dom.productSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleProductIdSearch(dom.searchProductIdInput.value);
});

dom.searchProductIdInput.addEventListener("input", () => {
    const hasVal = dom.searchProductIdInput.value.trim().length > 0;
    dom.clearSearchBtn.classList.toggle("hidden", !hasVal);
    if (!hasVal && state.isSearchMode) {
        clearProductSearch();
    }
});

dom.clearSearchBtn.addEventListener("click", clearProductSearch);
dom.resetFromBannerBtn.addEventListener("click", clearProductSearch);

dom.categoryTriggerBtn.addEventListener("click", () => {
    dom.categoryDropdownList.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    if (!e.target.closest("#categorySelectWrapper")) {
        dom.categoryDropdownList.classList.add("hidden");
    }
});

dom.addVariantGroupBtn.addEventListener("click", () => addVariantGroupToEditor("", []));
dom.closeEditModalBtn.addEventListener("click", closeEditModal);
dom.cancelEditBtn.addEventListener("click", closeEditModal);
dom.editProductForm.addEventListener("submit", handleEditFormSubmit);
