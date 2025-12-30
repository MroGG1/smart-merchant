import os
import pandas as pd
from sklearn.tree import DecisionTreeRegressor
from sklearn.model_selection import train_test_split  # Untuk membagi soal ujian
from sklearn.metrics import mean_absolute_error, r2_score  # Untuk menilai hasil ujian
import joblib
from supabase import create_client

# ==========================================
# 1. KONFIGURASI SUPABASE
# ==========================================
# GANTI DENGAN KUNCI ASLI KAMU DARI DASHBOARD SUPABASE
SUPABASE_URL = "https://zsanzmgxuvenhqjxsmna.supabase.co"
SUPABASE_KEY = "sb_publishable_m6BndGKy1wYBO07Qeum8cg_sk1h4ACw"

# Membuat koneksi ke Supabase
try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"❌ Error Koneksi: {e}")
    print("Pastikan URL dan KEY sudah benar.")
    exit()

print("⏳ Sedang mengambil data dari tabel 'sales_log'...")

# ==========================================
# 2. MENGAMBIL DATA (FETCHING)
# ==========================================
response = supabase.table('sales_log').select("*").execute()
data = response.data

# Cek apakah datanya ada
if not data:
    print("❌ Error: Data kosong! Jalankan 'python seed_data.py' dulu untuk isi data.")
    exit()

# Ubah data mentah menjadi format Tabel Pandas (DataFrame)
df = pd.DataFrame(data)

# ==========================================
# 3. PREPROCESSING (PERSIAPAN DATA)
# ==========================================
# Masalah: Mesin tidak mengerti kata "Rain" atau "Clear".
# Solusi: Kita ubah jadi angka (Encoding).
# Aturan: Clear = 0, Clouds = 1, Rain = 2
weather_mapping = {'Clear': 0, 'Clouds': 1, 'Rain': 2}

# Buat kolom baru 'weather_code'
# .map() mengganti teks, .fillna(1) mengisi jika ada cuaca tak dikenal dengan 1 (Clouds)
df['weather_code'] = df['recorded_weather'].map(weather_mapping).fillna(1)

# X = Soal/Fitur (Produk ID & Kode Cuaca)
X = df[['product_id', 'weather_code']]

# y = Jawaban/Target (Jumlah Terjual)
y = df['quantity_sold']

# ==========================================
# 4. PEMBAGIAN DATA (TRAIN-TEST SPLIT)
# ==========================================
# Kita potong 20% data (test_size=0.2) untuk dijadikan "Soal Ujian".
# 80% sisanya untuk latihan belajar.
# random_state=42 agar hasil potongannya konsisten.
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print(f"📊 Total Data: {len(df)} baris")
print(f"📚 Data Latihan: {len(X_train)} baris")
print(f"📝 Data Ujian: {len(X_test)} baris")

# ==========================================
# 5. TRAINING (PROSES BELAJAR)
# ==========================================
print("🧠 Sedang melatih model (Si Murid sedang belajar)...")
model = DecisionTreeRegressor()
model.fit(X_train, y_train)  # Belajar HANYA dari data latihan

# ==========================================
# 6. EVALUASI (UJIAN DADAKAN)
# ==========================================
print("🧐 Sedang menguji kepintaran model...")

# Suruh model menebak jawaban dari soal ujian (X_test)
y_pred = model.predict(X_test)

# Bandingkan tebakan model (y_pred) dengan kunci jawaban asli (y_test)
mae = mean_absolute_error(y_test, y_pred) # Rata-rata meleset berapa angka
r2 = r2_score(y_test, y_pred)             # Skor kecerdasan (Maks 1.0)

print("\n" + "=" * 40)
print("📊 RAPOR HASIL BELAJAR MODEL")
print("=" * 40)
print(f"1. Rata-rata Meleset (MAE) : {mae:.2f} porsi")
print(f"   (Artinya: Prediksi model rata-rata meleset +/- {mae:.1f} barang)")
print(f"2. Skor Kecerdasan (R2)    : {r2:.2f} / 1.00")
print(f"   (Semakin mendekati 1.00, semakin akurat)")
print("=" * 40)

# Kesimpulan Otomatis
if r2 > 0.7:
    print("✅ STATUS: SANGAT BAGUS! Model sudah paham pola penjualan.")
elif r2 > 0.4:
    print("⚠️ STATUS: LUMAYAN. Model agak bingung tapi bisa dipakai.")
else:
    print("❌ STATUS: BURUK. Data mungkin terlalu acak (tidak berpola).")

# ==========================================
# 7. SIMPAN MODEL
# ==========================================
filename = 'inventory_model.pkl'
joblib.dump(model, filename)
print(f"\n💾 Model pintar berhasil disimpan ke file '{filename}'")
print("Siap digunakan untuk Phase 3 (Backend API)!")