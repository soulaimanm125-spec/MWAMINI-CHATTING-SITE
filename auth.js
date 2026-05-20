import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInAnonymously,
    sendEmailVerification,
    GoogleAuthProvider,
    signInWithPopup,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    onAuthStateChanged 
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

// DOM Target Layout Elements 
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authTitle = document.getElementById("auth-title");
const submitBtn = document.getElementById("submit-btn");
const toggleLink = document.getElementById("toggle-link");

const phoneModal = document.getElementById("phone-modal");
const phoneStepA = document.getElementById("phone-step-a");
const phoneStepB = document.getElementById("phone-step-b");

let isLoginMode = true;
let confirmationResultRef = null;

// --- 1. TOGGLE EMAIL REGISTER VS LOGIN SYSTEM ---
toggleLink.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? "Secure Login" : "Register Secure Account";
    submitBtn.innerText = isLoginMode ? "Sign In with Email" : "Register & Send Verification Link";
    document.getElementById("toggle-auth").innerHTML = isLoginMode ? 
        `Don't have an account? <span id="toggle-link" style="color:#00a884; font-weight:bold; cursor:pointer;">Register here</span>` : 
        `Already have an account? <span id="toggle-link" style="color:#00a884; font-weight:bold; cursor:pointer;">Login here</span>`;
});

// --- 2. EMAIL & PASSWORD CREDENTIAL CONTROLLER WITH STRICT VERIFICATION ---
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if (isLoginMode) {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                alert("🔴 Access Denied: Your email address is not verified yet. Please click the link sent to your inbox!");
                await signOut(auth);
                return;
            }
            await registerUserInFirestore(user, "registered");
            window.location.href = "dashboard.html";
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(userCredential.user);
            alert("🟢 Verification Link Dispatched! Please open your email app, confirm your account, then return to sign in.");
            window.location.reload();
        }
    } catch (error) {
        alert("Authentication Error: " + error.message);
    }
});

// --- 3. GOOGLE POPUP LOGIN CONTROLLER ---
document.getElementById("google-login-btn").addEventListener("click", async () => {
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        await registerUserInFirestore(result.user, "registered");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Google Authentication Interrupted: " + error.message);
    }
});

// --- 4. GUEST / ANONYMOUS SYSTEM ---
document.getElementById("guest-login-btn").addEventListener("click", async () => {
    try {
        const userCredential = await signInAnonymously(auth);
        await registerUserInFirestore(userCredential.user, "guest");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Guest access mode failed: " + error.message);
    }
});

// --- 5. SECURED PHONE VERIFICATION OTP SYSTEM ---
document.getElementById("phone-setup-btn").addEventListener("click", () => {
    phoneModal.classList.remove("hidden");
    initializeRecaptcha();
});
document.getElementById("close-phone-modal-btn").addEventListener("click", () => phoneModal.classList.add("hidden"));

function initializeRecaptcha() {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible'
        });
    }
}

document.getElementById("send-otp-btn").addEventListener("click", async () => {
    const phoneNumber = document.getElementById("phone-number-input").value.trim();
    if (!phoneNumber) return alert("Please type your phone number including country code (e.g. +250...)");

    try {
        const appVerifier = window.recaptchaVerifier;
        confirmationResultRef = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        phoneStepA.classList.add("hidden");
        phoneStepB.classList.remove("hidden");
        alert("OTP SMS Token Dispatched! Check your device.");
    } catch (error) {
        alert("SMS transmission blocked: " + error.message);
        window.recaptchaVerifier.clear();
    }
});

document.getElementById("verify-otp-btn").addEventListener("click", async () => {
    const code = document.getElementById("otp-code-input").value.trim();
    if (!code) return alert("Type verification code digits.");

    try {
        const result = await confirmationResultRef.confirm(code);
        await registerUserInFirestore(result.user, "registered");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Incorrect token sequence access denied: " + error.message);
    }
});

// --- 6. GLOBAL BASE PROFILE WRITER ---
async function registerUserInFirestore(user, role) {
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || user.phoneNumber || "Guest_Online_User",
        role: role,
        status: "online",
        lastActive: serverTimestamp()
    }, { merge: true });
}

// Keep logged-in user on the dashboard if session is valid
onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified && window.location.pathname.endsWith("index.html")) {
        window.location.href = "dashboard.html";
    }
});
