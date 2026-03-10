import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("quiz.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    points INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    player1_id INTEGER,
    player2_id INTEGER,
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Username required" });

    let user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
      const info = db.prepare("INSERT INTO users (username) VALUES (?)").run(username);
      user = { id: info.lastInsertRowid, username, points: 0 };
    }
    res.json(user);
  });

  app.get("/api/leaderboard", (req, res) => {
    const topUsers = db.prepare("SELECT username, points FROM users ORDER BY points DESC LIMIT 10").all();
    res.json(topUsers);
  });

  // Socket.io Logic
  const waitingPlayers: { socketId: string; userId: number; username: string }[] = [];
  const activeGames = new Map<string, any>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_queue", (userData) => {
      console.log("User joined queue:", userData.username);
      
      // Check if already in queue
      if (waitingPlayers.find(p => p.userId === userData.id)) return;

      if (waitingPlayers.length > 0) {
        const opponent = waitingPlayers.shift()!;
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const gameData = {
          id: gameId,
          players: [
            { id: opponent.userId, username: opponent.username, socketId: opponent.socketId, score: 0, finished: false },
            { id: userData.id, username: userData.username, socketId: socket.id, score: 0, finished: false }
          ],
          questions: null,
          status: 'initializing'
        };

        activeGames.set(gameId, gameData);
        
        io.to(opponent.socketId).emit("match_found", { gameId, opponent: userData.username, isHost: true });
        socket.emit("match_found", { gameId, opponent: opponent.username, isHost: false });
      } else {
        waitingPlayers.push({ socketId: socket.id, userId: userData.id, username: userData.username });
      }
    });

    socket.on("set_questions", ({ gameId, questions }) => {
      const game = activeGames.get(gameId);
      if (game) {
        game.questions = questions;
        game.status = 'playing';
        game.players.forEach(p => io.to(p.socketId).emit("game_start", { questions }));
      }
    });

    socket.on("submit_score", ({ gameId, userId, score }) => {
      const game = activeGames.get(gameId);
      if (game) {
        const player = game.players.find(p => p.id === userId);
        if (player) {
          player.score = score;
          player.finished = true;
        }

        if (game.players.every(p => p.finished)) {
          const p1 = game.players[0];
          const p2 = game.players[1];
          
          let winnerId = null;
          if (p1.score > p2.score) winnerId = p1.id;
          else if (p2.score > p1.score) winnerId = p2.id;

          if (winnerId) {
            db.prepare("UPDATE users SET points = points + 10 WHERE id = ?").run(winnerId);
          } else {
            // Draw? Maybe +5 each
            db.prepare("UPDATE users SET points = points + 5 WHERE id = ?").run(p1.id);
            db.prepare("UPDATE users SET points = points + 5 WHERE id = ?").run(p2.id);
          }

          game.players.forEach(p => {
            io.to(p.socketId).emit("game_over", {
              winner: winnerId ? game.players.find(pl => pl.id === winnerId).username : 'تعادل',
              yourScore: p.score,
              opponentScore: game.players.find(pl => pl.id !== p.id).score
            });
          });
          activeGames.delete(gameId);
        }
      }
    });

    socket.on("disconnect", () => {
      const index = waitingPlayers.findIndex(p => p.socketId === socket.id);
      if (index !== -1) waitingPlayers.splice(index, 1);
      
      // Handle mid-game disconnects if needed
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
