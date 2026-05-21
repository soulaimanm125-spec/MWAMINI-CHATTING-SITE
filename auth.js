import { initializeApp } from "firebase/app";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signInAnonymously, sendEmailVerification, GoogleAuthProvider, 
    signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged,
    sendPasswordResetEmail
} from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA_ZO0DokMWmXWHYa0GJozOYmsKwJLFX_0",
  authDomain: "mwamini-chat-site.firebaseapp.com",
  projectId: "mwamini-chat-site",
  storageBucket: "mwamini-chat-site.firebasestorage.app",
  messagingSenderId: "403012103548",
  appId: "1:403012103548:web:d86e99a4723dbdc1fd88f9",
  measurementId: "G-M6YZ1H0R3H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authTitle = document.getElementById("auth-title");
const submitBtn = document.getElementById("submit-btn");
const toggleLink = document.getElementById("toggle-link");
const forgotPasswordLink = document.getElementById("forgot-password-link");
const phoneModal = document.getElementById("phone-modal");
const phoneStepA = document.getElementById("phone-step-a");
const phoneStepB = document.getElementById("phone-step-b");

let isLoginMode = true;
let confirmationResultRef = null;

forgotPasswordLink.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
        alert("⚠️ Please enter your email address in the input field first, then click 'Forgot Password?'");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        alert("🟢 Password reset secure token link dispatched! Please check your email inbox or spam folder.");
    } catch (error) {
        alert("Reset Error: " + error.message);
    }
});

toggleLink.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? "Secure Login" : "Register Secure Account";
    submitBtn.innerText = isLoginMode ? "Sign In with Email" : "Register & Send Verification Link";
    forgotPasswordLink.style.display = isLoginMode ? "inline" : "none";
    document.getElementById("toggle-auth").innerHTML = isLoginMode ? 
        `Don't have an account? <span id="toggle-link" style="color:#00a884; font-weight:bold; cursor:pointer;">Register here</span>` : 
        `Already have an account? <span id="toggle-link" style="color:#00a884; font-weight:bold; cursor:pointer;">Login here</span>`;
});

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if (isLoginMode) {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            if (!user.emailVerified) {
                alert("🔴 Access Denied: Check your email inbox and click the verification link first!");
                return;
            }
            await registerUserInFirestore(user, "registered");
            window.location.href = "dashboard.html";
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(userCredential.user);
            alert("🟢 Verification Link Dispatched! Confirm your account via email, then log in here.");
            window.location.reload();
        }
    } catch (error) {
        alert("Authentication Error: " + error.message);
    }
});

document.getElementById("google-login-btn").addEventListener("click", async () => {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        await registerUserInFirestore(result.user, "registered");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Google Error: " + error.message);
    }
});

document.getElementById("guest-login-btn").addEventListener("click", async () => {
    try {
        const userCredential = await signInAnonymously(auth);
        await registerUserInFirestore(userCredential.user, "guest");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Guest access failed: " + error.message);
    }
});

document.getElementById("phone-setup-btn").addEventListener("click", () => {
    phoneModal.classList.remove("hidden");
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { 'size': 'invisible' });
    }
});
document.getElementById("close-phone-modal-btn").addEventListener("click", () => phoneModal.classList.add("hidden"));

document.getElementById("send-otp-btn").addEventListener("click", async () => {
    const phoneNumber = document.getElementById("phone-number-input").value.trim();
    if (!phoneNumber) return alert("Enter country code phone string (e.g. +250...)");
    try {
        confirmationResultRef = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
        phoneStepA.classList.add("hidden");
        phoneStepB.classList.remove("hidden");
        alert("OTP Dispatched!");
    } catch (error) {
        alert("Failed to send OTP: " + error.message);
    }
});

document.getElementById("verify-otp-btn").addEventListener("click", async () => {
    const code = document.getElementById("otp-code-input").value.trim();
    try {
        const result = await confirmationResultRef.confirm(code);
        await registerUserInFirestore(result.user, "registered");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Incorrect Code: " + error.message);
    }
});

async function registerUserInFirestore(user, role) {
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || user.phoneNumber || "Guest_Online_User",
        role: role,
        status: "online",
        lastActive: serverTimestamp()
    }, { merge: true });
}

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified && window.location.pathname.endsWith("index.html")) {
        window.location.href = "dashboard.html";
    }
});

// ========================================================= //
//       --- UPGRADED: SECURE ADMIN PORTAL ACCESS ---        //
// ========================================================= //
const adminLoginBtn = document.getElementById('adminLoginBtn');
if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // ⚠️ REPLACE THESE WITH YOUR EXACT FIREBASE ADMIN ACCOUNT DETAILS
        const adminEmail = "soulaimanmwamini0@gmail.com"; 
        const adminPassword = "123456"; 

        try {
            // Sign in explicitly through Firebase authentication
            const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
            const user = userCredential.user;

            console.log("Admin verified via Gateway! UID:", user.uid);
            
            // Log entry into the unified users document collection
            await registerUserInFirestore(user, "admin");

            // Redirect smoothly into the chat application area
            window.location.href = "dashboard.html";
            
        } catch (error) {
            console.error("Admin Portal Access Denied:", error.message);
            alert("Failed to access Admin Portal: " + error.message);
        }
    });
}
