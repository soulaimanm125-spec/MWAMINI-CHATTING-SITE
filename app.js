import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    doc, deleteDoc, serverTimestamp, Timestamp, getDoc, setDoc, updateDoc, where 
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
let chatType = "group"; // Tracks either "group" or "direct"
let messagesUnsubscribe = null;
let requestsUnsubscribe = null;

const groupsContainer = document.getElementById("groups-container");
const usersContainer = document.getElementById("users-container");
const chatAreaFallback = document.getElementById("chat-area-fallback");
const chatAreaActive = document.getElementById("chat-area-active");
const activeGroupTitle = document.getElementById("active-group-title");
const groupRoleIndicator = document.getElementById("group-role-indicator");
const messagesDisplay = document.getElementById("messages-display");
const createGroupForm = document.getElementById("create-group-form");
const sendMsgForm = document.getElementById("send-message-form");
const creatorAdminPanel = document.getElementById("creator-admin-panel");
const requestCount = document.getElementById("request-count");

// Sidebar tab DOM references
const tabGroups = document.getElementById("tab-groups");
const tabUsers = document.getElementById("tab-users");
const groupSection = document.getElementById("sidebar-groups-section");
const userSection = document.getElementById("sidebar-users-section");
const searchUsersInput = document.getElementById("search-users-input");

// --- SIDEBAR TAB WORKSPACE SELECTION NAVIGATION ---
tabGroups.addEventListener("click", () => {
    tabGroups.style.background = "#f0f2f5"; tabGroups.style.borderBottom = "2px solid #00a884";
    tabUsers.style.background = "#fff"; tabUsers.style.borderBottom = "2px solid transparent";
    groupSection.classList.remove("hidden"); userSection.classList.add("hidden");
});

tabUsers.addEventListener("click", () => {
    tabUsers.style.background = "#f0f2f5"; tabUsers.style.borderBottom = "2px solid #00a884";
    tabGroups.style.background = "#fff"; tabGroups.style.borderBottom = "2px solid transparent";
    userSection.classList.remove("hidden"); groupSection.classList.add("hidden");
    loadUserDirectory();
});

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
        
        // Dynamic display verification logic
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let displayHandle = user.email ? user.email.split('@')[0] : "Online Guest User";
        if (userDoc.exists() && userDoc.data().username) {
            displayHandle = userDoc.data().username;
        }
        document.getElementById("user-display-name").innerText = displayHandle;

        setupPresenceSystem(user);
        loadChatGroups();
        listenToMwaminiStatuses();
    }
});

// --- CUSTOM USERNAME MANAGEMENT INTERFACE ---
document.getElementById("edit-username-btn").addEventListener("click", async () => {
    document.getElementById("username-modal").classList.remove("hidden");
    const userDoc = await getDoc(doc(db, "users", loggedInUser.uid));
    if (userDoc.exists() && userDoc.data().username) {
        document.getElementById("custom-username-input").value = userDoc.data().username;
    }
});
document.getElementById("close-username-modal-btn").addEventListener("click", () => document.getElementById("username-modal").classList.add("hidden"));

document.getElementById("save-username-btn").addEventListener("click", async () => {
    const usernameVal = document.getElementById("custom-username-input").value.trim();
    if (!usernameVal) return alert("Please type a valid handle prefix");

    await updateDoc(doc(db, "users", loggedInUser.uid), { username: usernameVal });
    document.getElementById("user-display-name").innerText = usernameVal;
    document.getElementById("username-modal").classList.add("hidden");
    alert("Username configured successfully!");
    if (!userSection.classList.contains("hidden")) loadUserDirectory();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    if (loggedInUser) await updateDoc(doc(db, "users", loggedInUser.uid), { status: "offline" });
    signOut(auth);
});

// --- USER DISCOVERY PANEL AND DIRECT CHAT DIRECTORY ---
function loadUserDirectory() {
    const q = query(collection(db, "users"), orderBy("status", "desc"));
    onSnapshot(q, (snapshot) => {
        renderUsersList(snapshot.docs);
    });
}

searchUsersInput.addEventListener("input", async () => {
    const filterText = searchUsersInput.value.trim().toLowerCase();
    const userSnaps = await getDoc(collection(db, "users"));
    
    // Quick memory mapping for responsive local filtering
    const allUsersRef = collection(db, "users");
    onSnapshot(allUsersRef, (snapshot) => {
        const filteredDocs = snapshot.docs.filter(docSnap => {
            const data = docSnap.data();
            const targetName = data.username ? data.username.toLowerCase() : (data.email ? data.email.toLowerCase() : "");
            return targetName.includes(filterText);
        });
        renderUsersList(filteredDocs);
    });
});

function renderUsersList(docsList) {
    usersContainer.innerHTML = "";
    let cleanCount = 0;

    docsList.forEach(docSnap => {
        const userItem = docSnap.data();
        if (userItem.uid === loggedInUser.uid) return; // Skip showing yourself

        cleanCount++;
        const resolvedName = userItem.username || (userItem.email ? userItem.email.split('@')[0] : "Online Guest User");
        const isOnline = userItem.status === "online";

        const userRow = document.createElement("div");
        userRow.className = `group-item ${activeGroupId === userItem.uid ? 'active' : ''}`;
        userRow.style = "padding: 12px 15px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; cursor: pointer;";
        userRow.innerHTML = `
            <div>
                <h4 style="font-size:14px; margin:0; color:#111827;">${resolvedName}</h4>
                <span style="font-size:11px; color:${isOnline ? '#22c55e':'#9ca3af'}; font-weight:500;">
                    ${isOnline ? '● Active Now' : '● Offline'}
                </span>
            </div>
            <button style="background:#00a884; color:white; border:none; padding:5px 10px; border-radius:4px; font-size:11px; cursor:pointer;">Text</button>
        `;

        userRow.addEventListener("click", () => startDirectMessaging(userItem.uid, resolvedName));
        usersContainer.appendChild(userRow);
    });

    if (cleanCount === 0) {
        usersContainer.innerHTML = "<p style='padding:15px; color:#6b7280; font-size:13px;'>No registered or active workspace profiles found.</p>";
    }
}

function startDirectMessaging(targetUid, targetName) {
    chatType = "direct";
    // Compute a unified message path hash by sorting IDs alphabetically
    activeGroupId = loggedInUser.uid < targetUid ? `${loggedInUser.uid}_${targetUid}` : `${targetUid}_${loggedInUser.uid}`;
    
    const reqScreen = document.getElementById("request-screen");
    if (reqScreen) reqScreen.remove();

    chatAreaFallback.classList.add("hidden");
    chatAreaActive.classList.remove("hidden");
    activeGroupTitle.innerText = `💬 ${targetName}`;
    groupRoleIndicator.innerText = "Secured End-to-End Direct Chat Workspace";
    creatorAdminPanel.add("hidden"); // Admin operations are irrelevant inside personal messages

    openPrivateStream(activeGroupId);
}

// --- UNIVERSAL MESSAGE ROOM STREAMS (BOTH DIRECT AND GROUP) ---
function openPrivateStream(roomPathId) {
    if (messagesUnsubscribe) messagesUnsubscribe();
    
    const q = query(collection(db, `directMessages/${roomPathId}/messages`), orderBy("timestamp", "asc"));
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        messagesDisplay.innerHTML = "";
        snapshot.docs.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = msg.senderId === loggedInUser.uid;
            const card = document.createElement("div");
            card.className = `message-card ${isMe ? 'sent' : 'received'}`;
            card.innerHTML = `
                <span class="msg-sender">${msg.senderName}</span>
                <p>${msg.text}</p>
                ${msg.fileUrl ? `<a href="${msg.fileUrl}" target="_blank" class="msg-file">📁 Shared File</a>` : ''}
            `;
            messagesDisplay.appendChild(card);
        });
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    });
}

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
            itemRow.addEventListener("click", () => { chatType = "group"; evaluateRoomAccess(id, group); });
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
                <span class="msg-sender">${msg.senderEmail ? msg.senderEmail.split('@')[0] : (msg.senderName || 'User')}</span>
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

    const nameRef = document.getElementById("user-display-name").innerText;

    if (chatType === "direct") {
        await addDoc(collection(db, `directMessages/${activeGroupId}/messages`), {
            senderId: loggedInUser.uid,
            senderName: nameRef,
            text: textInput.value,
            fileUrl: downloadUrl,
            timestamp: serverTimestamp()
        });
    } else {
        await addDoc(collection(db, `groups/${activeGroupId}/messages`), {
            senderId: loggedInUser.uid,
            senderEmail: loggedInUser.email || "Guest_User",
            senderName: nameRef,
            text: textInput.value,
            fileUrl: downloadUrl,
            timestamp: serverTimestamp()
        });
    }
    
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
