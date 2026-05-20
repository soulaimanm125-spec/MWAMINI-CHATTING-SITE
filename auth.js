import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";

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

const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authTitle = document.getElementById("auth-title");
const submitBtn = document.getElementById("submit-btn");
const toggleLink = document.getElementById("toggle-link");

let isLoginMode = true;

// Toggle state between user Registration and Logging In
toggleLink.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    authTitle.innerText = isLoginMode ? "Login" : "Register";
    submitBtn.innerText = isLoginMode ? "Login" : "Register";
    document.getElementById("toggle-auth").innerHTML = isLoginMode ? 
        `Don't have an account? <span id="toggle-link" style="color:#00a884; font-weight:bold; cursor:pointer;">Register here</span>` : 
        `Already have an account? <span id="toggle-link" style="color:#00a884; font-weight:bold; cursor:pointer;">Login here</span>`;
});

// Form Submission Actions
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = "dashboard.html";
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
            alert("Registration successful! Proceeding to Dashboard.");
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        alert("Authentication Error: " + error.message);
    }
});

// Check if a user is already signed in
onAuthStateChanged(auth, (user) => {
    if (user && window.location.pathname.endsWith("index.html")) {
        window.location.href = "dashboard.html";
    }
});
