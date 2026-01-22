import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Tipi per i dati in arrivo dalla tua API
interface ForecastData {
  [key: string]: number[];
}

interface ForecastsChartProps {
  forecasts: ForecastData; // Il campo "forecasts" dell'API
  area: string;
}

export function ForecastsChart({ forecasts, area }: ForecastsChartProps) {
  // Stato per gestire quale serie è in evidenza
  const [highlightedSeries, setHighlightedSeries] = useState<string | null>("Spot Price");

  // Trasformiamo l'oggetto dell'API in un array di oggetti per Recharts
  // Formato: [{ hour: 0, "Spot Price": 0.5, "Consumption": 0.2, ... }, ...]
  const chartData = useMemo(() => {
    const keys = Object.keys(forecasts);
    if (keys.length === 0) return [];
    
    const length = forecasts[keys[0]].length;
    const data = [];
    
    for (let i = 0; i < length; i++) {
      const entry: any = { hour: `${i}:00` };
      keys.forEach((key) => {
        entry[key] = forecasts[key][i];
      });
      data.push(entry);
    }
    return data;
  }, [forecasts]);

  // Configurazione colori e stili per le serie
  const seriesConfig = [
    { key: "Spot Price", color: "#3b82f6" }, // Blue
    { key: "Consumption Forecast", color: "#ef4444" }, // Red
    { key: "Solar Panel Forecast", color: "#f59e0b" }, // Yellow/Orange
    { key: "Wind Forecast", color: "#10b981" }, // Green
  ];

  const handleLegendClick = (e: any) => {
    const { dataKey } = e;
    setHighlightedSeries(highlightedSeries === dataKey ? null : dataKey);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="chart-container bg-card p-6 rounded-xl border border-border"
    >
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Day-Ahead Prediction ({area})
          </h3>
          <p className="text-sm text-muted-foreground">
            {highlightedSeries 
              ? `Focusing on: ${highlightedSeries}` 
              : "Normalized 24h trends (0-1 scale)"}
          </p>
        </div>
        {highlightedSeries && (
          <button 
            onClick={() => setHighlightedSeries(null)}
            className="text-xs bg-secondary hover:bg-secondary/80 px-2 py-1 rounded transition-colors"
          >
            Reset Zoom
          </button>
        )}
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="hour" 
              tick={{ fontSize: 11 }} 
              interval={3} 
              axisLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} domain={[0, 1]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Legend 
              onClick={handleLegendClick}
              wrapperStyle={{ cursor: 'pointer', paddingTop: '20px' }}
            />
            
            {seriesConfig.map((s) => {
              const isActive = highlightedSeries === s.key;
              const isDimmed = highlightedSeries !== null && !isActive;

              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  // Se attivo: linea spessa. Se silenziato: linea sottile. Default: 2.
                  strokeWidth={isActive ? 4 : 2}
                  // Se c'è un highlight e non è questo: opacità bassa.
                  strokeOpacity={isDimmed ? 0.15 : 1}
                  dot={false}
                  activeDot={{ r: 6 }}
                  animationDuration={400}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground mt-4 italic">
        * Tip: Click on a legend item to focus a specific timeseries.
      </p>
    </motion.div>
  );
}