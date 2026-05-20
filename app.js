import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    doc, deleteDoc, serverTimestamp, Timestamp, getDoc, setDoc, updateDoc 
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// TODO: Replace with your actual Firebase project credentials configuration
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
const storage = getStorage(app);

let loggedInUser = null;
let activeGroupId = null;
let activeGroupData = null;
let messagesUnsubscribe = null;
let requestsUnsubscribe = null;

const groupsContainer = document.getElementById("groups-container");
const chatAreaFallback = document.getElementById("chat-area-fallback");
const chatAreaActive = document.getElementById("chat-area-active");
const activeGroupTitle = document.getElementById("active-group-title");
const groupRoleIndicator = document.getElementById("group-role-indicator");
const messagesDisplay = document.getElementById("messages-display");
const createGroupForm = document.getElementById("create-group-form");
const sendMsgForm = document.getElementById("send-message-form");
const creatorAdminPanel = document.getElementById("creator-admin-panel");
const requestCount = document.getElementById("request-count");

function setupPresenceSystem(user) {
    const userDocRef = doc(db, "users", user.uid);
    updateDoc(userDocRef, { status: "online", lastActive: serverTimestamp() });
    document.getElementById("presence-badge").className = "badge online";

    setInterval(() => { if (auth.currentUser) updateDoc(userDocRef, { lastActive: serverTimestamp() }); }, 60000);
    window.addEventListener("beforeunload", () => updateDoc(userDocRef, { status: "offline" }));
}

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; } 
    else {
        loggedInUser = user;
        document.getElementById("user-display-name").innerText = user.email ? user.email.split('@')[0] : "🟢 Online Guest User";
        setupPresenceSystem(user);
        loadChatGroups();
        listenToMwaminiStatuses();
    }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    if (loggedInUser) await updateDoc(doc(db, "users", loggedInUser.uid), { status: "offline" });
    signOut(auth);
});

createGroupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-group-name");
    if (!nameInput.value.trim()) return;

    const groupDocRef = await addDoc(collection(db, "groups"), {
        name: nameInput.value.trim(),
        createdBy: loggedInUser.uid,
        creatorEmail: loggedInUser.email || "Guest_Creator",
        createdAt: serverTimestamp()
    });

    await setDoc(doc(db, `groups/${groupDocRef.id}/approvedMembers`, loggedInUser.uid), {
        uid: loggedInUser.uid,
        email: loggedInUser.email || "Guest_Creator",
        approvedAt: serverTimestamp()
    });
    nameInput.value = "";
});

function loadChatGroups() {
    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        groupsContainer.innerHTML = "";
        snapshot.docs.forEach(docSnap => {
            const group = docSnap.data();
            const id = docSnap.id;
            const itemRow = document.createElement("div");
            itemRow.className = `group-item ${activeGroupId === id ? 'active' : ''}`;
            itemRow.innerHTML = `
                <div><h4>${group.name}</h4><span style="font-size:10px; color:#888;">Owner: ${group.creatorEmail.split('@')[0]}</span></div>
                ${group.createdBy === loggedInUser.uid ? `<button class="del-grp-btn" data-id="${id}">Delete</button>` : ''}
            `;
            itemRow.addEventListener("click", () => evaluateRoomAccess(id, group));
            groupsContainer.appendChild(itemRow);
        });

        document.querySelectorAll(".del-grp-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const targetId = btn.getAttribute("data-id");
                if (confirm("Delete group permanently?")) {
                    await deleteDoc(doc(db, "groups", targetId));
                    if (activeGroupId === targetId) { chatAreaActive.classList.add("hidden"); chatAreaFallback.classList.remove("hidden"); }
                }
            });
        });
    });
}

async function evaluateRoomAccess(groupId, groupData) {
    activeGroupId = groupId;
    activeGroupData = groupData;
    const memberSnap = await getDoc(doc(db, `groups/${groupId}/approvedMembers`, loggedInUser.uid));
    if (memberSnap.exists() || groupData.createdBy === loggedInUser.uid) { openChatRoom(groupId, groupData.name); } 
    else { renderJoinRequestScreen(groupId, groupData); }
}

function renderJoinRequestScreen(groupId, groupData) {
    chatAreaFallback.classList.add("hidden"); chatAreaActive.classList.add("hidden");
    const oldScreen = document.getElementById("request-screen");
    if (oldScreen) oldScreen.remove();

    const reqScreen = document.createElement("div");
    reqScreen.id = "request-screen"; reqScreen.className = "chat-area";
    reqScreen.innerHTML = `
        <div class="no-chat-message">
            <h2>🔒 ${groupData.name} is Locked</h2>
            <p style="margin-bottom:15px;">Send a request to join this group.</p>
            <button id="submit-join-req-btn" style="background:#4f46e5; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:bold;">Send Join Request</button>
        </div>
    `;
    document.querySelector(".app-container").appendChild(reqScreen);
    document.getElementById("submit-join-req-btn").addEventListener("click", async () => {
        await setDoc(doc(db, `groups/${groupId}/joinRequests`, loggedInUser.uid), {
            uid: loggedInUser.uid, email: loggedInUser.email || "Guest_User", requestedAt: serverTimestamp()
        });
        alert("Request transmitted! Wait for owner approval.");
    });
}

function openChatRoom(groupId, groupName) {
    const reqScreen = document.getElementById("request-screen");
    if (reqScreen) reqScreen.remove();
    chatAreaFallback.classList.add("hidden"); chatAreaActive.classList.remove("hidden");
    activeGroupTitle.innerText = groupName;

    const isCreator = activeGroupData.createdBy === loggedInUser.uid;
    groupRoleIndicator.innerText = isCreator ? "👑 Group Creator (Admin Access)" : "🔒 Verified Chat Member";

    if (isCreator) { creatorAdminPanel.classList.remove("hidden"); listenToJoinRequests(groupId); } 
    else { creatorAdminPanel.classList.add("hidden"); }

    if (messagesUnsubscribe) messagesUnsubscribe();
    const q = query(collection(db, `groups/${groupId}/messages`), orderBy("timestamp", "asc"));
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        messagesDisplay.innerHTML = "";
        snapshot.docs.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = msg.senderId === loggedInUser.uid;
            const card = document.createElement("div");
            card.className = `message-card ${isMe ? 'sent' : 'received'}`;
            card.innerHTML = `
                <span class="msg-sender">${msg.senderEmail.split('@')[0]}</span>
                <p>${msg.text}</p>
                ${msg.fileUrl ? `<a href="${msg.fileUrl}" target="_blank" class="msg-file">📁 Shared File</a>` : ''}
            `;
            messagesDisplay.appendChild(card);
        });
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    });
}

function listenToJoinRequests(groupId) {
    if (requestsUnsubscribe) requestsUnsubscribe();
    const reqRef = collection(db, `groups/${groupId}/joinRequests`);
    requestsUnsubscribe = onSnapshot(reqRef, (snapshot) => {
        requestCount.innerText = snapshot.size;
        const listContainer = document.getElementById("requests-list-container");
        listContainer.innerHTML = snapshot.empty ? "<p>No pending access forms.</p>" : "";

        snapshot.docs.forEach(docSnap => {
            const reqData = docSnap.data();
            const row = document.createElement("div");
            row.style = "display:flex; justify-content:space-between; padding:10px; background:#f3f4f6; margin-bottom:5px;";
            row.innerHTML = `<span>${reqData.email}</span><div><button class="approve-btn" data-uid="${reqData.uid}" data-email="${reqData.email}" style="background:#00a884; color:white; border:none; padding:4px;">Approve</button></div>`;
            listContainer.appendChild(row);
        });

        document.querySelectorAll(".approve-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const tuid = btn.getAttribute("data-uid");
                const temail = btn.getAttribute("data-email");
                await setDoc(doc(db, `groups/${groupId}/approvedMembers`, tuid), { uid: tuid, email: temail, approvedAt: serverTimestamp() });
                await deleteDoc(doc(db, `groups/${groupId}/joinRequests`, tuid));
                alert("Approved!");
            });
        });
    });
}

sendMsgForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textInput = document.getElementById("message-text-input");
    const fileInput = document.getElementById("message-file-input");
    if (!textInput.value.trim() && !fileInput.files[0]) return;

    let downloadUrl = null;
    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileRef = ref(storage, `chats/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        downloadUrl = await getDownloadURL(fileRef);
    }

    await addDoc(collection(db, `groups/${activeGroupId}/messages`), {
        senderId: loggedInUser.uid, senderEmail: loggedInUser.email || "Guest_User", text: textInput.value, fileUrl: downloadUrl, timestamp: serverTimestamp()
    });
    textInput.value = ""; fileInput.value = "";
});

document.getElementById("submit-text-status-btn").addEventListener("click", async () => {
    const txtArea = document.getElementById("status-text-content");
    if (!txtArea.value.trim()) return;

    const now = new Date(); const expireTime = new Date(); expireTime.setHours(now.getHours() + 48);
    await addDoc(collection(db, "statuses"), {
        uploaderEmail: loggedInUser.email || "Guest_User", statusText: txtArea.value.trim(), createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromDate(expireTime)
    });
    alert("MWAMINI Status posted for 48 hours!");
    txtArea.value = ""; document.getElementById("status-creator-modal").classList.add("hidden");
});

function listenToMwaminiStatuses() {
    const q = query(collection(db, "statuses"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const grid = document.getElementById("status-viewer-grid"); grid.innerHTML = "";
        const currentTime = new Date().getTime();
        snapshot.docs.forEach(docSnap => {
            const status = docSnap.data();
            if (status.expiresAt && status.expiresAt.toDate().getTime() > currentTime) {
                const card = document.createElement("div"); card.className = "status-card";
                card.style = "background:#333; padding:15px; border-radius:6px; min-width:180px; color:white; margin-right:10px;";
                card.innerHTML = `<p style="color:#4ade80;">@${status.uploaderEmail.split('@')[0]}</p><div style="background:#444; padding:10px; font-style:italic;">"${status.statusText}"</div>`;
                grid.appendChild(card);
            }
        });
    });
}

document.getElementById("view-status-btn").addEventListener("click", () => document.getElementById("status-modal").classList.remove("hidden"));
document.getElementById("close-modal-btn").addEventListener("click", () => document.getElementById("status-modal").classList.add("hidden"));
document.getElementById("open-status-creator-btn").addEventListener("click", () => document.getElementById("status-creator-modal").classList.remove("hidden"));
document.getElementById("close-status-creator-btn").addEventListener("click", () => document.getElementById("status-creator-modal").classList.add("hidden"));
document.getElementById("view-requests-btn").addEventListener("click", () => document.getElementById("requests-modal").classList.remove("hidden"));
document.getElementById("close-requests-modal-btn").addEventListener("click", () => document.getElementById("requests-modal").classList.add("hidden"));
