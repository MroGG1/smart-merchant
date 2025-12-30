import os
import random
from datetime import datetime, timedelta
from supabase import create_client

# --- KONFIGURASI ---
# GANTI INI DENGAN DATA DARI SUPABASE KAMU
SUPABASE_URL = "https://zsanzmgxuvenhqjxsmna.supabase.co"
SUPABASE_KEY = "sb_publishable_m6BndGKy1wYBO07Qeum8cg_sk1h4ACw"

# Membuat koneksi ke Supabase (Siapkan kurir data)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🚀 Memulai proses seeding data (Mengarang Cerita)...")

# Kita definisikan ID produk sesuai urutan INSERT di SQL tadi
# ID 1: Es Teh, ID 2: Mie Rebus, ID 3: Kopi
products = [
    {"id": 1, "name": "Es Teh Manis", "type": "cold"},
    {"id": 2, "name": "Mie Rebus Telur", "type": "warm"},
    {"id": 3, "name": "Kopi Panas", "type": "warm"}
]

data_to_insert = []
start_date = datetime.now() - timedelta(days=90) # Mulai dari 90 hari yang lalu

# Loop (Perulangan) selama 90 hari
for i in range(90):
    # Tentukan tanggal hari ini dalam cerita
    current_date = start_date + timedelta(days=i)
    formatted_date = current_date.strftime('%Y-%m-%d')
    
    # 1. Tentukan Cuaca Hari Itu (Diacak)
    # Weights: 40% Cerah, 30% Hujan, 30% Berawan
    weather = random.choices(['Clear', 'Rain', 'Clouds'], weights=[40, 30, 30])[0]
    
    # 2. Tentukan Penjualan Berdasarkan Cuaca (LOGIKA BISNIS/POLA)
    for product in products:
        qty = 0
        
        # POLA: Kalau Hujan
        if weather == 'Rain':
            if product["type"] == "warm": # Mie & Kopi laku
                qty = random.randint(30, 50) 
            else: # Es Teh sepi
                qty = random.randint(5, 15)
        
        # POLA: Kalau Cerah (Panas)
        elif weather == 'Clear':
            if product["type"] == "cold": # Es Teh laku keras
                qty = random.randint(40, 60)
            else: # Mie sepi
                qty = random.randint(10, 20)
        
        # POLA: Kalau Berawan (Netral)
        else:
            qty = random.randint(15, 30) # Rata-rata
            
        # Simpan ke daftar antrian
        data_to_insert.append({
            "product_id": product["id"],
            "quantity_sold": qty,
            "date": formatted_date,
            "recorded_weather": weather
        })

# 3. Kirim semua data ke Supabase
# Kita kirim per paket (batch) agar tidak error
print(f"📦 Siap mengirim {len(data_to_insert)} baris data...")

try:
    response = supabase.table('sales_log').insert(data_to_insert).execute()
    print("✅ SUKSES! Database kamu sekarang sudah punya sejarah penjualan.")
except Exception as e:
    print(f"❌ ERROR: {e}")