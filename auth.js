import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInAnonymously,
    sendEmailVerification,
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

const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authTitle = document.getElementById("auth-title");
const submitBtn = document.getElementById("submit-btn");
const toggleLink = document.getElementById("toggle-link");

let isLoginMode = true;

// Inject options box dynamically for Guest/Anonymous entries
const authBox = document.getElementById("auth-box");
const guestDivider = document.createElement("div");
guestDivider.innerHTML = `
    <div style="margin: 15px 0; color: #aaa; font-size: 12px;">OR</div>
    <button type="button" id="guest-login-btn" style="width: 100%; padding: 12px; background: #6b7280; color: white; border: none; font-weight: bold; border-radius: 4px; cursor: pointer;">Enter as Guest User</button>
`;
authBox.appendChild(guestDivider);

// Toggle Login / Register UI state
toggleLink.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? "Login" : "Register Secure Account";
    submitBtn.innerText = isLoginMode ? "Login" : "Register & Send Verification Link";
});

// Primary Email Authentication Action Pipeline
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if (isLoginMode) {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                alert("🔴 Access Blocked: Your email address is not verified yet. Check your inbox for the verification link!");
                return;
            }
            await registerUserInFirestore(user, "registered");
            window.location.href = "dashboard.html";
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(userCredential.user);
            alert("🟢 Security Verification Sent! Please check your email inbox and click the verification link before logging in.");
            isLoginMode = true;
            authTitle.innerText = "Login";
            submitBtn.innerText = "Login";
        }
    } catch (error) {
        alert("Secure Auth Failure: " + error.message);
    }
});

// Secure Guest Sign In Action
document.getElementById("guest-login-btn").addEventListener("click", async () => {
    try {
        const userCredential = await signInAnonymously(auth);
        await registerUserInFirestore(userCredential.user, "guest");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Guest entry system locked: " + error.message);
    }
});

// Base Profile Document Setup
async_function registerUserInFirestore(user, role) {
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email || "Guest_Online_User",
        role: role,
        status: "online",
        lastActive: serverTimestamp()
    }, { merge: true });
}
