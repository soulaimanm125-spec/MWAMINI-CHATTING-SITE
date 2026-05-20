import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  // PASTE_YOUR_FIREBASE_CONFIGURATION_OBJECT_HERE
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let loggedInUser = null;
let activeGroupId = null;
let messagesUnsubscribe = null;

// UI References
const groupsContainer = document.getElementById("groups-container");
const chatAreaFallback = document.getElementById("chat-area-fallback");
const chatAreaActive = document.getElementById("chat-area-active");
const activeGroupTitle = document.getElementById("active-group-title");
const messagesDisplay = document.getElementById("messages-display");
const createGroupForm = document.getElementById("create-group-form");
const sendMsgForm = document.getElementById("send-message-form");
const statusFileInput = document.getElementById("status-file-input");
const statusModal = document.getElementById("status-modal");
const statusGrid = document.getElementById("status-viewer-grid");

// Safeguard routes
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        loggedInUser = user;
        loadChatGroups();
        listenToMwaminiStatuses();
    }
});

// Logout Feature
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// 1. Create Groups
createGroupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-group-name");
    if (!nameInput.value.trim()) return;

    await addDoc(collection(db, "groups"), {
        name: nameInput.value.trim(),
        createdBy: loggedInUser.uid,
        createdAt: serverTimestamp()
    });
    nameInput.value = "";
});

// 2. Fetch and Render Groups List
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
                <div>
                    <h4>${group.name}</h4>
                </div>
                ${group.createdBy === loggedInUser.uid ? `<button class="del-grp-btn" data-id="${id}">Delete</button>` : ''}
            `;
            
            itemRow.addEventListener("click", () => openChatRoom(id, group.name));
            groupsContainer.appendChild(itemRow);
        });

        // Set up event listeners for deletion buttons
        document.querySelectorAll(".del-grp-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const targetId = btn.getAttribute("data-id");
                if (confirm("Delete this chat group permanently?")) {
                    await deleteDoc(doc(db, "groups", targetId));
                    if (activeGroupId === targetId) {
                        chatAreaActive.classList.add("hidden");
                        chatAreaFallback.classList.remove("hidden");
                    }
                }
            });
        });
    });
}

// 3. Open Selected Room & Synchronize Messages
function openChatRoom(groupId, groupName) {
    activeGroupId = groupId;
    chatAreaFallback.classList.add("hidden");
    chatAreaActive.classList.remove("hidden");
    activeGroupTitle.innerText = groupName;

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
                <span class="msg-sender">${isMe ? "You" : msg.senderEmail}</span>
                <p>${msg.text}</p>
                ${msg.fileUrl ? `<a href="${msg.fileUrl}" target="_blank" class="msg-file">📁 View Attachment</a>` : ''}
            `;
            messagesDisplay.appendChild(card);
        });
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    });
}

// 4. Send Message with Optional Attachments
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
        senderId: loggedInUser.uid,
        senderEmail: loggedInUser.email,
        text: textInput.value,
        fileUrl: downloadUrl,
        timestamp: serverTimestamp()
    });

    textInput.value = "";
    fileInput.value = "";
});

// 5. Post Status Active for 48 Hours
statusFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileRef = ref(storage, `statuses/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    const mediaUrl = await getDownloadURL(fileRef);

    const now = new Date();
    const expireTime = new Date();
    expireTime.setHours(now.getHours() + 48); // Adding 48 hours to the timestamp

    await addDoc(collection(db, "statuses"), {
        uploaderEmail: loggedInUser.email,
        mediaUrl: mediaUrl,
        createdAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expireTime)
    });

    alert("MWAMINI Status uploaded for 48 hours successfully.");
    statusFileInput.value = "";
});

// 6. Monitor Active Status Profiles & Apply 48hr Filtering
function listenToMwaminiStatuses() {
    const q = query(collection(db, "statuses"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        statusGrid.innerHTML = "";
        const currentTime = new Date().getTime();

        snapshot.docs.forEach(docSnap => {
            const status = docSnap.data();
            if (status.expiresAt && status.expiresAt.toDate().getTime() > currentTime) {
                const card = document.createElement("div");
                card.className = "status-card";
                card.innerHTML = `
                    <p>${status.uploaderEmail.split('@')[0]}</p>
                    <img src="${status.mediaUrl}" alt="Status">
                `;
                statusGrid.appendChild(card);
            }
        });
    });
}

// Modal Windows Actions
document.getElementById("view-status-btn").addEventListener("click", () => statusModal.classList.remove("hidden"));
document.getElementById("close-modal-btn").addEventListener("click", () => statusModal.classList.add("hidden"));
