import { useMemo } from "react";
import { SeverityLevel } from "./InsightCard";

interface SparklineChartProps {
  data: number[];
  type?: "line" | "area";
  severity?: SeverityLevel;
  width?: number;
  height?: number;
}

const colorMap: Record<SeverityLevel, { stroke: string; fill: string }> = {
  high: { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.1)" },
  medium: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.1)" },
  low: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.1)" },
};

export function SparklineChart({ 
  data, 
  type = "line", 
  severity = "low",
  width = 200,   // Used as internal coordinate resolution
  height = 48,   // Used as internal coordinate resolution
}: SparklineChartProps) {
  
  // 1. Calculate Paths and Peak Coordinates
  const { path, areaPath, peak } = useMemo(() => {
    if (data.length === 0) return { path: "", areaPath: "", peak: null };
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    // Calculate Padding (to avoid clipping peak/trough)
    const padding = 4;
    const availableHeight = height - (padding * 2);

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      // Invert Y because SVG 0 is at top
      const normalizedValue = (value - min) / range;
      const y = height - padding - (normalizedValue * availableHeight);
      return { x, y, normalizedValue };
    });
    
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    
    const area = `${linePath} L ${width} ${height} L 0 ${height} Z`;
    
    // Find peak for the dot
    // We use the last occurrence of the max value, or change logic as needed
    const maxVal = Math.max(...data);
    const maxIndex = data.findIndex(d => d === maxVal); 
    const peakPoint = points[maxIndex];

    // Calculate percentages for the HTML Overlay
    // We use percentages so they align perfectly regardless of how the SVG is stretched
    const peakPercentX = (peakPoint.x / width) * 100;
    const peakPercentY = (peakPoint.y / height) * 100;

    return { 
        path: linePath, 
        areaPath: area, 
        peak: { x: peakPercentX, y: peakPercentY } 
    };
  }, [data, width, height]);

  const colors = colorMap[severity];

  return (
    <div className="relative w-full h-full">
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${width} ${height}`} 
        preserveAspectRatio="none"
        className="overflow-visible" // Helps avoid clipping stroke at edges
      >
        {type === "area" && (
          <path
            d={areaPath}
            fill={colors.fill}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" // Keeps stroke crisp if scaled significantly
        />
      </svg>

      {/* 2. HTML Overlay for the Dot 
        This div sits on top of the SVG. Since it's HTML, 
        it won't be distorted by the SVG's non-uniform scaling.
      */}
      {peak && (
        <div 
          style={{ 
            left: `${peak.x}%`, 
            top: `${peak.y}%`,
            backgroundColor: colors.stroke,
            boxShadow: `0 0 0 2px white, 0 0 0 4px ${colors.fill}`
          }}
          className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2"
        />
      )}
    </div>
  );
}