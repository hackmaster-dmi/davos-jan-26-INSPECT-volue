import os
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
import volue_insight_timeseries as vit
from fastapi.middleware.cors import CORSMiddleware

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