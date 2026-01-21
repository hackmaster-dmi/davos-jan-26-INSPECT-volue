import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Send, ChevronDown, Sparkles, BarChart3, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// --- CHART.JS IMPORTS & REGISTRATION ---
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ChartData,
  ChartOptions
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  Legend
);

// --- TYPES ---
interface ChartPayload {
  type: 'line' | 'bar';
  data: ChartData;
  options?: ChartOptions;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  chartData?: ChartPayload | null; // Store chart data from API
  evidence?: {
    metrics: string[];
    charts: string[];
  };
}

const suggestedQuestions = [
  "Why did prices spike this morning?",
  "Show me the gas price trend for August 2022",
  "Is this similar to yesterday?",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Store session_id to maintain conversation context
  const [sessionId, setSessionId] = useState<string | null>(null);

  const windowRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    // 1. Add User Message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // 2. Call the API
      const response = await fetch("http://localhost:8000/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId // Pass existing session ID if available
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }

      const data = await response.json();

      // 3. Update Session ID from response
      if (data.session_id) {
        setSessionId(data.session_id);
      }

      // 4. Add Assistant Message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.text_content,
        chartData: data.chart_data, // Store the chart data
        // Optional: You could parse 'evidence' from text if your agent provides it structured
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error("Chat Error:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "Sorry, I encountered an error connecting to the energy agent.",
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionClick = (question: string) => {
    setInput(question);
    // Optional: Auto-send on click
    // setInput(question); setTimeout(handleSend, 0); 
  };

  // Helper to render the specific chart type
// Helper to render the specific chart type with AUTO-CORRECTION
// Helper to render the specific chart type with DEEP AUTO-CORRECTION & DEBUG
 // Helper to render the specific chart type with DEEP AUTO-CORRECTION & DEBUG
  const renderChart = (rawPayload: any) => {
    if (!rawPayload) return null;

    let chartPayload = rawPayload;

    // --- 0. STRING PARSING FIX ---
    if (typeof rawPayload === 'string') {
        try {
            chartPayload = JSON.parse(rawPayload);
        } catch (e) {
            console.error("Failed to parse chart payload string", e);
        }
    }

    // --- 1. UNWRAPPING (Matrioska Fix) ---
    if (chartPayload.chart_data) {
        chartPayload = chartPayload.chart_data;
    }

    // --- 2. DATA NORMALIZATION (Smart Adapter) ---
    
    // Caso D (NUOVO): L'AI ha usato "x" e "y" (Il tuo caso specifico!)
    if (chartPayload.data && Array.isArray(chartPayload.data.x) && Array.isArray(chartPayload.data.y)) {
        const xData = chartPayload.data.x;
        const yData = chartPayload.data.y;
        const label = chartPayload.data.ylabel || chartPayload.data.title || "Value";

        chartPayload.data = {
            labels: xData,
            datasets: [{
                label: label,
                data: yData,
                borderColor: "rgba(54, 162, 235, 1)", // Colore Blu default
                backgroundColor: "rgba(54, 162, 235, 0.2)",
                borderWidth: 2
            }]
        };
    }

    // Caso A: L'AI ha dimenticato il wrapper "data"
    if (!chartPayload.data && chartPayload.datasets) {
      chartPayload.data = {
        labels: chartPayload.labels || [], 
        datasets: chartPayload.datasets
      };
    }

    // Caso B: L'AI ha usato "dataset" (singolare)
    if (chartPayload.data && chartPayload.data.dataset && !chartPayload.data.datasets) {
      chartPayload.data.datasets = Array.isArray(chartPayload.data.dataset) 
        ? chartPayload.data.dataset 
        : [chartPayload.data.dataset];
    }
    
    // Caso C: L'AI ha messo "dataset" alla radice
    if (!chartPayload.data && chartPayload.dataset) {
        chartPayload.data = {
            labels: chartPayload.labels || [],
            datasets: Array.isArray(chartPayload.dataset) ? chartPayload.dataset : [chartPayload.dataset]
        }
    }

    // --- 3. FINAL VALIDATION & DEBUG UI ---
    if (!chartPayload.data || !chartPayload.data.datasets) {
      console.warn("Chart data malformed:", rawPayload);
      return (
        <div className="p-3 bg-yellow-50 border border-yellow-100 rounded text-xs text-yellow-700 overflow-hidden">
           <strong>Chart data unavailable (Structure mismatch).</strong>
           <div className="mt-2 text-[10px] font-mono bg-white p-2 border border-yellow-200 rounded overflow-x-auto whitespace-pre-wrap">
             DEBUG DATA: {JSON.stringify(rawPayload, null, 2)}
           </div>
        </div>
      );
    }

    const { type, data, options } = chartPayload;
    
    const chartOptions = {
      ...options,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' as const, labels: { boxWidth: 10, font: { size: 10 } } },
        title: { display: false },
      },
      scales: {
        x: { ticks: { font: { size: 9 } } },
        y: { ticks: { font: { size: 9 } } }
      }
    };

    const style = { height: '250px', width: '100%' };

    try {
      const chartType = type ? type.toLowerCase() : 'line';
      switch (chartType) {
        case 'line':
          return <div style={style}><Line data={data} options={chartOptions} /></div>;
        case 'bar':
          return <div style={style}><Bar data={data} options={chartOptions} /></div>;
        default:
          return <div style={style}><Line data={data} options={chartOptions} /></div>;
      }
    } catch (err) {
      return <p className="text-xs text-red-500">Error rendering visualization.</p>;
    }
  };

  // Handle ESC key and click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        windowRef.current &&
        !windowRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      {/* Floating trigger button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={buttonRef}
              onClick={() => setIsOpen(!isOpen)}
              className="fixed right-5 bottom-5 z-50 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent/90 transition-all flex items-center justify-center hover:scale-105 active:scale-95"
              aria-label="Open Market Intelligence Agent"
            >
              {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            <p>Market Agent</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Popover chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={windowRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed z-[1000] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden
              right-5 bottom-24 w-[calc(100%-2.5rem)] max-w-[450px] h-[75vh] max-h-[600px]
              sm:right-5 sm:bottom-24 sm:w-[450px] sm:h-[600px]"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center gap-3 flex-shrink-0 bg-card">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Market Intelligence Agent</h3>
                <p className="text-xs text-muted-foreground">Ask about today's market</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-12">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>Ask me anything about market conditions, trends, or specific curves.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div 
                      className={`max-w-[85%] ${
                        message.role === "user" 
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3" 
                          : "space-y-3 w-full"
                      }`}
                    >
                      {message.role === "user" ? (
                        <div className="text-sm">{message.content}</div>
                      ) : (
                        // Assistant Message Layout
                        <div className="flex gap-3">
                           <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 mt-1">
                            <Sparkles className="w-4 h-4 text-accent" />
                          </div>
                          
                          <div className="flex-1 space-y-3 min-w-0">
                            {/* Text Content */}
                            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-4 shadow-sm">
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                {message.content}
                              </p>
                            </div>

                            {/* Chart Rendering */}
                            {message.chartData && (
                              <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-50">
                                  <BarChart3 className="w-4 h-4 text-accent" />
                                  <span className="text-xs font-semibold text-gray-500">Generated Chart</span>
                                </div>
                                {renderChart(message.chartData)}
                              </div>
                            )}

                            {/* Legacy Evidence Accordion (if you still use it) */}
                            {message.evidence && (
                              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                                <details className="group">
                                  <summary className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors">
                                    <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                                    View data sources
                                  </summary>
                                  <div className="px-3 pb-3 pt-1 space-y-2">
                                    <div className="flex flex-wrap gap-1">
                                      {message.evidence.metrics.map((m, i) => (
                                        <span key={i} className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                                          {m}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                   <div className="flex gap-3 max-w-[85%]">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <Loader2 className="w-4 h-4 text-accent animate-spin" />
                      </div>
                      <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-4 shadow-sm flex items-center">
                        <span className="text-xs text-muted-foreground animate-pulse">Thinking...</span>
                      </div>
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer */}
            <div className="border-t border-border p-4 space-y-3 flex-shrink-0 bg-card">
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {suggestedQuestions.map((question, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuestionClick(question)}
                      className="text-xs bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-full text-secondary-foreground transition-colors"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSend()}
                  placeholder="Ask about prices, volatility..."
                  disabled={isLoading}
                  className="flex-1 bg-muted/50 border border-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="rounded-xl w-10 h-10 bg-accent hover:bg-accent/90 shrink-0 shadow-sm"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}