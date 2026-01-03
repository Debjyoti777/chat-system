require("dotenv").config();
console.log("JWT_SECRET =", process.env.JWT_SECRET);

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("./models/User");
const Message = require("./models/Message");
const authMiddleware = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

// ================= MONGODB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.send("Server + MongoDB working 🚀");
});

// ===== SIGNUP =====
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
    });

    await user.save();
    res.status(201).json({ message: "User created successfully 🎉" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "All fields are required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful 🎉", token });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ===== PROFILE =====
app.get("/profile", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId).select("-password");
  res.json(user);
});

// ===== USERS =====
app.get("/users", authMiddleware, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.userId } })
    .select("_id name email");

  res.json(users);
});

// ===== SEND MESSAGE (API) =====
app.post("/message", authMiddleware, async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content || !content.trim())
      return res.status(400).json({ message: "Invalid message" });

    const message = new Message({
      sender: req.userId,
      receiver: receiverId,
      content,
    });

    await message.save();
    res.status(201).json({ message: "Message sent 💬" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ===== GET MESSAGES =====
app.get("/messages/:userId", authMiddleware, async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: req.userId, receiver: otherUserId },
        { sender: otherUserId, receiver: req.userId },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= SOCKET.IO =================
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

server.listen(PORT, () => {
  console.log("Server running on port 3000 with Socket.IO 🚀");
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("sendMessage", async ({ senderId, receiverId, content }) => {
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content,
      status: "sent",
    });

    io.emit("receiveMessage", message);
  });

  socket.on("messageDelivered", async (messageId) => {
    await Message.findByIdAndUpdate(messageId, { status: "delivered" });
    io.emit("messageStatusUpdate", {
      messageId,
      status: "delivered",
    });
  });

  socket.on("messageSeen", async (messageId) => {
    await Message.findByIdAndUpdate(messageId, { status: "seen" });
    io.emit("messageStatusUpdate", {
      messageId,
      status: "seen",
    });
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
  });
});

