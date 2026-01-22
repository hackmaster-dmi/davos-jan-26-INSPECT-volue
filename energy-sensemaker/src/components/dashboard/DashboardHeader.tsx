import { Calendar, Zap, FileDown, Download, Printer } from "lucide-react"; // Added FileDown icon
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Image from "next/image";

const regions = [
  { code: "CH", name: "Switzerland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "AT", name: "Austria" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "SE", name: "Sweden" },
  { code: "FI", name: "Finland" },
  { code: "DK", name: "Denmark" },
  { code: "BE", name: "Belgium" },
  { code: "GB", name: "United Kingdom" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" },
  { code: "ES", name: "Spain" },
  { code: "PT", name: "Portugal" },
];


interface DashboardHeaderProps {
  date: Date;
  setDate: (date: Date) => void;
  region: string;
  setRegion: (region: string) => void;
  onExport?: () => void; // New prop for export action
}

export function DashboardHeader({ date, setDate, region, setRegion, onExport }: DashboardHeaderProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleExportPdf = () => {
    console.log("Generating PDF for:", format(date, "yyyy-MM-dd"), region);
    // Future PDF generation logic goes here
  };

  return (
    <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8 print:hidden">
      <div className="flex items-center gap-4">
          <img src="/logo_dark.svg" alt="Energy Logo" className="w-12 h-12" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Daily Energy Market Brief</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live Analysis · {regions.find(r => r.code === region)?.name} · {format(date, "MMM d, yyyy")}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {/* LIVE REGION SELECTOR */}
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-[180px] bg-card border-border shadow-sm">
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            {regions.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                    {r.name} ({r.code})
                </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* LIVE DATE PICKER */}
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal bg-card border-border shadow-sm", !date && "text-muted-foreground")}>
              <Calendar className="mr-2 h-4 w-4" />
              {date ? format(date, "MMM d, yyyy") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-card border-border z-[9999]" align="end">
            <CalendarComponent
              mode="single"
              selected={date}
              onSelect={(d) => {
                if (d) {
                  setDate(d); // DIRECT UPDATE -> Triggers Index.tsx useEffect
                  setIsCalendarOpen(false);
                }
              }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        
        {/* EXPORT BUTTON (Placeholder) */}
        <Button 
          onClick={onExport} 
          className="bg-[#333670] text-accent-foreground hover:bg-accent/90 font-medium px-6 gap-2"
        >
          <Download className="w-4 h-4" />
          Export PDF
        </Button>
      </div>
    </header>
  );
}

export default DashboardHeader;
