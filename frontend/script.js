const BASE_URL = window.location.origin;

let socket;
let token = localStorage.getItem("token");
let userId = localStorage.getItem("userId");
let selectedUserId = null;
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
      addMessage(msg);
    }

    // receiver confirms delivery
    if (msg.receiver === userId) {
      socket.emit("messageDelivered", msg._id);
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
    li.onclick = () => selectUser(u._id);
    usersList.appendChild(li);
  });
}

/* LOAD CHAT HISTORY */
async function selectUser(id) {
  selectedUserId = id;
  messages.innerHTML = "";
  document.getElementById("chatName").innerText =
  users.find(u => u._id === id)?.name || "Chat";

  const res = await fetch(`${BASE_URL}/messages/${id}`, {
    headers: { Authorization: "Bearer " + token },
  });

  const msgs = await res.json();

  msgs.forEach((m) => {
    addMessage(m);

    if (m.receiver === userId && m.status !== "seen") {
      socket.emit("messageSeen", m._id);
    }
  });
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
function addMessage(msg) {
  const li = document.createElement("li");
  li.className = `message ${msg.sender === userId ? "sent" : "received"}`;

  const text = document.createElement("div");
  text.innerText = msg.content;

  const meta = document.createElement("div");
  meta.style.fontSize = "11px";
  meta.style.opacity = "0.7";
  meta.style.marginTop = "4px";
  meta.style.display = "flex";
  meta.style.justifyContent = "flex-end";
  meta.style.gap = "6px";

  const time = document.createElement("span");
  time.innerText = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  meta.appendChild(time);

  if (msg.sender === userId) {
    const tick = document.createElement("span");
    tick.id = `tick-${msg._id}`;
    tick.innerText = msg.status === "sent" ? "✔" : "✔✔";
    tick.style.color = msg.status === "seen" ? "#4fc3f7" : "#ccc";
    meta.appendChild(tick);
  }

  li.appendChild(text);
  li.appendChild(meta);
  messages.appendChild(li);
  li.scrollIntoView();
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
  document.getElementById("chatBox").style.display = "none";
  document.getElementById("loginBox").style.display = "block";
}
