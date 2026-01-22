import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Activity, LayoutDashboard, MapIcon, LineChart } from "lucide-react";
import { useReactToPrint } from "react-to-print"; 
import { format } from "date-fns"; 
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { InsightCard } from "@/components/dashboard/InsightCard";
import { NarrativeSummary } from "@/components/dashboard/NarrativeSummary";
import { ForecastsChart } from "@/components/dashboard/PriceChart";
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
  forecasts: Record<string, number[]>;
}

const Index = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 0, 21));
  const [region, setRegion] = useState<string>("CH");
  const [apiData, setApiData] = useState<VolatilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // --- NUOVO STATO PER LA NAVIGAZIONE ---
  const [activeTab, setActiveTab] = useState<"overview" | "map" | "forecast">("overview");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
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
      <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          <DashboardHeader 
            date={selectedDate} 
            setDate={setSelectedDate}
            region={region}
            setRegion={setRegion}
            onExport={handlePrint}
          />

          {/* --- SWITCH CENTRALE (SEGMENTED CONTROL) --- */}
          <div className="flex justify-center my-8">
            <div className="inline-flex items-center p-1 bg-muted/40 backdrop-blur-md rounded-full border border-border/50 shadow-sm">
              {[
                { id: "overview", label: "Overview", icon: LayoutDashboard },
                                { id: "forecast", label: "Forecasts", icon: LineChart },
                { id: "map", label: "Market Map", icon: MapIcon },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200
                    ${activeTab === tab.id 
                      ? "bg-[#333670] text-primary-foreground shadow-md scale-105" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}
                  `}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={contentRef} className="print:p-6 print:bg-white">
            
            {/* --- VISTA OVERVIEW --- */}
            {activeTab === "overview" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InsightCard
                    icon={AlertTriangle}
                    title="Price Anomaly"
                    headline={isLoading ? "Analyzing..." : (apiData?.price_anomaly.unusual ? "Abnormal Price Spike" : "Normal Price Behavior")}
                    detail={isLoading ? "Fetching market data..." : (apiData?.price_anomaly.unusual ? `Excessive return detected: +${apiData?.price_anomaly.excessive_return?.toFixed(1)} €/MWh` : "Market prices are within expected deviation limits.")}
                    severity={apiData?.price_anomaly.unusual ? "high" : "low"}
                    sparklineData={isLoading ? [] : (apiData?.price_anomaly.chart_price || [])} 
                    delay={0}
                    highlightTarget="price"
                  />

                  <InsightCard
                    icon={Activity}
                    title="Volatility Regime"
                    headline={isLoading ? "Analyzing..." : `${(apiData?.volatility.level || "Unknown").charAt(0).toUpperCase() + (apiData?.volatility.level || "").slice(1)} Volatility`}
                    detail={isLoading ? "Calculating GARCH model..." : (apiData?.volatility.percentile ? `Volatility is higher than ${Math.round(apiData.volatility.percentile * 100)}% of the last 6 months` : "Insufficient data for percentile calculation")}
                    severity={apiData?.volatility.level === "high" ? "high" : apiData?.volatility.level === "normal" ? "medium" : "low"}
                    sparklineData={isLoading ? [] : (apiData?.volatility.chart_volatility || [])}
                    sparklineType="area"
                    delay={0.1}
                    highlightTarget="volatility"
                  />
                </section>
                <NarrativeSummary data={apiData} />
              </div>
            )}

            {/* --- VISTA MAPPA --- */}
            {activeTab === "map" && (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <section className="rounded-3xl overflow-hidden border border-border bg-card shadow-xl">
                  <EuropePriceMap date={selectedDate} />
                </section>
              </div>
            )}

            {/* --- VISTA FORECAST --- */}
            {activeTab === "forecast" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <section className="bg-card p-6 rounded-3xl border border-border shadow-sm">
                  <div className="min-h-[450px]">
                    {isLoading ? (
                      <div className="w-full h-[400px] bg-muted/20 animate-pulse rounded-xl flex items-center justify-center border border-dashed border-border">
                        <p className="text-muted-foreground">Loading market forecasts...</p>
                      </div>
                    ) : apiData ? (
                      <ForecastsChart forecasts={apiData.forecasts} area={apiData.area} />
                    ) : (
                      <div className="w-full h-[400px] flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">No forecast data available.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* FOOTER SEMPRE VISIBILE */}
            <footer className="mt-12 pt-8 border-t border-border/50">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground uppercase tracking-widest">
                <p>Energy Market Signal Intelligence</p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
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