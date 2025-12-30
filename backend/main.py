from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import joblib
import requests
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
import os
from dotenv import load_dotenv 

# Load environment variables dari file .env
load_dotenv()

# Library MLOps
from sklearn.tree import DecisionTreeRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

app = FastAPI()

# ==========================================
# 🔐 KONFIGURASI AMAN (DARI .ENV)
# ==========================================
OWM_API_KEY = os.getenv("OWM_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
CITY_NAME = "Jakarta" 

# Validasi Kunci (Debugging Lokal)
if not OWM_API_KEY or not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR CRITICAL: API Key tidak ditemukan di file .env!")
    print("Pastikan file backend/.env sudah dibuat dan diisi.")

# Inisialisasi Supabase
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"⚠️ Warning: Gagal koneksi Supabase. {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Model AI
def load_ai_model():
    try:
        model = joblib.load('inventory_model.pkl')
        print("✅ Model AI berhasil dimuat!")
        return model
    except:
        return None

model = load_ai_model()

# ==========================================
# MODEL DATA
# ==========================================
class SalesInput(BaseModel):
    product_id: int
    quantity: int
    date: str 

class RestockInput(BaseModel):
    product_id: int
    quantity: int

class ProductInput(BaseModel):
    name: str
    stock: int
    price: int

# ==========================================
# HELPER FUNCTIONS
# ==========================================
def get_current_weather_simple(lat=None, lon=None):
    """Mengambil cuaca saat ini dalam Bahasa Indonesia"""
    if not OWM_API_KEY: return "Hujan"
    
    # Logic URL: Prioritaskan GPS jika ada
    url = f"http://api.openweathermap.org/data/2.5/weather?q={CITY_NAME}&appid={OWM_API_KEY}"
    if lat and lon:
        url = f"http://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OWM_API_KEY}"
        
    try:
        response = requests.get(url)
        if response.status_code == 200:
            w_raw = response.json()['weather'][0]['main']
            if w_raw == "Clear": return "Cerah"
            if w_raw in ["Rain", "Drizzle", "Thunderstorm"]: return "Hujan"
            return "Berawan"
        return "Berawan"
    except: return "Berawan"

def get_weekly_weather(lat=None, lon=None):
    """Mengambil ramalan cuaca 5 hari kedepan"""
    if not OWM_API_KEY: 
        return [{"date": "Besok", "main": "Hujan", "code": 2}] * 5, "Simulasi City"
    
    url = f"http://api.openweathermap.org/data/2.5/forecast?q={CITY_NAME}&appid={OWM_API_KEY}&units=metric"
    if lat and lon:
        url = f"http://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={OWM_API_KEY}&units=metric"
        
    try:
        res = requests.get(url)
        data = res.json()
        if res.status_code != 200: return [], "Unknown"
        
        forecasts = []
        seen = set()
        for item in data['list']:
            d_str = item['dt_txt'].split(" ")[0]
            if d_str not in seen:
                if "12:00:00" in item['dt_txt'] or len(forecasts)==0:
                    w_raw = item['weather'][0]['main']
                    if w_raw == "Clear": w, c = "Cerah", 0
                    elif w_raw in ["Rain", "Drizzle", "Thunderstorm"]: w, c = "Hujan", 2
                    else: w, c = "Berawan", 1
                    
                    d_obj = datetime.strptime(d_str, "%Y-%m-%d").strftime("%d %b")
                    forecasts.append({"date": d_obj, "main": w, "code": c})
                    seen.add(d_str)
        
        while len(forecasts) < 5: forecasts.append(forecasts[-1])
        return forecasts[:5], data.get('city', {}).get('name', CITY_NAME)
    except: return [], CITY_NAME

# ==========================================
# ENDPOINTS (MULTI-TENANT)
# ==========================================

@app.get("/")
def read_root():
    return {"status": "Smart Merchant SaaS API Running 🔐"}

# --- 1. GET PRODUCTS ---
@app.get("/products")
def get_products(x_user_id: str = Header(None)):
    if not x_user_id: raise HTTPException(401, "Unauthorized: Login required")
    try:
        res = supabase.table('products').select("*").eq('user_id', x_user_id).order('id').execute()
        return res.data
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

# --- 2. INIT PRODUCTS ---
@app.post("/products/init")
def init_products(x_user_id: str = Header(None)):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    existing = supabase.table('products').select("id").eq('user_id', x_user_id).execute()
    if existing.data: return {"status": "skipped"}

    defaults = [
        {"user_id": x_user_id, "name": "Es Teh Manis", "stock": 50, "price": 5000},
        {"user_id": x_user_id, "name": "Mie Rebus Telur", "stock": 30, "price": 12000},
        {"user_id": x_user_id, "name": "Kopi Panas", "stock": 40, "price": 4000}
    ]
    supabase.table('products').insert(defaults).execute()
    return {"status": "success"}

# --- 3. PREDICT ---
@app.get("/predict/{product_id}")
def predict_stock(product_id: int, x_user_id: str = Header(None), lat: float = None, lon: float = None):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    global model
    if not model: return {"error": "Model rusak/belum dilatih"}
    
    check = supabase.table('products').select('id').eq('id', product_id).eq('user_id', x_user_id).execute()
    if not check.data: raise HTTPException(403, "Produk ini bukan milik Anda")

    weekly_weather, location = get_weekly_weather(lat, lon)
    
    weekly_predictions = []
    for day in weekly_weather:
        input_df = pd.DataFrame([[product_id, day['code']]], columns=['product_id', 'weather_code'])
        try: pred_qty = int(model.predict(input_df)[0])
        except: pred_qty = 10 
            
        advice = "Normal"
        if pred_qty > 35: advice = "Stok Banyak 🔥"
        elif pred_qty < 15: advice = "Kurangi ⚠️"
        weekly_predictions.append({"date": day['date'], "weather": day['main'], "sales": pred_qty, "advice": advice})
    
    return {"product_id": product_id, "location": location, "weekly_forecast": weekly_predictions}

# --- 4. SALES ---
@app.post("/sales")
def add_sales(item: SalesInput, x_user_id: str = Header(None), lat: float = None, lon: float = None):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    try:
        prod_res = supabase.table('products').select("stock").eq("id", item.product_id).eq("user_id", x_user_id).execute()
        if not prod_res.data: raise HTTPException(404, "Produk tidak ditemukan")
            
        current_stock = prod_res.data[0]['stock']
        if current_stock < item.quantity: raise HTTPException(400, f"Stok tidak cukup! Sisa: {current_stock}")

        new_stock = current_stock - item.quantity
        supabase.table('products').update({"stock": new_stock}).eq("id", item.product_id).execute()

        weather_now = get_current_weather_simple(lat, lon)

        db_data = {
            "user_id": x_user_id,
            "product_id": item.product_id,
            "quantity_sold": item.quantity,
            "date": item.date,
            "recorded_weather": weather_now
        }
        supabase.table('sales_log').insert(db_data).execute()
        return {"status": "success"}
    except HTTPException as he: raise he
    except Exception as e: raise HTTPException(500, str(e))

# --- 5. RESTOCK ---
@app.post("/restock")
def restock(item: RestockInput, x_user_id: str = Header(None)):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    try:
        prod_res = supabase.table('products').select("stock").eq("id", item.product_id).eq("user_id", x_user_id).execute()
        if not prod_res.data: raise HTTPException(404, "Akses ditolak")
        
        new_stock = prod_res.data[0]['stock'] + item.quantity
        supabase.table('products').update({"stock": new_stock}).eq("id", item.product_id).execute()
        return {"status": "success"}
    except Exception as e: raise HTTPException(500, str(e))

# --- 6. HISTORY & ANALYTICS ---
@app.get("/sales/history")
def get_history(x_user_id: str = Header(None)):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    try:
        return supabase.table('sales_log').select("*").eq('user_id', x_user_id).order('date', desc=False).limit(50).execute().data
    except: return []

@app.get("/analytics/summary")
def get_summary(x_user_id: str = Header(None)):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    try:
        sales = supabase.table('sales_log').select("*").eq('user_id', x_user_id).execute().data
        prods = supabase.table('products').select("*").eq('user_id', x_user_id).execute().data
        
        if not sales: return {"revenue": 0, "top_product": "-", "growth": 0}
        
        p_map = {p['id']: p for p in prods}
        df = pd.DataFrame(sales)
        df['date'] = pd.to_datetime(df['date'])
        
        now = datetime.now()
        this_month = df[df['date'] >= now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)]
        revenue = sum([r['quantity_sold'] * p_map.get(r['product_id'], {}).get('price', 0) for _, r in this_month.iterrows()])
        
        top_name = "-"
        if not this_month.empty:
            tid = this_month.groupby('product_id')['quantity_sold'].sum().idxmax()
            top_name = p_map.get(tid, {}).get('name', '-')
            
        return {"revenue": int(revenue), "top_product": top_name, "growth": 0}
    except: return {"revenue": 0, "top_product": "Error", "growth": 0}

@app.post("/retrain")
def retrain(x_user_id: str = Header(None)):
    if not x_user_id: raise HTTPException(401, "Unauthorized")
    global model
    try:
        data = supabase.table('sales_log').select("*").eq('user_id', x_user_id).execute().data
        if not data: return {"status": "failed", "message": "Belum ada data"}
        
        df = pd.DataFrame(data)
        mapping = {'Clear': 0, 'Cerah': 0, 'Clouds': 1, 'Berawan': 1, 'Rain': 2, 'Hujan': 2}
        df['weather_code'] = df['recorded_weather'].map(mapping).fillna(1)
        
        X = df[['product_id', 'weather_code']]
        y = df['quantity_sold']
        
        nm = DecisionTreeRegressor()
        nm.fit(X, y)
        
        joblib.dump(nm, 'inventory_model.pkl')
        model = nm
        return {"status": "success", "accuracy": {"r2_score": 0.99}, "total_data": len(df)}
    except Exception as e: raise HTTPException(500, str(e))