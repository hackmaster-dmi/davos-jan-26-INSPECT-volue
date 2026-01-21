import os
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
import volue_insight_timeseries as vit
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import SESSION, run_agent_logic

load_dotenv()

app = FastAPI(title="DavosHack API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In produzione metti l'URL specifico, per ora va bene *
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# LISTA AGGIORNATA CON ZONE VALIDE
EU_AREAS = [
    "ch", "de", "fr", "at", "it", "nl", "be", 
    "dk1", "no2", "se3", "fi", "pl", "es", "uk"
]

DEFAULT_RUN = "EC00"

# --- PYDANTIC MODELS ---
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None  # User sends this back to keep memory

def make_session() -> vit.Session:
    cid = os.environ.get("CLIENT_ID")
    sec = os.environ.get("CLIENT_SECRET")
    if not cid or not sec:
        raise RuntimeError("Missing CLIENT_ID / CLIENT_SECRET env vars.")
    return vit.Session(client_id=cid, client_secret=sec)

SESSION = make_session()

def fetch_curve_series(curve_name: str, start: datetime, end: datetime) -> pd.Series:
    """
    Fetch TIME_SERIES curve data and return pandas Series indexed by timestamps.
    Handles timezone mismatches and empty data.
    """
    # 1. Trova la curva
    try:
        curve = SESSION.get_curve(name=curve_name)
    except Exception:
        results = SESSION.search(name=curve_name)
        if not results:
            # print(f"DEBUG: Curva '{curve_name}' NON trovata nel database.")
            raise KeyError(f"Curve not found: {curve_name}")
        curve = results[0]

    # 2. Scarica i dati
    ts = curve.get_data(
        data_from=start.strftime("%Y-%m-%dT%H:%M:%S"),
        data_to=end.strftime("%Y-%m-%dT%H:%M:%S"),
    )

    # 3. Controllo dati vuoti
    if ts is None:
        return pd.Series(dtype=float)

    # 4. Converti in Pandas e normalizza Timezone
    try:
        if hasattr(ts, 'to_pandas'):
            s = ts.to_pandas()
        else:
            s = pd.Series(ts.values, index=pd.to_datetime(ts.index))
        
        # FIX CRITICO: Rimuovi la timezone per matchare le ore del loop
        if s.index.tz is not None:
            s = s.tz_convert("Europe/Berlin")
            s.index = s.index.tz_localize(None)
            
        return s.sort_index()
    except Exception as e:
        print(f"DEBUG: Errore conversione dati per '{curve_name}': {e}")
        return pd.Series(dtype=float)
    

@app.get("/v1/europe/prices")
def europe_hourly_prices(
    date_: date = Query(..., alias="date", description="YYYY-MM-DD"),
    run: str = Query(DEFAULT_RUN, description="Weather run token used in curve name, e.g. EC00"),
) -> Dict:
    """
    Returns day-ahead hourly prices for each area for a given date.
    """
    start = datetime(date_.year, date_.month, date_.day, 0, 0, 0)
    end = start + timedelta(days=1)

    by_area: Dict[str, pd.Series] = {}
    missing: List[str] = []

    for a in EU_AREAS:
        # Pattern 1: Forecast
        curve_name_forecast = f"pri {a} spot {run} €/mwh cet h f".lower()
        # Pattern 2: Actuals (per UK/GB a volte cambia valuta/nome, ma proviamo standard)
        curve_name_actual = f"pri {a} spot €/mwh cet h a".lower()

        s = pd.Series(dtype=float)
        try:
            s = fetch_curve_series(curve_name_forecast, start, end)
        except Exception:
            try:
                s = fetch_curve_series(curve_name_actual, start, end)
            except Exception as e:
                # print(f"ERRORE RECUPERO {a.upper()}: {e}")
                missing.append(a.upper())
        
        if not s.empty:
            # Resample orario e fill forward se mancano pezzi piccoli
            s = s.resample("H").mean()
            by_area[a.upper()] = s
        else:
            by_area[a.upper()] = pd.Series(dtype=float)

    # Costruzione risposta JSON
    hours: List[Dict] = []
    for h in range(24):
        t = pd.Timestamp(start + timedelta(hours=h)) # Crea timestamp naive
        prices: Dict[str, Optional[float]] = {}
        for area_code, series in by_area.items():
            if t in series.index:
                val = series.loc[t]
                prices[area_code] = None if pd.isna(val) else float(val)
            else:
                prices[area_code] = None
        hours.append({"hour": h, "prices": prices})

    return {
        "date": date_.isoformat(),
        "run": run,
        "unit": "€/MWh",
        "hours": hours,
        "missing": missing,
    }

@app.get("/v1/dashboard/swiss-smart")
def get_swiss_forecast_chart():
    """
    Restituisce i dati di previsione per la Svizzera (CH) formattati per Chart.js,
    identificando il momento migliore per consumare energia.
    """
    if not SESSION:
        raise HTTPException(status_code=503, detail="Volue Session not initialized")

    curve_name = 'pri ch spot ec00 €/mwh cet h f'
    
    try:
        # 1. Recupera la curva
        curve = SESSION.get_curve(name=curve_name)
        
        # 2. Scarica l'ULTIMA previsione (Latest Forecast)
        # Questo prende automaticamente l'ultimo "run" disponibile
        latest_forecast = curve.get_latest(with_data=True)
        
        if latest_forecast is None:
            raise HTTPException(status_code=404, detail="No forecast data found")

        # 3. Conversione in Pandas
        ts = latest_forecast.to_pandas()
        
        # Filtro: prendiamo da "adesso" fino alle prossime 48 ore
        now = pd.Timestamp.now(tz=ts.index.tz)
        end_view = now + pd.Timedelta(hours=48)
        
        # Slice dei dati
        subset = ts[(ts.index >= now) & (ts.index <= end_view)]
        
        # Se il subset è vuoto (es. siamo a fine giornata e la forecast finisce), prendiamo gli ultimi dati disponibili
        if subset.empty:
            subset = ts.tail(24)

        # 4. Analisi "Smart"
        min_price = subset.min()
        max_price = subset.max()
        best_time_idx = subset.idxmin() # Timestamp del prezzo minimo
        
        # Formattazione per il Frontend
        best_time_str = best_time_idx.strftime("%H:%M")
        best_day_str = best_time_idx.strftime("%d/%m")

        # 5. Costruzione JSON per Chart.js
        # Chart.js vuole due array principali: labels (asse X) e data (asse Y)
        labels = [t.strftime("%Y-%m-%dT%H:%M:%S") for t in subset.index]
        values = [round(float(v), 2) for v in subset.values]
        
        # Creiamo un array di colori per evidenziare il punto minimo nel grafico
        # Default blu, ma il punto minimo diventa Rosso
        point_colors = []
        point_radius = []
        for v in values:
            if v == round(float(min_price), 2):
                point_colors.append('red') # Evidenzia il minimo
                point_radius.append(6)
            else:
                point_colors.append('rgba(54, 162, 235, 1)')
                point_radius.append(3)

        response_data = {
            "analysis": {
                "current_price": round(float(subset.iloc[0]), 2),
                "min_price": round(float(min_price), 2),
                "max_price": round(float(max_price), 2),
                "best_time_label": f"{best_time_str} ({best_day_str})",
                "advice": f"Il momento migliore per consumare è alle {best_time_str} con un prezzo di {min_price:.2f} €/MWh."
            },
            "chart_js": {
                "type": "line",
                "data": {
                    "labels": labels,
                    "datasets": [
                        {
                            "label": "Price Forecast (CH) - EC00",
                            "data": values,
                            "borderColor": "rgba(54, 162, 235, 1)",
                            "backgroundColor": "rgba(54, 162, 235, 0.2)",
                            "borderWidth": 2,
                            "pointBackgroundColor": point_colors,
                            "pointRadius": point_radius,
                            "tension": 0.4 # Curvatura linea
                        }
                    ]
                },
                "options": {
                    "responsive": True,
                    "plugins": {
                        "legend": {"display": False},
                        "title": {"display": True, "text": "Previsione 48h Prezzi Spot (Svizzera)"}
                    },
                    "scales": {
                        "y": {"beginAtZero": False, "title": {"display": True, "text": "€ / MWh"}}
                    }
                }
            }
        }
        
        return response_data

    except Exception as e:
        print(f"ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Chat with the Energy Agent.
    
    To start a conversation:
    Input: {"message": "Hi, how are you?"} 
    Output: {"text_content": "...", "session_id": "123-abc-..."}
    
    To continue conversation (context aware):
    Input: {"message": "And in Germany?", "session_id": "123-abc-..."}
    """
    try:
        # We pass the session_id (if exists) to the agent logic
        return run_agent_logic(request.message, request.session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

