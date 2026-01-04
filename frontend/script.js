const BASE_URL = window.location.origin;

let socket;
let token = localStorage.getItem("token");
let userId = localStorage.getItem("userId");
let selectedUserId = null;
const chatCache = {};

/* SCREEN CONTROL */
function showSignup() {
  signupBox.style.display = "block";
  loginBox.style.display = "none";
}

function showLogin() {
  signupBox.style.display = "none";
  loginBox.style.display = "block";
}

function showChat() {
  signupBox.style.display = "none";
  loginBox.style.display = "none";
  chatBox.style.display = "flex";
}

/* AUTO LOGIN */
window.onload = () => {
  token = localStorage.getItem("token");
  userId = localStorage.getItem("userId");

  if (!token || !userId) {
    showLogin();
    return;
  }

  showChat();
  connectSocket();
  loadUsers();
};

/* SIGNUP */
async function signup() {
  const name = signupName.value;
  const email = signupEmail.value;
  const password = signupPassword.value;

  const res = await fetch(`${BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json();
  if (res.ok) {
    alert("Signup successful! Login now.");
    showLogin();
  } else {
    alert(data.message);
  }
}

/* LOGIN */
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!data.token) {
    alert("Login failed");
    return;
  }

  token = data.token;
  localStorage.setItem("token", token);

  const profileRes = await fetch(`${BASE_URL}/profile`, {
    headers: { Authorization: "Bearer " + token },
  });

  const profile = await profileRes.json();
  userId = profile._id;
  localStorage.setItem("userId", userId);

  showChat();
  connectSocket();
  loadUsers();
}

/* SOCKET */
function connectSocket() {
  socket = io(BASE_URL);

  socket.on("receiveMessage", (msg) => {
  if (
    (msg.sender === userId && msg.receiver === selectedUserId) ||
    (msg.sender === selectedUserId && msg.receiver === userId)
  ) {
    addMessage(
      msg.content,
      msg.sender === userId,
      msg.createdAt
    );
  }
});

  socket.on("messageStatusUpdate", ({ messageId, status }) => {
    const tick = document.getElementById(`tick-${messageId}`);
    if (!tick) return;

    tick.innerText =
      status === "seen" ? "✔✔" : "✔✔";

    if (status === "seen") {
      tick.style.color = "#4fc3f7"; // blue tick
    }
  });
}


/* USERS */
async function loadUsers() {
  const res = await fetch(`${BASE_URL}/users`, {
    headers: { Authorization: "Bearer " + token },
  });

  if (!res.ok) {
    alert("Session expired. Please login again.");
    localStorage.clear();
    location.reload();
    return;
  }

  const users = await res.json();
  if (!Array.isArray(users)) return;

  const usersList = document.getElementById("users");
  usersList.innerHTML = "";

  users.forEach((u) => {
    const li = document.createElement("li");
    li.innerText = u.name;
    li.onclick = () => selectUser(u._id, u.name);
    usersList.appendChild(li);
  });
}

/* LOAD CHAT HISTORY */
async function selectUser(id, name) {
  selectedUserId = id;

  // 🔥 SET CHAT TITLE INSTEAD OF HIDING IT
  const title = document.getElementById("chatTitle");
  title.innerText = name;
  title.classList.remove("empty-chat");


  // restore cached chat
  if (chatCache[id]) {
    messages.innerHTML = chatCache[id];
    return;
  }

  messages.innerHTML = "";

  const res = await fetch(`${BASE_URL}/messages/${id}`, {
    headers: { Authorization: "Bearer " + token },
  });

  const msgs = await res.json();
  msgs.forEach((m) =>
    addMessage(m.content, m.sender === userId, m.createdAt)
  );

  chatCache[id] = messages.innerHTML;
}


/* SEND MESSAGE */
let sending = false;

function sendMessage() {
  if (!selectedUserId) return;

  const content = messageInput.value.trim();
  if (!content) return;

  socket.emit("sendMessage", {
    senderId: userId,
    receiverId: selectedUserId,
    content,
  });

  messageInput.value = "";
}

let typingTimeout;

messageInput.addEventListener("input", () => {
  if (!selectedUserId) return;

  socket.emit("typing", { senderId: userId, receiverId: selectedUserId });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping", { senderId: userId, receiverId: selectedUserId });
  }, 800);
});


/* ENTER KEY SEND */
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

/* RENDER MESSAGE */
function addMessage(text, isMine, time) {
  // 🔒 HARD GUARD — stops [object Object] forever
  if (typeof text !== "string") {
    console.error("❌ addMessage received invalid text:", text);
    return;
  }

  const li = document.createElement("li");
  li.classList.add("message", isMine ? "sent" : "received");

  const msgText = document.createElement("div");
  msgText.className = "msg-text";
  msgText.innerText = text;

  const timestamp = document.createElement("span");
  timestamp.className = "time";
  timestamp.innerText = time
    ? new Date(time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  li.appendChild(msgText);
  li.appendChild(timestamp);
  messages.appendChild(li);

  messages.scrollTop = messages.scrollHeight;

  if (selectedUserId) {
    chatCache[selectedUserId] = messages.innerHTML;
  }
}

function formatTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function logout() {
  localStorage.clear();
  selectedUserId = null;

  const title = document.getElementById("chatTitle");
  title.innerText = "Select a chat";
  title.classList.add("empty-chat");

  document.getElementById("chatBox").style.display = "none";
  document.getElementById("loginBox").style.display = "block";
}

