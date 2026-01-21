import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import type { Layer, PathOptions, GeoJSON as LeafletGeoJSON } from "leaflet";
import { format } from "date-fns";
import L from "leaflet";

interface EuropePriceMapProps {
  date: Date;
}

// Fix icone Leaflet
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const ZONE_TO_ISO3: Record<string, string> = {
  "CH": "CHE", "DE": "DEU", "FR": "FRA", "AT": "AUT", 
  "IT": "ITA", "ES": "ESP", "NL": "NLD", "BE": "BEL", 
  "PL": "POL", "FI": "FIN", "PT": "PRT",
  "UK": "GBR", "GB": "GBR", 
  "NO2": "NOR", "NO": "NOR", 
  "SE3": "SWE", "SE": "SWE", 
  "DK1": "DNK", "DK": "DNK", 
};

interface GeoJSONFeatureProperties {
  ISO3?: string;
  ISO_A3?: string;
  ADM0_A3?: string;
  NAME?: string;
  name?: string;
}

const getISO = (props: GeoJSONFeatureProperties | undefined): string | undefined => {
  if (!props) return undefined;
  return props.ISO3 || props.ISO_A3 || props.ADM0_A3;
};

const europeanCountries = new Set([ "DEU", "FRA", "CHE", "AUT", "ITA", "ESP", "PRT", "NLD", "BEL", "POL", "CZE", "DNK", "SWE", "NOR", "FIN", "GBR", "IRL", "GRC", "HUN", "SVK", "ROU", "BGR", "HRV", "SVN", "SRB", "EST", "LVA", "LTU", "LUX", "BIH", "MNE", "ALB", "MKD", "UKR", "BLR", "MDA" ]);

// --- CALCOLO COLORE DINAMICO ---
const calculateDynamicColor = (price: number, min: number, max: number): string => {
  // Caso speciale: prezzi negativi sempre blu elettrico
  if (price < 0) return '#3b82f6';
  
  if (max === min) return 'hsl(80, 85%, 50%)';

  // CLAMPING: Se il prezzo supera il max (es. Polonia outlier), lo trattiamo come se fosse il max
  const safePrice = Math.min(Math.max(price, min), max);
  
  const ratio = (safePrice - min) / (max - min);
  
  // HSL: 140 (Verde) -> 0 (Rosso)
  const hue = 140 - (ratio * 140);
  
  return `hsl(${hue}, 80%, 45%)`;
};

function MapBoundsHandler() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds([[32, -15], [72, 42]]);
    map.setMinZoom(3);
    map.setMaxZoom(7);
    map.setView([50, 10], 4);
  }, [map]);
  return null;
}

interface TooltipState {
  name: string;
  price: number;
  x: number;
  y: number;
}

export function EuropePriceMap({ date }: EuropePriceMapProps) {
  type HourlyPrices = Array<{ hour: number; prices: Record<string, number | null> }>;
  const [apiHours, setApiHours] = useState<HourlyPrices | null>(null);
  const [hasData, setHasData] = useState(false); // Nuovo stato per sapere se abbiamo dati validi
  
  const [selectedHour, setSelectedHour] = useState(12);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const geoJsonRef = useRef<LeafletGeoJSON | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setIsLoading(true);
        setHasData(false); // Reset stato dati
        
        const dateStr = format(date, "yyyy-MM-dd");
        console.log(`Fetching data for: ${dateStr}`); // DEBUG LOG

        const res = await fetch(`http://localhost:8000/v1/europe/prices?date=${dateStr}&run=EC00`, {
          signal: controller.signal,
        });
        
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        
        console.log("API Response:", data); // DEBUG LOG
        
        // Verifica se ci sono dati non nulli
        const hasValidPrices = data.hours.some((h: any) => 
            Object.values(h.prices).some(p => p !== null)
        );

        setHasData(hasValidPrices);
        setApiHours(data.hours);

      } catch (e) {
        if ((e as any).name !== "AbortError") console.error(e);
        setApiHours(null);
      } finally {
        setIsLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [date]);

  useEffect(() => {
    fetch("/data/europe.geojson")
      .then(res => res.json())
      .then((data: FeatureCollection) => {
        const filtered: FeatureCollection = {
          type: "FeatureCollection",
          features: data.features.filter(f => {
            const props = f.properties as GeoJSONFeatureProperties;
            const iso = getISO(props);
            return iso && europeanCountries.has(iso);
          })
        };
        setGeoData(filtered);
      })
      .catch(err => console.error("Failed to load Europe GeoJSON:", err));
  }, []);

  // --- CALCOLO RANGE (MIN/MAX) PIÙ ROBUSTO ---
 // --- CALCOLO RANGE ROBUSTO (PERCENTILI) ---
  const { minPrice, maxPrice } = useMemo(() => {
    if (!apiHours || !hasData) return { minPrice: 0, maxPrice: 100 };

    // 1. Raccogliamo TUTTI i prezzi positivi in un unico array
    const allPrices: number[] = [];

    apiHours.forEach(hourData => {
      Object.values(hourData.prices).forEach(p => {
        if (p !== null && p >= 0) {
           // Raccogliamo solo i positivi per la scala Verde->Rosso
           // I negativi sono gestiti a parte (blu)
           allPrices.push(p);
        }
      });
    });

    if (allPrices.length === 0) return { minPrice: 0, maxPrice: 100 };

    // 2. Ordiniamo per trovare i percentili
    allPrices.sort((a, b) => a - b);

    // 3. Prendiamo il 5° percentile (quasi il minimo) e il 95° percentile (quasi il massimo)
    // Questo taglia fuori gli outlier estremi come la Polonia nel tuo screenshot
    const p5Index = Math.floor(allPrices.length * 0.05);
    const p95Index = Math.floor(allPrices.length * 0.95);

    const robustMin = allPrices[p5Index];
    const robustMax = allPrices[p95Index];

    return { minPrice: robustMin, maxPrice: robustMax };
  }, [apiHours, hasData]);

  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    const hourObj = apiHours?.find(h => h.hour === selectedHour);
    if (!hourObj) return map;

    for (const [zoneCode, val] of Object.entries(hourObj.prices)) {
      if (val === null) continue;
      const iso3 = ZONE_TO_ISO3[zoneCode.toUpperCase()];
      if (iso3) map.set(iso3, val);
    }
    return map;
  }, [apiHours, selectedHour]);

  const formatHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

  const getStyleForFeature = useCallback((feature: Feature<Geometry, GeoJSONFeatureProperties> | undefined): PathOptions => {
    if (!feature) return {};
    const iso = getISO(feature.properties);
    const price = iso ? priceMap.get(iso) : undefined;
    
    return {
      fillColor: price !== undefined 
        ? calculateDynamicColor(price, minPrice, maxPrice)
        : '#e2e8f0', // Grigio se dato mancante
      fillOpacity: price !== undefined ? 0.85 : 0.3,
      weight: 1,
      color: '#ffffff',
      opacity: 1,
    };
  }, [priceMap, minPrice, maxPrice]);

  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.eachLayer((layer) => {
        const geoLayer = layer as L.Path & { feature?: Feature<Geometry, GeoJSONFeatureProperties> };
        if (geoLayer.feature) {
          geoLayer.setStyle(getStyleForFeature(geoLayer.feature));
        }
      });
    }
  }, [priceMap, getStyleForFeature]);

  const onEachFeature = useCallback((feature: Feature<Geometry, GeoJSONFeatureProperties>, layer: Layer) => {
    const props = feature.properties;
    const iso = getISO(props);
    const countryName = props?.NAME || props?.name || iso || "Unknown";
    
    layer.on({
      mouseover: (e) => {
        const target = e.target as L.Path;
        const price = iso ? priceMap.get(iso) : undefined;
        target.setStyle({ weight: 2.5, color: '#374151' });
        target.bringToFront();
        if (price !== undefined) {
          setTooltip({
            name: countryName,
            price: Number(price.toFixed(2)),
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
          });
        }
      },
      mouseout: (e) => {
        const target = e.target as L.Path;
        target.setStyle({ weight: 1, color: '#ffffff' });
        setTooltip(null);
      },
      mousemove: (e) => {
        const price = iso ? priceMap.get(iso) : undefined;
        if (price !== undefined) {
          setTooltip({
            name: countryName,
            price: Number(price.toFixed(2)),
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
          });
        }
      },
    });
  }, [priceMap]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="chart-container w-full"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Day-Ahead Spot Prices</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {hasData 
              ? `Colors auto-scale based on today's range (${minPrice.toFixed(0)}€ - ${maxPrice.toFixed(0)}€)`
              : "No data available for selected date"
            }
          </p>
        </div>
        <span className="text-sm font-bold bg-primary/10 text-primary px-3 py-1.5 rounded-lg border border-primary/20">
          {formatHour(selectedHour)} CET
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-border bg-slate-50 shadow-sm" style={{ height: "520px" }}>
        {isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/50 backdrop-blur-sm">
            <div className="text-sm font-medium text-muted-foreground animate-pulse">Loading market data...</div>
          </div>
        )}
        
        <MapContainer
          center={[50, 10]}
          zoom={4}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%", background: "#f8fafc" }}
          attributionControl={false}
        >
          <MapBoundsHandler />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />
          {geoData && (
            <GeoJSON
              ref={geoJsonRef}
              data={geoData}
              style={getStyleForFeature}
              onEachFeature={onEachFeature}
            />
          )}
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png" />
        </MapContainer>

        {tooltip && (
          <div
            className="fixed bg-white/95 backdrop-blur border border-slate-200 rounded-lg px-4 py-3 shadow-xl pointer-events-none"
            style={{ left: tooltip.x + 20, top: tooltip.y - 20 }}
          >
            <p className="font-semibold text-slate-800 text-sm">{tooltip.name}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`text-2xl font-bold ${tooltip.price < 0 ? 'text-blue-600' : 'text-slate-900'}`}>
                {tooltip.price}
              </span>
              <span className="text-xs font-medium text-slate-500">€/MWh</span>
            </div>
            {tooltip.price < 0 && (
                <p className="text-[10px] text-blue-600 font-medium mt-1">Negative Price! ⚡️</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 px-2">
        <Slider
          value={[selectedHour]}
          onValueChange={(value) => setSelectedHour(value[0])}
          max={23}
          min={0}
          step={1}
          className="w-full"
          disabled={!hasData} // Disabilita slider se non ci sono dati
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-mono">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* LEGENDA DINAMICA */}
      {hasData ? (
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-6 pt-5 border-t border-border/60">
          
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-blue-500" />
            <span className="text-xs text-muted-foreground">Negative (&lt;0€)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm" style={{ background: 'hsl(140, 80%, 45%)' }} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              Low ({minPrice >= 0 ? minPrice.toFixed(0) : 0}€)
            </span>
          </div>

          <div className="h-2 w-24 rounded-full bg-gradient-to-r from-[hsl(140,80%,45%)] via-[hsl(70,80%,50%)] to-[hsl(0,80%,45%)]" />

          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm" style={{ background: 'hsl(0, 80%, 45%)' }} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              High (&gt;{maxPrice.toFixed(0)}€)
            </span>
          </div>

        </div>
      ) : (
        <div className="flex justify-center mt-6 pt-5 border-t border-border/60">
            <span className="text-sm text-muted-foreground italic">Select a different date to view price data</span>
        </div>
      )}
    </motion.div>
  );
}