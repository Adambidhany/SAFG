import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, Users, Play, LogIn, Loader2, CheckCircle2, XCircle, Cpu, Award } from "lucide-react";
import { generateQuizQuestions, Question } from "./services/gemini";
import { cn } from "./lib/utils";

interface User {
  id: number;
  username: string;
  points: number;
}

interface LeaderboardEntry {
  username: string;
  points: number;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [view, setView] = useState<"login" | "home" | "queue" | "game" | "result">("login");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [gameResult, setGameResult] = useState<{ winner: string; yourScore: number; opponentScore: number } | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetchLeaderboard();
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      setUser(data);
      setView("home");
      initSocket(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const initSocket = (userData: User) => {
    socketRef.current = io();
    
    socketRef.current.on("match_found", async ({ gameId, opponent, isHost }) => {
      setGameId(gameId);
      setOpponent(opponent);
      if (isHost) {
        const q = await generateQuizQuestions();
        socketRef.current?.emit("set_questions", { gameId, questions: q });
      }
    });

    socketRef.current.on("game_start", ({ questions }) => {
      setQuestions(questions);
      setScore(0);
      setCurrentQuestionIndex(0);
      setView("game");
      setIsLoading(false);
    });

    socketRef.current.on("game_over", (result) => {
      setGameResult(result);
      setView("result");
      setIsLoading(false);
      fetchLeaderboard();
    });
  };

  const joinQueue = () => {
    if (socketRef.current && user) {
      socketRef.current.emit("join_queue", user);
      setView("queue");
    }
  };

  const handleAnswer = (index: number) => {
    const isCorrect = index === questions[currentQuestionIndex].correctAnswer;
    let newScore = score;
    if (isCorrect) {
      newScore = score + 1;
      setScore(newScore);
    }

    if (currentQuestionIndex + 1 < questions.length) {
      setCurrentQuestionIndex(i => i + 1);
    } else {
      // Finished all questions
      socketRef.current?.emit("submit_score", { gameId, userId: user?.id, score: newScore });
      setIsLoading(true); // Waiting for opponent
    }
  };

  if (view === "login") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-sans" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#151619] border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-4">
              <Cpu className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">تحدي الحاسوب</h1>
            <p className="text-white/50 text-sm">سجل دخولك لبدء التحدي</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/40 mb-2 mr-1">اسم المستخدم</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="أدخل اسمك هنا..."
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              دخول
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (view === "home") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-6 font-sans" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center mb-12">
            <div>
              <h2 className="text-2xl font-bold">أهلاً، {user?.username}</h2>
              <p className="text-white/50">رصيدك: {user?.points} نقطة</p>
            </div>
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <Users className="w-6 h-6 text-white/70" />
            </div>
          </header>

          <div className="grid md:grid-cols-2 gap-8">
            <section>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                <Play className="w-3 h-3" /> ابدأ اللعب
              </h3>
              <button
                onClick={joinQueue}
                className="w-full group relative overflow-hidden bg-emerald-600 hover:bg-emerald-500 p-8 rounded-3xl transition-all text-right"
              >
                <div className="relative z-10">
                  <h4 className="text-2xl font-bold mb-2">بحث عن خصم</h4>
                  <p className="text-white/80">تحدَّ لاعباً عشوائياً في 5 أسئلة تقنية</p>
                </div>
                <div className="absolute -bottom-4 -left-4 opacity-10 group-hover:scale-110 transition-transform">
                  <Trophy size={120} />
                </div>
              </button>
            </section>

            <section>
              <h3 className="text-xs uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                <Award className="w-3 h-3" /> المتصدرون
              </h3>
              <div className="bg-[#151619] border border-white/10 rounded-3xl overflow-hidden">
                {leaderboard.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-4">
                      <span className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                        i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-slate-300 text-black" : i === 2 ? "bg-orange-400 text-black" : "bg-white/10"
                      )}>
                        {i + 1}
                      </span>
                      <span className="font-medium">{entry.username}</span>
                    </div>
                    <span className="text-emerald-500 font-mono">{entry.points}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (view === "queue") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6" dir="rtl">
        <div className="relative mb-8">
          <div className="w-32 h-32 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Users className="w-10 h-10 text-emerald-500" />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">جاري البحث عن خصم...</h2>
        <p className="text-white/50">استعد، التحدي سيبدأ قريباً</p>
        <button 
          onClick={() => setView("home")}
          className="mt-8 text-white/40 hover:text-white transition-colors"
        >
          إلغاء البحث
        </button>
      </div>
    );
  }

  if (view === "game") {
    const currentQ = questions[currentQuestionIndex];
    if (!currentQ) return null;
    
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-6 flex flex-col items-center justify-center" dir="rtl">
        <div className="w-full max-w-2xl">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                <span className="font-mono text-emerald-500">{currentQuestionIndex + 1}/5</span>
              </div>
              <h3 className="font-medium text-white/70">سؤال الحاسوب</h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">الخصم</p>
              <p className="font-bold text-emerald-500">{opponent}</p>
            </div>
          </div>

          <motion.div 
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-[#151619] border border-white/10 rounded-3xl p-8 mb-6 shadow-xl"
          >
            <h2 className="text-2xl font-bold leading-relaxed mb-8">{currentQ.question}</h2>
            <div className="grid gap-4">
              {currentQ.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={isLoading}
                  className="w-full text-right p-5 rounded-2xl bg-black/40 border border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group flex items-center justify-between disabled:opacity-50"
                >
                  <span className="text-lg">{option}</span>
                  <div className="w-6 h-6 rounded-full border border-white/10 group-hover:border-emerald-500/50 transition-colors"></div>
                </button>
              ))}
            </div>
          </motion.div>

          {isLoading && (
            <div className="flex items-center justify-center gap-3 text-white/50">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>بانتظار إنهاء الخصم للأسئلة...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "result") {
    const isWinner = gameResult?.winner === user?.username;
    const isDraw = gameResult?.winner === 'تعادل';

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6" dir="rtl">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-[#151619] border border-white/10 rounded-3xl p-8 text-center shadow-2xl"
        >
          <div className="mb-6 flex justify-center">
            {isWinner ? (
              <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <Trophy className="w-10 h-10 text-yellow-500" />
              </div>
            ) : isDraw ? (
              <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Users className="w-10 h-10 text-blue-500" />
              </div>
            ) : (
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
            )}
          </div>

          <h2 className="text-3xl font-bold mb-2">
            {isWinner ? "مبروك! لقد فزت" : isDraw ? "تعادل رائع!" : "حظاً أوفر المرة القادمة"}
          </h2>
          <p className="text-white/50 mb-8">النتيجة النهائية للتحدي</p>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
              <p className="text-xs text-white/40 uppercase mb-1">أنت</p>
              <p className="text-2xl font-mono font-bold text-emerald-500">{gameResult?.yourScore}</p>
            </div>
            <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
              <p className="text-xs text-white/40 uppercase mb-1">{opponent}</p>
              <p className="text-2xl font-mono font-bold text-white/80">{gameResult?.opponentScore}</p>
            </div>
          </div>

          <button
            onClick={() => setView("home")}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-white/90 transition-all"
          >
            العودة للرئيسية
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}
