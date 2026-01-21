import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Activity } from "lucide-react";
import { useReactToPrint } from "react-to-print"; 
import { format } from "date-fns"; 
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { InsightCard } from "@/components/dashboard/InsightCard";
import { NarrativeSummary } from "@/components/dashboard/NarrativeSummary";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { ChatInterface } from "@/components/dashboard/ChatInterface";
import { HighlightProvider } from "@/contexts/HighlightContext";
import { EuropePriceMap } from "@/components/dashboard/EuropePriceMap";

// Interface for API Response
interface VolatilityResponse {
  area: string;
  date: string;
  volatility: {
    level: "low" | "normal" | "high" | "unknown";
    percentile: number | null;
    chart_volatility: number[];
  };
  price_anomaly: {
    unusual: boolean;
    excessive_return: number | null;
    chart_price: number[];
  };
}

const Index = () => {
  // --- MASTER STATE ---
  // Changing these will now INSTANTLY trigger the dashboard update
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 0, 21));
  const [region, setRegion] = useState<string>("CH");

  // API Data State
  const [apiData, setApiData] = useState<VolatilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // --- LIVE FETCH FUNCTION ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // console.log("Live Update for:", region, format(selectedDate, "yyyy-MM-dd"));

      const response = await fetch("http://localhost:8000/v1/volatility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: region,
          date: format(selectedDate, "yyyy-MM-dd"),
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch data");

      const data: VolatilityResponse = await response.json();
      setApiData(data);
    } catch (error) {
      console.error("API Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, region]); 

  // --- AUTOMATIC TRIGGER ---
  // This useEffect listens to state changes and updates the dashboard immediately
  useEffect(() => {
    fetchData();
  }, [fetchData]); 

  const contentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `Market_Brief_${selectedDate.toISOString().split('T')[0]}`,
  });
  return (
    <HighlightProvider>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* HEADER: Directly controls master state */}
        <DashboardHeader 
          date={selectedDate} 
          setDate={setSelectedDate}
          region={region}
          setRegion={setRegion}
          onExport={handlePrint}
        />
        <div ref={contentRef} className="print:p-6 print:bg-white">
        
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          
          {/* CARD 1: PRICE ANOMALY */}
          <InsightCard
            icon={AlertTriangle}
            title="Price Anomaly"
            headline={
               isLoading ? "Analyzing..." : 
               (apiData?.price_anomaly.unusual ? "Abnormal Price Spike" : "Normal Price Behavior")
            }
            detail={
               isLoading ? "Fetching market data..." : 
               (apiData?.price_anomaly.unusual 
                 ? `Excessive return detected: +${apiData?.price_anomaly.excessive_return?.toFixed(1)} €/MWh`
                 : "Market prices are within expected deviation limits.")
            }
            severity={apiData?.price_anomaly.unusual ? "high" : "low"}
            sparklineData={isLoading ? [] : (apiData?.price_anomaly.chart_price || [])} 
            delay={0}
            highlightTarget="price"
          />

          {/* CARD 2: VOLATILITY */}
          <InsightCard
            icon={Activity}
            title="Volatility Regime"
            headline={
              isLoading ? "Analyzing..." :
              `${(apiData?.volatility.level || "Unknown").charAt(0).toUpperCase() + (apiData?.volatility.level || "").slice(1)} Volatility`
            }
            detail={
               isLoading ? "Calculating GARCH model..." :
               (apiData?.volatility.percentile 
                 ? `Volatility is higher than ${Math.round(apiData.volatility.percentile * 100)}% of the last 6 months` 
                 : "Insufficient data for percentile calculation")
            }
            severity={
              apiData?.volatility.level === "high" ? "high" : 
              apiData?.volatility.level === "normal" ? "medium" : "low"
            }
            sparklineData={isLoading ? [] : (apiData?.volatility.chart_volatility || [])}
            sparklineType="area"
            delay={0.1}
            highlightTarget="volatility"
          />
        </section>
        
        <div className="mt-6">
          <NarrativeSummary />
        </div>

        {/* MAP SECTION: Listens to 'selectedDate' automatically */}
        <section className="mt-8">
          <EuropePriceMap date={selectedDate} />
        </section>
        
        <section className="mt-8 break-inside-avoid">
          <h2 className="section-title mb-1">Supporting Evidence</h2>
          <p className="section-subtitle">Visual analysis with annotated patterns</p>

          <div className="mt-4">
            <PriceChart />
          </div>
        </section>
        
        <footer className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>
              Energy Market Signal Intelligence · System v2.5
            </p>
            <p className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse-glow" />
              All systems operational
            </p>
          </div>
        </footer>
        </div>
      </div>
      </div>

      <div className="print:hidden">
      
      <ChatInterface />
      </div>
    </HighlightProvider>
  );
};

export default Index;
