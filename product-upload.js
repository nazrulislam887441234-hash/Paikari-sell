import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    collection, 
    getDocs,  
    addDoc, 
    query, 
    orderBy, 
    limit, 
    serverTimestamp,
    Timestamp 
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

// Owner Emails
const OWNER_EMAILS = [
    "nazrulislam887441234@gmail.com",
    "support@ghotimarket.com"
];

// Global State
let selectedFiles = [];
let categoriesList = [];
let currentUser = null;
let currentSupplierData = null;

// DOM Elements
const authLoader = document.getElementById("auth-loader");
const authLoaderText = document.getElementById("auth-loader-text");
const dashboardWrapper = document.getElementById("dashboard-wrapper");
const supplierEmailDisplay = document.getElementById("supplier-email-display");
const logoutBtn = document.getElementById("logout-btn");
const productForm = document.getElementById("product-upload-form");
const categorySelect = document.getElementById("categorySelect");
const addVariantBtn = document.getElementById("add-variant-btn");
const variantsContainer = document.getElementById("variants-container");
const dropzone = document.getElementById("dropzone");
const imageInput = document.getElementById("imageInput");
const imagePreviewGrid = document.getElementById("imagePreviewGrid");
const imageCounter = document.getElementById("imageCounter");
const uploadBtn = document.getElementById("uploadBtn");
const customModal = document.getElementById("custom-modal");
const modalContent = document.getElementById("modalContent");
const customToast = document.getElementById("custom-toast");

// Toast Utility
function showToast(message) {
    customToast.textContent = message;
    customToast.classList.add("show");
    setTimeout(() => {
        customToast.classList.remove("show");
    }, 3500);
}

// Modal Utility
function showCustomModal(iconHtml, title, message, buttonText, buttonAction) {
    modalContent.innerHTML = `
        <div class="modal-icon ${iconHtml.includes('success') ? 'success' : ''}">${iconHtml}</div>
        <div class="modal-title">${title}</div>
        <div class="modal-message">${message}</div>
        <button id="modalActionBtn" class="modal-btn">${buttonText}</button>
    `;
    customModal.style.display = "flex";
    const btn = document.getElementById("modalActionBtn");
    btn.onclick = () => {
        customModal.style.display = "none";
        if (buttonAction) buttonAction();
    };
}

// 1. Authentication & Supplier Verification Flow
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "/login";
        return;
    }
    currentUser = user;
    supplierEmailDisplay.textContent = user.email;

    try {
        authLoaderText.textContent = "সাপ্লায়ার তথ্য যাচাই করা হচ্ছে...";
        
        // 3. Supplier Document Check
        const supplierRef = doc(db, "supplyers", user.uid);
        const supplierSnap = await getDoc(supplierRef);

        if (!supplierSnap.exists()) {
            window.location.href = "/signup1";
            return;
        }

        currentSupplierData = supplierSnap.data();

        // 4. Balance Verification
        const balance = Number(currentSupplierData.balance);
        if (!Number.isFinite(balance)) {
            showCustomModal(
                `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
                "ব্যালেন্স ত্রুটি!",
                "আপনার একাউন্টের ব্যালেন্স ডেটা সঠিক নয়। অনুগ্রহ করে সাপোর্টের সাথে যোগাযোগ করুন।",
                "ঠিক আছে",
                () => {}
            );
            return;
        }

        if (balance < 0) {
            showCustomModal(
                `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
                "বকেয়া পরিশোধ প্রয়োজন",
                "আপনার পাওনা টাকা দয়া করে পরিশোধ করুন।",
                "পাওনা টাকা পরিশোধ করুন",
                () => { window.location.href = "/add-balance"; }
            );
            return;
        }

        // 5. Subscription Verification
        authLoaderText.textContent = "সাবস্ক্রিপশন স্ট্যাটাস যাচাই করা হচ্ছে...";
        const currentTime = Date.now();
        const unlockedUntil = Number(currentSupplierData.profileUnlockedUntil);
        const isSubscriptionActive = Number.isFinite(unlockedUntil) && unlockedUntil > currentTime;

        if (!isSubscriptionActive) {
            showCustomModal(
                `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
                "সাবস্ক্রিপশন প্রয়োজন",
                "প্রোডাক্ট আপলোড করতে অবশ্যই সাবস্ক্রিপশন এর প্রয়োজন!",
                "সাবস্ক্রিপশন কিনুন",
                () => { window.location.href = "/subscriptions"; }
            );
            return;
        }

        // Load Categories
        authLoaderText.textContent = "ক্যাটাগরি লোড করা হচ্ছে...";
        await loadCategories();

        // All Checks Passed -> Reveal Dashboard
        authLoader.style.display = "none";
        dashboardWrapper.style.display = "flex";

    } catch (error) {
        console.error("Verification Error:", error);
        showCustomModal(
            `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
            "সিস্টেম ত্রুটি",
            "তথ্য যাচাই করার সময় একটি সমস্যা হয়েছে। অনুগ্রহ করে পেজটি রিফ্রেশ করুন।",
            "রিফ্রেশ করুন",
            () => { window.location.reload(); }
        );
    }
});

// Logout Handler
logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "/login";
});

// Load Categories from Firestore
async function loadCategories() {
    try {
        const catQuery = query(collection(db, "categories"));
        const querySnapshot = await getDocs(catQuery);
        categoriesList = [];
        
        categorySelect.innerHTML = `<option value="">ক্যাটাগরি নির্বাচন করুন</option>`;
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            categoriesList.push({ id: docSnap.id, ...data });
            
            const option = document.createElement("option");
            option.value = docSnap.id;
            option.textContent = data.categoryName || "নামহীন ক্যাটাগরি";
            categorySelect.appendChild(option);
        });

        if (categoriesList.length === 0) {
            categorySelect.innerHTML = `<option value="">কোনো ক্যাটাগরি পাওয়া যায়নি</option>`;
        }
    } catch (error) {
        console.error("Category Load Error:", error);
        categorySelect.innerHTML = `<option value="">ক্যাটাগরি লোড করতে ব্যর্থ হয়েছে</option>`;
        showToast("ক্যাটাগরি লোড করা যায়নি!");
    }
}

// G. Dynamic Variant Management System
addVariantBtn.addEventListener("click", () => {
    const variantId = 'var_' + Date.now();
    const variantCard = document.createElement("div");
    variantCard.className = "variant-card";
    variantCard.dataset.variantId = variantId;
    
    variantCard.innerHTML = `
        <div class="variant-header-row">
            <input type="text" placeholder="ভ্যারিয়েন্ট নাম (যেমন: সাইজ, রঙ)" class="variant-name-input" required>
            <button type="button" class="btn-icon-danger remove-variant-btn" title="ভ্যারিয়েন্ট মুছুন">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>
        <div class="variant-values-list">
            <!-- Values injected here -->
        </div>
        <button type="button" class="btn-secondary-sm add-value-btn">
            + ভ্যালু যোগ করুন
        </button>
    `;
    
    variantsContainer.appendChild(variantCard);

    const valuesList = variantCard.querySelector(".variant-values-list");
    const addValBtn = variantCard.querySelector(".add-value-btn");
    const removeVarBtn = variantCard.querySelector(".remove-variant-btn");

    // Add initial value row
    addVariantValueRow(valuesList);

    addValBtn.addEventListener("click", () => addVariantValueRow(valuesList));
    removeVarBtn.addEventListener("click", () => variantCard.remove());
});

function addVariantValueRow(container) {
    const valRow = document.createElement("div");
    valRow.className = "variant-value-row";
    valRow.innerHTML = `
        <input type="text" placeholder="ভ্যালু (যেমন: M, XL)" class="val-name-input" required style="flex: 2;">
        <input type="number" placeholder="এক্সট্রা দাম (৳)" class="val-price-input" value="0" min="0" step="any" required style="flex: 1;">
        <button type="button" class="btn-icon-danger remove-val-btn" title="মুছুন">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;
    container.appendChild(valRow);
    valRow.querySelector(".remove-val-btn").addEventListener("click", () => valRow.remove());
}

// H. Image Upload Handling (Dropzone & Input)
dropzone.addEventListener("click", () => imageInput.click());

dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--primary)";
});

dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "var(--border-color)";
});

dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--border-color)";
    handleFiles(e.dataTransfer.files);
});

imageInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    for (let file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (selectedFiles.length >= 10) {
            showToast("সর্বোচ্চ ১০টি ইমেজ নির্বাচন করা যাবে।");
            break;
        }
        selectedFiles.push(file);
    }
    renderImagePreviews();
}

function renderImagePreviews() {
    imagePreviewGrid.innerHTML = "";
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const item = document.createElement("div");
            item.className = "image-preview-item";
            item.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button type="button" class="image-remove-btn" data-index="${index}">&times;</button>
            `;
            imagePreviewGrid.appendChild(item);

            item.querySelector(".image-remove-btn").addEventListener("click", () => {
                selectedFiles.splice(index, 1);
                renderImagePreviews();
            });
        };
        reader.readAsDataURL(file);
    });
    imageCounter.textContent = `নির্বাচিত ইমেজ: ${selectedFiles.length} / ১০`;
}

// VII. Fetch ImgBB API Key from public_keys Collection
async function getImgBBApiKey() {
    try {
        const pkQuery = query(collection(db, "public_keys"), orderBy("createdAt", "desc"), limit(1));
        const pkSnapshot = await getDocs(pkQuery);
        
        if (pkSnapshot.empty) {
            throw new Error("কোনো ImgBB API Key পাওয়া যায়নি।");
        }

        const latestKeyDoc = pkSnapshot.docs[0].data();
        if (!latestKeyDoc.apiKey) {
            throw new Error("API Key ফিল্ডটি খালি রয়েছে।");
        }
        return latestKeyDoc.apiKey;
    } catch (error) {
        console.error("ImgBB API Key Error:", error);
        throw new Error("ImgBB API Key সংগ্রহ করতে ব্যর্থ হয়েছে।");
    }
}

// VIII. Upload Image to ImgBB
async function uploadImageToImgBB(file, apiKey) {
    const timestamp = Date.now();
    const customFilename = `${timestamp}${file.name}`;
    
    const formData = new FormData();
    formData.append("image", file);
    formData.append("name", customFilename);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: "POST",
        body: formData
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error("ইমেজ আপলোড ব্যর্থ হয়েছে: " + (data.error?.message || "অজানা ত্রুটি"));
    }
    return data.data.url;
}

// XI & XII. Final Product Upload & Submission Handling
productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const productName = document.getElementById("productName").value.trim();
    const productDescription = document.getElementById("productDescription").value.trim();
    const price = Number(document.getElementById("price").value);
    const highRate = Number(document.getElementById("highRate").value);
    const categoryId = categorySelect.value;
    const freeDelivery = document.getElementById("freeDelivery").checked;
    const activeStatus = document.getElementById("activeStatus").checked;

    // 1. Validation Checks
    if (!productName || !productDescription) {
        showToast("সব প্রয়োজনীয় ঘর পূরণ করুন।");
        return;
    }
    if (price <= 0) {
        showToast("পাইকারি দাম অবশ্যই পজেটিভ সংখ্যা হতে হবে।");
        return;
    }
    if (highRate <= price) {
        showToast("সর্বোচ্চ রিসেলারদের বিক্রির রেট অবশ্যই পাইকারি দামের চেয়ে বেশি হতে হবে।");
        return;
    }
    if (!categoryId) {
        showToast("সঠিক ক্যাটাগরি নির্বাচন করুন।");
        return;
    }
    if (selectedFiles.length < 1) {
        showToast("সর্বনিম্ন ১টি প্রোডাক্ট ইমেজ আপলোড করা বাধ্যতামূলক।");
        return;
    }

    const submitBtn = document.getElementById("uploadBtn");
    const btnText = submitBtn.querySelector(".btn-text");
    const btnSpinner = submitBtn.querySelector(".btn-spinner");

    try {
        submitBtn.disabled = true;
        btnSpinner.style.display = "block";

        // 4 & 5. Re-verify Balance and Subscription before final commit
        btnText.textContent = "তথ্য পুনরায় যাচাই করা হচ্ছে...";
        const supplierRef = doc(db, "supplyers", currentUser.uid);
        const supplierSnap = await getDoc(supplierRef);
        if (!supplierSnap.exists() || Number(supplierSnap.data().balance) < 0 || Number(supplierSnap.data().profileUnlockedUntil) <= Date.now()) {
            throw new Error("আপনার ব্যালেন্স বা সাবস্ক্রিপশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে রিনিউ করুন।");
        }

        // 7. Get ImgBB API Key
        btnText.textContent = "ImgBB API Key সংগ্রহ করা হচ্ছে...";
        const imgbbKey = await getImgBBApiKey();

        // 8. Upload Images
        btnText.textContent = `ছবি আপলোড হচ্ছে (০/${selectedFiles.length})...`;
        const imageUrls = [];
        for (let i = 0; i < selectedFiles.length; i++) {
            btnText.textContent = `ছবি আপলোড হচ্ছে (${i + 1}/${selectedFiles.length})...`;
            const url = await uploadImageToImgBB(selectedFiles[i], imgbbKey);
            imageUrls.push(url);
        }

        // Parse Variants
        btnText.textContent = "ভ্যারিয়েন্ট প্রসেস করা হচ্ছে...";
        const variants = [];
        const variantCards = variantsContainer.querySelectorAll(".variant-card");
        
        variantCards.forEach(card => {
            const varName = card.querySelector(".variant-name-input").value.trim();
            if (!varName) return;
            
            const values = [];
            const valRows = card.querySelectorAll(".variant-value-row");
            valRows.forEach(row => {
                const valName = row.querySelector(".val-name-input").value.trim();
                const extraPrc = Number(row.querySelector(".val-price-input").value);
                if (valName) {
                    values.push({
                        value: valName,
                        extraPrice: Number.isFinite(extraPrc) ? extraPrc : 0
                    });
                }
            });

            if (values.length > 0) {
                variants.push({
                    name: varName,
                    values: values
                });
            }
        });

        // 10. Final Product Document Structure
        btnText.textContent = "পণ্য সংরক্ষণ করা হচ্ছে...";
        const productData = {
            productName: productName,
            productDescription: productDescription,
            price: price,
            highRate: highRate,
            categoryId: categoryId,
            freeDelivery: freeDelivery,
            variants: variants,
            images: imageUrls,
            active: activeStatus,
            uid: currentUser.uid,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, "products"), productData);
        
        btnText.textContent = "সফলভাবে সম্পন্ন হয়েছে!";
        showToast("প্রোডাক্ট সফলভাবে আপলোড হয়েছে!");

        // 12. Success Popup & Secret JSON Copy Feature
        showSuccessPopup(productName, docRef.id, { id: docRef.id, ...productData });

    } catch (error) {
        console.error("Upload Error:", error);
        showCustomModal(
            `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
            "আপলোড ব্যর্থ হয়েছে",
            error.message || "একটি অজানা ত্রুটি ঘটেছে। আবার চেষ্টা করুন।",
            "ঠিক আছে",
            () => {}
        );
    } finally {
        submitBtn.disabled = false;
        btnSpinner.style.display = "none";
        btnText.textContent = "প্রোডাক্ট আপলোড করুন";
    }
});

// Success Popup Renderer with Owner Double Tap Secret Feature
function showSuccessPopup(productName, productId, fullProductData) {
    modalContent.innerHTML = `
        <div class="modal-icon success">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="modal-title" id="successPopupTitle">অভিনন্দন! আপনার প্রোডাক্ট সফলভাবে আপলোড হয়েছে।</div>
        <div class="modal-message">
            <strong>প্রোডাক্ট:</strong> ${productName}<br>
            <span style="font-size: 13px; color: var(--text-muted);">ID: ${productId}</span>
        </div>
        <div style="display: flex; gap: 10px; flex-direction: column;">
            <button id="newUploadBtn" class="modal-btn">নতুন প্রোডাক্ট আপলোড করুন</button>
            <button id="dashboardRedirectBtn" class="modal-btn" style="background: #2D3748;">ড্যাশবোর্ডে ফিরে যান</button>
        </div>
    `;
    customModal.style.display = "flex";

    document.getElementById("newUploadBtn").onclick = () => {
        window.location.reload();
    };
    document.getElementById("dashboardRedirectBtn").onclick = () => {
        window.location.href = "https://paikarisell.ghotimarket.com/dashboard";
    };

    // Secret Double Tap Feature for Owners
    const titleEl = document.getElementById("successPopupTitle");
    let lastTap = 0;

    titleEl.addEventListener("click", (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 400 && tapLength > 0) {
            // Double Tap Detected
            const isOwner = OWNER_EMAILS.includes(currentUser.email);
            if (isOwner) {
                const jsonString = JSON.stringify(fullProductData, null, 2);
                navigator.clipboard.writeText(jsonString).then(() => {
                    showToast("Owner Secret: Product JSON Copied!");
                }).catch(err => {
                    console.error("Clipboard Error:", err);
                });
            }
        }
        lastTap = currentTime;
    });
}
