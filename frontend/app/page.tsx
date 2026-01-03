"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { createClient, User } from "@supabase/supabase-js";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const SUPABASE_URL = "https://zsanzmgxuvenhqjxsmna.supabase.co";
const SUPABASE_KEY = "sb_publishable_m6BndGKy1wYBO07Qeum8cg_sk1h4ACw";

// GANTI localhost dengan Variable dari Vercel
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// --- INTERFACES ---
interface Product {
  id: number;
  name: string;
  stock: number;
}
interface DailyForecast {
  date: string;
  weather: string;
  sales: number;
  advice: string;
}
interface ProductPrediction {
  product_id: number;
  product_name: string;
  location: string;
  weekly_forecast: DailyForecast[];
}
interface SalesHistory {
  date: string;
  quantity_sold: number;
  product_id: number;
  recorded_weather: string;
}
interface AnalyticsSummary {
  revenue: number;
  top_product: string;
  growth: number;
}

export default function Home() {
  // --- STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [predictions, setPredictions] = useState<ProductPrediction[]>([]);
  const [history, setHistory] = useState<SalesHistory[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [locationName, setLocationName] = useState("Mencari Lokasi...");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [retrainLoading, setRetrainLoading] = useState(false);

  const [formData, setFormData] = useState({
    product_id: 0,
    quantity: 0,
    date: new Date().toISOString().split("T")[0],
  });
  const [restockData, setRestockData] = useState({
    product_id: 0,
    quantity: 0,
  });

  // --- HELPER STYLE BARU (SUPAYA PESAN MUNCUL) ---
  const getAdviceStyle = (advice: string) => {
    // Hijau jika Laris/Banyak
    if (
      advice.includes("Laris") ||
      advice.includes("Banyak") ||
      advice.includes("🔥")
    ) {
      return "bg-green-100 text-green-700 border-green-200 ring-1 ring-green-200";
    }
    // Merah jika Sepi/Kurangi
    if (
      advice.includes("Sepi") ||
      advice.includes("Kurangi") ||
      advice.includes("⚠️")
    ) {
      return "bg-red-50 text-red-600 border-red-100 ring-1 ring-red-100";
    }
    // Abu-abu jika Normal
    return "bg-slate-100 text-slate-500 border-slate-200";
  };

  // --- AUTH ---
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setUser(data.session.user);
        initializeDashboard(data.session.user.id);
      }
    };
    checkSession();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (authPass.length < 6) {
      setAuthError("Password minimal 6 karakter.");
      setAuthLoading(false);
      return;
    }
    if (!authEmail.includes("@")) {
      setAuthError("Email tidak valid.");
      setAuthLoading(false);
      return;
    }

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPass,
        });
        if (error) {
          if (error.message.includes("registered") || error.status === 400) {
            setAuthError("Email sudah terdaftar. Silakan login.");
            setIsRegister(false);
          } else throw error;
        } else {
          if (data.user) {
            if (data.user.identities?.length)
              await axios.post(
                API_BASE + "/products/init",
                {},
                { headers: { "X-User-Id": data.user.id } }
              );
            setUser(data.user);
            initializeDashboard(data.user.id);
            alert("🎉 Akun berhasil dibuat!");
          } else setAuthError("Cek email untuk verifikasi.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPass,
        });
        if (error) throw error;
        if (data.user) {
          setUser(data.user);
          initializeDashboard(data.user.id);
        }
      }
    } catch (error: any) {
      let msg = error.message;
      if (msg.includes("Invalid login")) msg = "Email atau password salah.";
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProducts([]);
    setPredictions([]);
  };

  // --- DATA ---
  const initializeDashboard = (userId: string) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          fetchAllData(userId, pos.coords.latitude, pos.coords.longitude),
        () => fetchAllData(userId)
      );
    } else {
      fetchAllData(userId);
    }
  };

  const fetchAllData = async (userId: string, lat?: number, lon?: number) => {
    try {
      setLoading(true);
      const headers = { "X-User-Id": userId };
      const prodRes = await axios.get(API_BASE + "/products", {
        headers,
      });
      setProducts(prodRes.data);
      if (prodRes.data.length === 0) {
        setLoading(false);
        return;
      }

      const preds: ProductPrediction[] = [];
      let loc = "Lokasi Tidak Dikenal";
      await Promise.all(
        prodRes.data.map(async (p: Product) => {
          let url = API_BASE + `/predict/${p.id}`;
          if (lat && lon) url += `?lat=${lat}&lon=${lon}`;
          try {
            const res = await axios.get(url, { headers });
            preds.push({ ...res.data, product_name: p.name });
            if (res.data.location) loc = res.data.location;
          } catch {}
        })
      );
      preds.sort((a, b) => a.product_id - b.product_id);
      setPredictions(preds);
      setLocationName(loc);

      const histRes = await axios.get(API_BASE + "/sales/history", {
        headers,
      });
      setHistory(histRes.data);
      const sumRes = await axios.get(API_BASE + "/analytics/summary", {
        headers,
      });
      setSummary(sumRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS ---
  const handleSubmitSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitLoading(true);
    try {
      await axios.post(
        API_BASE + "/sales",
        {
          ...formData,
          product_id: Number(formData.product_id),
          quantity: Number(formData.quantity),
          date: formData.date,
        },
        { headers: { "X-User-Id": user.id } }
      );
      setIsModalOpen(false);
      setFormData({ ...formData, quantity: 0 });
      fetchAllData(user.id);
    } catch (e: any) {
      alert(e.response?.data?.detail || "Gagal");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitLoading(true);
    try {
      await axios.post(
        API_BASE + "/restock",
        {
          ...restockData,
          product_id: Number(restockData.product_id),
          quantity: Number(restockData.quantity),
        },
        { headers: { "X-User-Id": user.id } }
      );
      setIsRestockOpen(false);
      setRestockData({ ...restockData, quantity: 0 });
      fetchAllData(user.id);
    } catch (e: any) {
      alert(e.response?.data?.detail || "Gagal");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRetrain = async () => {
    if (!user || !confirm("Latih ulang AI?")) return;
    setRetrainLoading(true);
    try {
      const res = await axios.post(
        API_BASE + "/retrain",
        {},
        { headers: { "X-User-Id": user.id } }
      );
      alert(`✅ AI Dilatih!\nAkurasi Baru: ${res.data.accuracy.r2_score}`);
      fetchAllData(user.id);
    } catch {
      alert("Gagal");
    } finally {
      setRetrainLoading(false);
    }
  };

  // --- UI HELPERS ---
  const getIcon = (n: string) => {
    const x = n.toLowerCase();
    if (x.includes("teh")) return "🥤";
    if (x.includes("mie")) return "🍜";
    if (x.includes("kopi")) return "☕";
    return "📦";
  };
  const formatRp = (n: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n);

  // VIEW: LOGIN
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-slate-900 z-0"></div>
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-600 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-purple-600 rounded-full blur-3xl opacity-20"></div>

        <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/20 z-10">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3 animate-bounce inline-block">🏪</div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {isRegister ? "Buat Akun Baru" : "Selamat Datang"}
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              {isRegister
                ? "Mulai bisnis cerdas dengan AI"
                : "Masuk ke dashboard Anda"}
            </p>
          </div>
          {authError && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-xl text-sm font-medium animate-pulse flex items-center gap-2">
              <span>⚠️</span> {authError}
            </div>
          )}
          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1">
                Email Bisnis
              </label>
              <input
                type="email"
                required
                placeholder="nama@toko.com"
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-medium"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 ml-1">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-medium"
                value={authPass}
                onChange={(e) => setAuthPass(e.target.value)}
              />
              {isRegister && (
                <p className="text-[10px] text-slate-400 mt-1.5 ml-1 flex items-center gap-1">
                  ℹ️ Minimal 6 karakter.
                </p>
              )}
            </div>
            <button
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3.5 rounded-xl font-bold text-lg transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-70 mt-2"
            >
              {authLoading
                ? "Memproses..."
                : isRegister
                ? "Daftar Sekarang"
                : "Masuk Dashboard"}
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500 mb-2">
              {isRegister ? "Sudah punya akun?" : "Belum punya akun?"}
            </p>
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setAuthError("");
              }}
              className="text-blue-600 font-bold hover:text-blue-700 transition-colors text-sm py-1 px-3 rounded-lg hover:bg-blue-50"
            >
              {isRegister ? "Login di sini" : "Daftar Toko Baru"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VIEW: DASHBOARD
  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-800 relative">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-2 rounded-lg text-xl shadow-md">
              🏪
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Smart Merchant
              </h1>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-slate-500 text-xs font-medium">
                  {user.email?.split("@")[0]}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 items-center w-full md:w-auto">
            <button
              onClick={handleRetrain}
              disabled={retrainLoading}
              className="flex-1 md:flex-none bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-sm font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2 group"
            >
              {retrainLoading ? (
                <span className="animate-spin">🔄</span>
              ) : (
                <span className="group-hover:rotate-12 transition-transform">
                  ⚡
                </span>
              )}{" "}
              {retrainLoading ? "Melatih..." : "Latih AI"}
            </button>
            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200">
              <span className="text-lg">📍</span>
              <span className="font-bold text-slate-600 text-sm">
                {locationName}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="bg-white text-red-600 px-4 py-2 rounded-xl text-sm font-bold border border-red-100 hover:bg-red-50 transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>

      {!loading && summary && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-green-50 text-green-600 rounded-xl text-2xl group-hover:scale-110 transition-transform">
                  💰
                </div>
              </div>
              <p className="text-sm text-slate-500 font-medium mb-1">
                Total Pendapatan
              </p>
              <h3 className="text-3xl font-bold text-slate-900">
                {formatRp(summary.revenue)}
              </h3>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-orange-50 text-orange-500 rounded-xl text-2xl group-hover:scale-110 transition-transform">
                  🏆
                </div>
              </div>
              <p className="text-sm text-slate-500 font-medium mb-1">
                Produk Terlaris
              </p>
              <h3 className="text-2xl font-bold text-slate-900 truncate">
                {summary.top_product}
              </h3>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-500 rounded-xl text-2xl group-hover:scale-110 transition-transform">
                  📈
                </div>
              </div>
              <p className="text-sm text-slate-500 font-medium mb-1">
                Pertumbuhan (7 Hari)
              </p>
              <h3
                className={`text-3xl font-bold ${
                  summary.growth >= 0 ? "text-blue-600" : "text-red-500"
                }`}
              >
                {summary.growth > 0 ? "+" : ""}
                {summary.growth}%
              </h3>
            </div>
          </div>

          <div className="space-y-8 mb-12">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-slate-800">
                Inventaris & Prediksi
              </h2>
              <div className="h-1 flex-1 bg-slate-100 rounded-full"></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {predictions.map((p) => {
                const realP = products.find((prod) => prod.id === p.product_id);
                const isLow = (realP?.stock || 0) < 10;
                return (
                  <div
                    key={p.product_id}
                    className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                  >
                    <div className="p-6 pb-0 flex justify-between items-start">
                      <div className="flex gap-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl shadow-inner">
                          {getIcon(p.product_name)}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-900 group-hover:text-blue-600 transition-colors">
                            {p.product_name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-lg font-bold ${
                                isLow
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              Stok: {realP?.stock}
                            </span>
                            {isLow && (
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setRestockData({
                            product_id: p.product_id,
                            quantity: 10,
                          });
                          setIsRestockOpen(true);
                        }}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        + Stok
                      </button>
                    </div>
                    <div className="p-6">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        Prediksi 5 Hari
                      </p>
                      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {p.weekly_forecast.map((d, i) => (
                          <div
                            key={i}
                            className={`min-w-[90px] p-3 rounded-xl border flex flex-col items-center gap-2 transition-colors ${getAdviceStyle(
                              d.advice
                            )}`}
                          >
                            <span className="text-[10px] font-bold uppercase opacity-70">
                              {i === 0 ? "Besok" : d.date}
                            </span>
                            <span className="text-2xl">
                              {d.weather === "Hujan"
                                ? "🌧️"
                                : d.weather === "Cerah"
                                ? "☀️"
                                : "☁️"}
                            </span>
                            <div className="text-center">
                              <span className="text-sm font-bold block">
                                {d.sales}
                              </span>
                              {/* PESAN SARAN MUNCUL DISINI */}
                              <span className="text-[9px] uppercase font-bold tracking-tighter leading-tight block mt-1">
                                {d.advice}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-20">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-slate-800">
                Analisis Tren
              </h2>
              <div className="h-1 flex-1 bg-slate-100 rounded-full"></div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {products.map((p) => {
                const data = history
                  .filter((h) => h.product_id === p.id)
                  .map((h) => ({ date: h.date, jual: h.quantity_sold }));
                if (data.length === 0) return null;
                return (
                  <div
                    key={p.id}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm h-[300px]"
                  >
                    <h4 className="text-sm font-bold mb-6 flex items-center gap-2 text-slate-600">
                      <span className="bg-slate-100 p-1.5 rounded-lg text-lg">
                        {getIcon(p.name)}
                      </span>{" "}
                      {p.name}
                    </h4>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={data}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f1f5f9"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickFormatter={(v) => v.slice(5)}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          dx={-10}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "none",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="jual"
                          stroke="#4f46e5"
                          strokeWidth={3}
                          dot={false}
                          activeDot={{
                            r: 6,
                            fill: "#4f46e5",
                            stroke: "#fff",
                            strokeWidth: 3,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white z-40 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="font-bold text-slate-400 animate-pulse">
            Memuat Toko Anda...
          </p>
        </div>
      )}

      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl shadow-blue-500/40 transition-all hover:scale-110 flex items-center gap-3 z-40 group pr-6"
      >
        <span className="text-2xl group-hover:-rotate-12 transition-transform">
          📝
        </span>{" "}
        <span className="font-bold text-lg hidden md:inline">Jual Barang</span>
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="font-bold text-2xl text-slate-800">
                  Input Penjualan
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Stok akan berkurang otomatis
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-slate-500"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmitSales} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Tanggal
                </label>
                <input
                  type="date"
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Produk
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3 pl-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-medium text-slate-700"
                    value={formData.product_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        product_id: Number(e.target.value),
                      })
                    }
                  >
                    {" "}
                    <option value={0}>Pilih Produk...</option>{" "}
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Sisa: {p.stock})
                      </option>
                    ))}{" "}
                  </select>
                  <div className="absolute right-4 top-3.5 pointer-events-none text-slate-400">
                    ▼
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Jumlah
                </label>
                <input
                  type="number"
                  placeholder="0"
                  required
                  min="1"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </div>
              <button
                disabled={submitLoading}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 mt-2"
              >
                {submitLoading ? "Menyimpan..." : "Simpan Data"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isRestockOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl border-t-8 border-green-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="font-bold text-2xl text-slate-800">
                  Restock Barang
                </h3>
                <p className="text-green-600 text-xs mt-1 font-bold">
                  TAMBAH STOK GUDANG
                </p>
              </div>
              <button
                onClick={() => setIsRestockOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-slate-500"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRestock} className="space-y-6">
              <div className="bg-green-50 p-5 rounded-2xl text-center border border-green-100">
                <p className="text-xs text-green-600 uppercase font-bold tracking-wider mb-1">
                  Produk Dipilih
                </p>
                <p className="font-bold text-xl text-slate-800">
                  {products.find((p) => p.id === restockData.product_id)?.name}
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 text-center">
                  Jumlah Masuk
                </label>
                <input
                  type="number"
                  placeholder="0"
                  required
                  min="1"
                  className="w-full p-4 border-2 border-green-100 rounded-2xl font-bold text-3xl text-center text-green-600 focus:border-green-500 outline-none transition-colors bg-white"
                  value={restockData.quantity}
                  onChange={(e) =>
                    setRestockData({
                      ...restockData,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </div>
              <button
                disabled={submitLoading}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-all shadow-lg hover:shadow-green-500/30 disabled:opacity-50"
              >
                {submitLoading ? "Menambah..." : "Konfirmasi Tambah"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
