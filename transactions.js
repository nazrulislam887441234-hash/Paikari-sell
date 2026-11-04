import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocsFromServer, 
    startAfter 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCIRWmozT0XcEXuXtQ6RDiDo6vtT1T9mU",
  authDomain: "paikarisell-ghotimarket.firebaseapp.com",
  projectId: "paikarisell-ghotimarket",
  storageBucket: "paikarisell-ghotimarket.firebasestorage.app",
  messagingSenderId: "464086432830",
  appId: "1:464086432830:web:a10fdd9884954e380e656f",
  measurementId: "G-E3HR2F9TC5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const transactionsContainer = document.getElementById("transactionsContainer");
const loadMoreIndicator = document.getElementById("loadMoreIndicator");
const endOfListMessage = document.getElementById("endOfListMessage");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const retryBtn = document.getElementById("retryBtn");
const userEmailDisplay = document.getElementById("userEmailDisplay");
const logoutBtn = document.getElementById("logoutBtn");

// State Variables
let currentUid = null;
let lastVisibleDocument = null;
let isLoading = false;
let hasMoreData = true;
let observer = null;
let currentFetchType = 'initial'; // 'initial' or 'pagination'

// SVG Icons Constants
const ICONS = {
    up: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    down: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    neutral: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
};

// Authentication State Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "/login";
    } else {
        currentUid = user.uid;
        userEmailDisplay.textContent = user.email || "Supplier Dashboard";
        loadInitialTransactions();
    }
});

// Logout Handler
logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.href = "/login";
    } catch (error) {
        console.error("লগআউট করতে সমস্যা হয়েছে:", error);
    }
});

// Format Bangladesh Date & Time (Asia/Dhaka)
function formatBDDateTime(timestamp) {
    if (!timestamp) return "তারিখ নেই";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const options = {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    
    let formatted = new Intl.DateTimeFormat('bn-BD', options).format(date);
    // Adjust AM/PM indicators to Bengali if needed
    formatted = formatted.replace('AM', 'সকাল').replace('PM', 'সন্ধ্যা');
    return formatted;
}

// Format Currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('bn-BD', {
        style: 'currency',
        currency: 'BDT',
        minimumFractionDigits: 2
    }).format(amount).replace('BDT', '৳');
}

// Render Single Transaction Card HTML
function createTransactionCardHTML(data) {
    const { name, oldBalance, balance, createdAt } = data;
    
    const diff = balance - oldBalance;
    let statusClass = "neutral";
    let iconHTML = ICONS.neutral;
    let diffSign = "";
    
    if (balance > oldBalance) {
        statusClass = "increase";
        iconHTML = ICONS.up;
        diffSign = "+";
    } else if (balance < oldBalance) {
        statusClass = "decrease";
        iconHTML = ICONS.down;
        diffSign = "";
    }

    const formattedDiff = `${diffSign}${formatCurrency(diff)}`;
    const formattedTime = formatBDDateTime(createdAt);

    return `
        <div class="transaction-card">
            <div class="txn-indicator ${statusClass}" title="${statusClass === 'increase' ? 'ব্যালেন্স বৃদ্ধি পেয়েছে' : statusClass === 'decrease' ? 'ব্যালেন্স কমেছে' : 'ব্যালেন্স অপরিবর্তিত'}">
                ${iconHTML}
            </div>
            <div class="txn-details">
                <h4 class="txn-name">${escapeHTML(name || "লেনদেন")}</h4>
                <span class="txn-time">${formattedTime}</span>
            </div>
            <div class="txn-amounts-area">
                <div class="difference-amount ${statusClass}">${formattedDiff}</div>
                <div class="balance-meta">
                    আগের: <span>${formatCurrency(oldBalance)}</span> | পর: <span>${formatCurrency(balance)}</span>
                </div>
            </div>
        </div>
    `;
}

// XSS Protection Helper
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Load Initial Transactions (First 20)
async function loadInitialTransactions() {
    currentFetchType = 'initial';
    isLoading = true;
    errorState.style.display = "none";
    emptyState.style.display = "none";
    endOfListMessage.style.display = "none";
    
    transactionsContainer.innerHTML = `
        <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line amount"></div></div>
        <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line amount"></div></div>
        <div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line amount"></div></div>
    `;

    try {
        const firstQuery = query(
            collection(db, "transactions"),
            where("uid", "==", currentUid),
            orderBy("createdAt", "desc"),
            limit(20)
        );

        const snapshot = await getDocsFromServer(firstQuery);
        
        transactionsContainer.innerHTML = "";

        if (snapshot.empty) {
            emptyState.style.display = "block";
            hasMoreData = false;
            isLoading = false;
            return;
        }

        let htmlContent = "";
        snapshot.forEach((doc) => {
            htmlContent += createTransactionCardHTML(doc.data());
        });

        transactionsContainer.innerHTML = htmlContent;
        lastVisibleDocument = snapshot.docs[snapshot.docs.length - 1];
        
        if (snapshot.docs.length < 20) {
            hasMoreData = false;
            endOfListMessage.style.display = "block";
        } else {
            hasMoreData = true;
            setupIntersectionObserver();
        }

    } catch (error) {
        console.error("Firestore Query Error:", error);
        transactionsContainer.innerHTML = "";
        errorState.style.display = "block";
    } finally {
        isLoading = false;
    }
}

// Load Next Transactions (Pagination via Infinite Scroll)
async function loadMoreTransactions() {
    if (isLoading || !hasMoreData || !lastVisibleDocument) return;

    currentFetchType = 'pagination';
    isLoading = true;
    loadMoreIndicator.style.display = "flex";

    try {
        const nextQuery = query(
            collection(db, "transactions"),
            where("uid", "==", currentUid),
            orderBy("createdAt", "desc"),
            startAfter(lastVisibleDocument),
            limit(20)
        );

        const snapshot = await getDocsFromServer(nextQuery);

        if (snapshot.empty) {
            hasMoreData = false;
            loadMoreIndicator.style.display = "none";
            endOfListMessage.style.display = "block";
            if (observer) observer.disconnect();
            isLoading = false;
            return;
        }

        let htmlContent = "";
        snapshot.forEach((doc) => {
            htmlContent += createTransactionCardHTML(doc.data());
        });

        transactionsContainer.insertAdjacentHTML('beforeend', htmlContent);
        lastVisibleDocument = snapshot.docs[snapshot.docs.length - 1];

        if (snapshot.docs.length < 20) {
            hasMoreData = false;
            if (observer) observer.disconnect();
            endOfListMessage.style.display = "block";
        }

    } catch (error) {
        console.error("Pagination Error:", error);
    } finally {
        loadMoreIndicator.style.display = "none";
        isLoading = false;
    }
}

// Intersection Observer for Infinite Scroll
function setupIntersectionObserver() {
    if (observer) observer.disconnect();

    const options = {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    };

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMoreData && !isLoading) {
                loadMoreTransactions();
            }
        });
    }, options);

    // Observe the bottom indicator element
    observer.observe(loadMoreIndicator);
}

// Retry Button Listener
retryBtn.addEventListener("click", () => {
    if (currentFetchType === 'initial') {
        loadInitialTransactions();
    } else {
        loadMoreTransactions();
    }
});
