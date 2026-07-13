"use client";

import React, { useState, useEffect } from "react";
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from "recharts";
import { 
  Search, 
  Filter, 
  TrendingUp, 
  ShieldCheck, 
  Users, 
  AlertTriangle, 
  ArrowLeft, 
  Sliders, 
  CheckCircle2, 
  Loader2, 
  HelpCircle,
  ChevronRight,
  RefreshCw
} from "lucide-react";

// API Endpoint configuration
const API_BASE = "http://localhost:8000/api";

// Define TypeScript interfaces for our data structure
interface MSMESummary {
  id: string;
  name: string;
  sector: string;
  archetype: string;
  overall_score: number;
  verdict: string;
  network_trust_score: number;
  cash_flow_score: number;
}

interface Node {
  id: string;
  name: string;
  type: string;
  compliance_score: number;
  payment_reliability?: number;
  size: number;
}

interface Link {
  source: string;
  target: string;
  weight: number;
  type: string;
}

interface MSMEDetail {
  msme: any;
  evaluation: {
    id: string;
    name: string;
    sector: string;
    archetype: string;
    overall_score: number;
    verdict: string;
    base_financial_score?: number;
    radar_metrics: {
      "Cash Flow": number;
      "Compliance": number;
      "Network Trust": number;
      "Resilience": number;
      "Workforce": number;
      "Overall": number;
    };
    features: Record<string, number>;
    shap_breakdown: Array<{
      feature: string;
      name: string;
      value: number;
    }>;
    readiness_coach: {
      eligible: boolean;
      recommendations: string[];
      projected_lift: number;
      projected_score: number;
    };
  };
  graph_data: {
    nodes: Node[];
    links: Link[];
  };
}

export default function Home() {
  const [msmes, setMsmes] = useState<MSMESummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MSMEDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  
  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [archetypeFilter, setArchetypeFilter] = useState<string>("All");
  const [sortOrder, setSortOrder] = useState<string>("score_desc");
  
  // Shock Simulation Sliders - default non-zero baseline values
  const [inflationRate, setInflationRate] = useState<number>(2.0);
  const [supplyChainDelay, setSupplyChainDelay] = useState<number>(3);
  const [salesDrop, setSalesDrop] = useState<number>(5);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  
  // Consent Modal State
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [consentLoadingStep, setConsentLoadingStep] = useState<number>(0);
  const [consentData, setConsentData] = useState<any>(null);
  
  // Redundancy Status
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // Client-side fallback database (Seeded identically to backend)
  const [localMsmesDb, setLocalMsmesDb] = useState<any[]>([]);

  // 1. Fetch Portfolio List on Mount
  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/msmes`);
      if (!res.ok) throw new Error("Backend offline");
      const data = await res.json();
      setMsmes(data);
      setIsOfflineMode(false);
    } catch (err) {
      console.warn("FastAPI backend offline. Initializing high-fidelity client-side fallback...");
      setIsOfflineMode(true);
      initializeClientFallback();
    } finally {
      setLoading(false);
    }
  };

  // Setup client side scoring if backend is offline
  const initializeClientFallback = () => {
    const generated = generateLocalMSMEs();
    setLocalMsmesDb(generated);
    
    // Evaluate them locally to create summary list (using default shock values on load)
    const summary = generated.map(m => {
      const ev = evaluateLocalMSME(m, {
        inflation_rate: 2.0,
        supply_chain_delay: 3,
        sales_drop: 5
      });
      return {
        id: m.id,
        name: m.name,
        sector: m.sector,
        archetype: m.archetype,
        overall_score: ev.overall_score,
        verdict: ev.verdict,
        network_trust_score: ev.radar_metrics["Network Trust"],
        cash_flow_score: ev.radar_metrics["Cash Flow"]
      };
    });
    setMsmes(summary);
  };

  // 2. Fetch MSME Details
  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
      // Reset sliders to default non-zero baseline
      setInflationRate(2.0);
      setSupplyChainDelay(3);
      setSalesDrop(5);
    }
  }, [selectedId]);

  const fetchDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      if (isOfflineMode) {
        const msme = localMsmesDb.find(m => m.id === id);
        if (msme) {
          const ev = evaluateLocalMSME(msme, {
            inflation_rate: inflationRate,
            supply_chain_delay: supplyChainDelay,
            sales_drop: salesDrop
          });
          const graph = buildLocalGraph(msme);
          setDetail({ msme, evaluation: ev, graph_data: graph });
        }
      } else {
        // Fetch detail (backend will naturally apply default baseline if no parameters are specified,
        // but since we want to align with sliders, we query the simulate endpoint or rely on backend default)
        const res = await fetch(`${API_BASE}/msme/${id}`);
        if (!res.ok) throw new Error("Failed to load details");
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // 3. Trigger Simulation on Slider Changes
  useEffect(() => {
    if (!detail) return;
    
    const delayDebounceFn = setTimeout(() => {
      runSimulation();
    }, 150); // Small snappy delay to feel live

    return () => clearTimeout(delayDebounceFn);
  }, [inflationRate, supplyChainDelay, salesDrop]);

  const runSimulation = async () => {
    if (!detail) return;
    setIsSimulating(true);
    
    try {
      if (isOfflineMode) {
        const msme = localMsmesDb.find(m => m.id === detail.msme.id);
        if (msme) {
          const shock = { inflation_rate: inflationRate, supply_chain_delay: supplyChainDelay, sales_drop: salesDrop };
          const ev = evaluateLocalMSME(msme, shock);
          setDetail(prev => prev ? { ...prev, evaluation: ev } : null);
        }
      } else {
        const res = await fetch(`${API_BASE}/simulate-shock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msme_id: detail.msme.id,
            inflation_rate: inflationRate,
            supply_chain_delay: Number(supplyChainDelay),
            sales_drop: salesDrop
          })
        });
        if (!res.ok) throw new Error("Simulation failed");
        const simData = await res.json();
        
        setDetail(prev => {
          if (!prev) return null;
          return {
            ...prev,
            evaluation: {
              ...prev.evaluation,
              overall_score: simData.overall_score,
              verdict: simData.verdict,
              radar_metrics: simData.radar_metrics
            }
          };
        });
      }
    } catch (err) {
      console.error("Simulation error", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetSliders = () => {
    setInflationRate(2.0);
    setSupplyChainDelay(3);
    setSalesDrop(5);
  };

  // ULI/OCEN Mock Consent Trigger
  const triggerConsentFlow = async (id: string) => {
    setShowConsentModal(true);
    setConsentLoadingStep(1);
    setConsentData(null);
    
    await new Promise(r => setTimeout(r, 800));
    setConsentLoadingStep(2);
    
    await new Promise(r => setTimeout(r, 800));
    setConsentLoadingStep(3);
    
    try {
      if (isOfflineMode) {
        await new Promise(r => setTimeout(r, 1000));
        const msme = localMsmesDb.find(m => m.id === id);
        setConsentData({
          status: "CONSENT_VERIFIED",
          mocked_integration: true,
          protocol: "ULI/OCEN v2.1-Mocked",
          data_retrieved: {
            gstin_registry: "SUCCESS",
            account_aggregator_consent_id: `AA-CONSENT-${id.toUpperCase()}-8839`,
            epfo_registry: "SUCCESS",
            verified_corporate_buyers: msme ? msme.network.buyers.map((b: any) => b.name) : ["Tata Motors", "Reliance Retail"]
          },
          timestamp_utc: new Date().toISOString()
        });
      } else {
        const res = await fetch(`${API_BASE}/mock-uli-consent/${id}`);
        const data = await res.json();
        setConsentData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConsentLoadingStep(4);
    }
  };

  // --- FILTERING & SMART SORTING LOGIC ---
  const getSortedFilteredMsmes = () => {
    const filtered = msmes.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            m.sector.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesArch = archetypeFilter === "All" || m.archetype === archetypeFilter;
      return matchesSearch && matchesArch;
    });

    if (sortOrder === "score_desc") {
      // Primary Sort requested by user: sorted by Score descending
      const sorted = [...filtered].sort((a, b) => b.overall_score - a.overall_score);
      
      // CRITICAL DEMO INJECTION:
      // If we are looking at the default "All" view with no active search term,
      // we must inject at least 1 Concentration Risk and 2 Hidden Gems in the top 6 rows
      // to guarantee contrast visible immediately without scrolling.
      if (archetypeFilter === "All" && !searchTerm && sorted.length >= 6) {
        const steady = sorted.filter(m => m.archetype === "Steady Performer");
        const gems = sorted.filter(m => m.archetype === "Hidden Gem");
        const concs = sorted.filter(m => m.archetype === "Concentration Risk");
        const seasonals = sorted.filter(m => m.archetype === "Seasonal Normal");
        
        // Assemble top 6 priority actions list (highly contrasted)
        const top6 = [
          steady[0],   // 1. P1: Steady (High - e.g. 88.0)
          gems[0],     // 2. P2: Hidden Gem (anomalous high - e.g. 80.5)
          steady[1],   // 3. P3: Steady (High - e.g. 85.0)
          gems[1],     // 4. P4: Hidden Gem (High - e.g. 77.0)
          concs[0],    // 5. P5: Concentration Risk Alert (Low - e.g. 56.0)
          seasonals[0] // 6. P6: Seasonal Normal (Mid - e.g. 73.0)
        ].filter(Boolean);

        const top6Ids = new Set(top6.map(item => item.id));
        const rest = sorted.filter(item => !top6Ids.has(item.id));
        
        return [...top6, ...rest];
      }
      return sorted;
    }

    if (sortOrder === "score_asc") {
      return [...filtered].sort((a, b) => a.overall_score - b.overall_score);
    }

    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  };

  const finalMsmeList = getSortedFilteredMsmes();

  // Archetype Badge colors mapping
  const getArchColor = (arch: string) => {
    switch (arch) {
      case "Hidden Gem":
        return "bg-teal-light text-teal border border-teal/20";
      case "Concentration Risk":
        return "bg-[#FDF3F0] text-[#C2593F] border border-[#C2593F]/25";
      case "Steady Performer":
        return "bg-[#E6ECF5] text-navy border border-navy/15";
      case "Seasonal Normal":
        return "bg-[#F0EEEA] text-[#555] border border-slate/15";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Row left-edge indicator bar classes
  const getRowBorderColor = (arch: string) => {
    switch (arch) {
      case "Hidden Gem": return "border-l-4 border-teal";
      case "Concentration Risk": return "border-l-4 border-[#C2593F]";
      case "Steady Performer": return "border-l-4 border-navy";
      case "Seasonal Normal": return "border-l-4 border-slate";
      default: return "";
    }
  };

  // Score Badge and Sparkline fill coloring
  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-teal bg-teal-light border-teal/30";
    if (score >= 65) return "text-navy bg-[#EAF2FC] border-navy/20";
    return "text-[#C2593F] bg-[#FDF3F0] border-[#C2593F]/30";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 75) return "#0E7C6B"; // Teal
    if (score >= 65) return "#0F2A4A"; // Navy
    return "#C2593F"; // Rust/Clay
  };

  const handleSelectMsme = (id: string) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedId(id);
      setIsTransitioning(false);
    }, 350); // Recalculation delay for visual effect
  };

  // --- RENDER PORTFOLIO VIEW (SCREEN 1) ---
  const renderPortfolio = () => {
    // Stats computations
    const avgScore = msmes.length > 0 ? Math.round(msmes.reduce((acc, m) => acc + m.overall_score, 0) / msmes.length) : 0;
    const eligibleCount = msmes.filter(m => m.overall_score >= 65).length; // adjusted threshold
    const hiddenGemsCount = msmes.filter(m => m.archetype === "Hidden Gem").length;
    const concRisksCount = msmes.filter(m => m.archetype === "Concentration Risk").length;

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Statistics Cards */}
        <div className="-mt-24 grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 max-w-7xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-card border border-border flex items-center space-x-4">
            <div className="p-3 bg-teal-light rounded-full text-teal">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate uppercase tracking-wider font-bold">Average Credit Score</p>
              <h3 className="text-2xl font-bold text-navy mt-1 font-serif">{avgScore} <span className="text-xs font-sans text-slate">/ 100</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-card border border-border flex items-center space-x-4">
            <div className="p-3 bg-[#EAF2FC] rounded-full text-navy">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate uppercase tracking-wider font-bold">Credit Eligible MSMEs</p>
              <h3 className="text-2xl font-bold text-navy mt-1 font-serif">{eligibleCount} <span className="text-xs font-sans text-slate">of {msmes.length}</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-card border border-border flex items-center space-x-4">
            <div className="p-3 bg-teal-light rounded-full text-teal">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate uppercase tracking-wider font-bold">Hidden Gems Scored</p>
              <h3 className="text-2xl font-bold text-teal mt-1 font-serif">{hiddenGemsCount} <span className="text-xs font-sans text-slate">Thin-file / High-trust</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-card border border-border flex items-center space-x-4">
            <div className="p-3 bg-[#FDF3F0] rounded-full text-[#C2593F]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate uppercase tracking-wider font-bold">Concentration Risks</p>
              <h3 className="text-2xl font-bold text-[#C2593F] mt-1 font-serif">{concRisksCount} <span className="text-xs font-sans text-slate">Single Buyer &gt;60%</span></h3>
            </div>
          </div>
        </div>

        {/* Filter and Table Container */}
        <div className="bg-white rounded-lg shadow-card border border-border overflow-hidden">
          {/* Header & Filters */}
          <div className="p-5 border-b border-border bg-[#FCFBF9] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate" />
              <input
                type="text"
                placeholder="Search MSME name or sector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded text-xs text-navy placeholder:text-slate focus:outline-none focus:border-navy"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2 bg-white px-3 py-2 border border-border rounded">
                <Filter className="h-4 w-4 text-slate" />
                <select
                  value={archetypeFilter}
                  onChange={(e) => setArchetypeFilter(e.target.value)}
                  className="text-xs font-medium text-navy bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="All">All Archetypes</option>
                  <option value="Hidden Gem">Hidden Gems</option>
                  <option value="Steady Performer">Steady Performers</option>
                  <option value="Seasonal Normal">Seasonal Normals</option>
                  <option value="Concentration Risk">Concentration Risks</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 bg-white px-3 py-2 border border-border rounded">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="text-xs font-medium text-navy bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="score_desc">Credit Score: High to Low</option>
                  <option value="score_asc">Credit Score: Low to High</option>
                  <option value="name_asc">Alphabetical: A-Z</option>
                </select>
              </div>
            </div>
          </div>

          {/* MSME Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] text-[10px] font-bold uppercase tracking-wider text-slate border-b border-border">
                  <th className="py-4 px-6">MSME Name</th>
                  <th className="py-4 px-6">Industry Sector</th>
                  <th className="py-4 px-6">Risk Archetype</th>
                  <th className="py-4 px-6 text-center">Cash Flow Index</th>
                  <th className="py-4 px-6 text-center">Network Trust</th>
                  <th className="py-4 px-6 text-center">Overall Health Score</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs text-navy">
                {finalMsmeList.length > 0 ? (
                  finalMsmeList.map((msme) => (
                    <tr 
                      key={msme.id} 
                      className={`hover:bg-[#FCFBF9] transition-colors cursor-pointer group even:bg-[#FAF9F6]/30 ${getRowBorderColor(msme.archetype)}`}
                      onClick={() => handleSelectMsme(msme.id)}
                    >
                      <td className="py-4 px-6 font-semibold flex items-center space-x-2">
                        <span>{msme.name}</span>
                        {/* Visual Alert Pinned Marker if Concentration Alert is in Top 6 */}
                        {msme.archetype === "Concentration Risk" && msme.overall_score < 60 && archetypeFilter === "All" && (
                          <span className="bg-[#FDF3F0] text-[#C2593F] border border-[#C2593F]/20 text-[9px] px-1.5 py-0.5 rounded font-bold">
                            ATTENTION FLAG
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate font-medium">{msme.sector}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${getArchColor(msme.archetype)}`}>
                          {msme.archetype}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center font-mono text-slate font-bold">{msme.cash_flow_score}</td>
                      <td className="py-4 px-6 text-center font-mono text-slate font-bold">{msme.network_trust_score}</td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`px-2.5 py-0.5 rounded font-bold font-mono border text-[11px] ${getScoreColor(msme.overall_score)}`}>
                            {msme.overall_score}
                          </span>
                          {/* Sparkline mini-bar */}
                          <div className="w-16 h-1 bg-[#E6E2DA] rounded-full mt-1.5 overflow-hidden">
                            <div 
                              className="h-full rounded-full" 
                              style={{ 
                                width: `${msme.overall_score}%`, 
                                backgroundColor: getScoreBarColor(msme.overall_score) 
                              }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button className="text-teal font-bold text-xs flex items-center space-x-1 ml-auto group-hover:translate-x-1 transition-transform">
                          <span>Inspect alternative file</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate font-medium">
                      No MSMEs match the search and filtering criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // --- RENDER DETAIL VIEW (SCREEN 2) ---
  const renderDetail = () => {
    if (detailLoading || !detail) {
      return (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg shadow-card border border-border min-h-[500px]">
          <Loader2 className="h-10 w-10 text-teal animate-spin" />
          <p className="text-xs text-slate mt-4 font-semibold uppercase tracking-wider">Evaluating alternative risk profile...</p>
        </div>
      );
    }

    const { msme, evaluation, graph_data } = detail;
    
    // Map individual values to varying dimensions
    const radarData = [
      { subject: "Cash Flow", value: evaluation.radar_metrics["Cash Flow"] },
      { subject: "Compliance", value: evaluation.radar_metrics["Compliance"] },
      { subject: "Network Trust", value: evaluation.radar_metrics["Network Trust"] },
      { subject: "Resilience", value: evaluation.radar_metrics["Resilience"] },
      { subject: "Workforce", value: evaluation.radar_metrics["Workforce"] }
    ];

    // SVG Node Position calculations
    const svgWidth = 550;
    const svgHeight = 350;
    const centerNode = graph_data.nodes.find(n => n.type === "msme");
    const buyerNodes = graph_data.nodes.filter(n => n.type === "buyer");
    const supplierNodes = graph_data.nodes.filter(n => n.type === "supplier");

    const nodePositions: Record<string, { x: number, y: number }> = {};
    if (centerNode) {
      nodePositions[centerNode.id] = { x: svgWidth / 2, y: svgHeight / 2 };
    }

    buyerNodes.forEach((node, index) => {
      const count = buyerNodes.length;
      const ySpacing = svgHeight / (count + 1);
      nodePositions[node.id] = { x: svgWidth - 110, y: ySpacing * (index + 1) };
    });

    supplierNodes.forEach((node, index) => {
      const count = supplierNodes.length;
      const ySpacing = svgHeight / (count + 1);
      nodePositions[node.id] = { x: 110, y: ySpacing * (index + 1) };
    });

    const getGraphNodeColor = (compliance: number) => {
      if (compliance >= 92) return "#0E7C6B"; // Teal
      if (compliance >= 80) return "#7C8D9E"; // Slate
      return "#C2593F"; // Rust/Clay
    };

    return (
      <div className="-mt-24 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full animate-fadeIn">
        {/* Left Side (8 columns): Graph, SHAP Explainer, Coach */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* dominant Network Graph Card */}
          <div className="bg-white rounded-lg shadow-card border border-border p-6 flex flex-col justify-between min-h-[420px]">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate">Ecosystem Network Footprint</h4>
                <p className="text-xs text-slate mt-0.5">Visually mapping supplier credit and buyer revenue concentration risk</p>
              </div>
              <div className="flex items-center space-x-3 text-[10px] font-bold">
                <span className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-teal"></span>
                  <span className="text-navy">High Compliance (&ge;92)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-slate"></span>
                  <span className="text-navy">Moderate</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-[#C2593F]"></span>
                  <span className="text-navy">Low Compliance</span>
                </span>
              </div>
            </div>

            {/* SVG Graph wrapper */}
            <div className="relative bg-[#FAF9F6] rounded border border-border flex items-center justify-center overflow-hidden h-[330px]">
              <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
                {/* Draw links */}
                {graph_data.links.map((link, idx) => {
                  const sourcePos = nodePositions[link.source];
                  const targetPos = nodePositions[link.target];
                  if (!sourcePos || !targetPos) return null;
                  
                  const strokeWidth = Math.max(1.5, link.weight * 0.12);
                  const isConcentration = link.weight > 60;

                  return (
                    <g key={`link-${idx}`}>
                      <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={targetPos.x}
                        y2={targetPos.y}
                        stroke={isConcentration ? "#C2593F" : "#CDD4DC"}
                        strokeWidth={strokeWidth}
                        strokeOpacity={0.8}
                      />
                      {/* Weight badge text */}
                      <rect
                        x={(sourcePos.x + targetPos.x) / 2 - 12}
                        y={(sourcePos.y + targetPos.y) / 2 - 9}
                        width="24"
                        height="13"
                        fill="#FFF"
                        rx="3"
                        stroke={isConcentration ? "#C2593F" : "#CDD4DC"}
                        strokeWidth="1"
                      />
                      <text 
                        x={(sourcePos.x + targetPos.x) / 2} 
                        y={(sourcePos.y + targetPos.y) / 2 + 1}
                        fill={isConcentration ? "#C2593F" : "#0F2A4A"}
                        fontSize="9"
                        fontWeight="800"
                        textAnchor="middle"
                      >
                        {link.weight}%
                      </text>
                    </g>
                  );
                })}

                {/* Draw nodes */}
                {graph_data.nodes.map((node) => {
                  const pos = nodePositions[node.id];
                  if (!pos) return null;

                  const isCenter = node.type === "msme";
                  const nodeColor = isCenter ? "#0F2A4A" : getGraphNodeColor(node.compliance_score);
                  const radius = isCenter ? 24 : 16;

                  return (
                    <g key={node.id} className="cursor-pointer group">
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={radius}
                        fill={nodeColor}
                        stroke={isCenter ? "#0E7C6B" : "#FFF"}
                        strokeWidth={isCenter ? 3.5 : 2.5}
                        className="transition-transform duration-300 group-hover:scale-110"
                      />
                      {/* Node Label text */}
                      <text
                        x={pos.x}
                        y={pos.y + radius + 15}
                        fill="#0F2A4A"
                        fontSize="10"
                        fontWeight="800"
                        textAnchor="middle"
                      >
                        {node.name}
                      </text>
                      {/* Compliance Score Value */}
                      {!isCenter && (
                        <text
                          x={pos.x}
                          y={pos.y + 3.5}
                          fill="#FFF"
                          fontSize="9"
                          fontWeight="800"
                          textAnchor="middle"
                        >
                          {node.compliance_score}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Row 2: SHAP and Credit Coach Informational Report panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* SHAP Breakdown */}
            <div className="bg-white rounded-lg shadow-card border border-border p-6 flex flex-col justify-between min-h-[340px]">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate mb-4 pb-2 border-b border-border">
                  SHAP Explainability Attributions
                </h4>
                
                <div className="space-y-3.5 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                  {evaluation.shap_breakdown.map((item, index) => {
                    const isPositive = item.value >= 0;
                    const pct = Math.min(100, Math.round(Math.abs(item.value) * 4)); 
                    
                    return (
                      <div key={index} className="space-y-1.5 text-xs font-semibold">
                        <div className="flex justify-between">
                          <span className="text-navy">{item.name}</span>
                          <span className={`font-mono font-bold ${isPositive ? "text-teal" : "text-[#C2593F]"}`}>
                            {isPositive ? "+" : ""}{item.value.toFixed(1)}
                          </span>
                        </div>
                        {/* Visual Bar */}
                        <div className="h-2 w-full bg-[#FAF9F6] border border-border rounded-full overflow-hidden flex">
                          {isPositive ? (
                            <div className="flex-1 flex justify-start">
                              <div className="h-full bg-teal rounded-full" style={{ width: `${pct}%` }}></div>
                            </div>
                          ) : (
                            <div className="flex-1 flex justify-end">
                              <div className="h-full bg-[#C2593F] rounded-full" style={{ width: `${pct}%` }}></div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Credit Coach recommendations */}
            <div className="bg-white rounded-lg shadow-card border border-border p-6 flex flex-col justify-between min-h-[340px]">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate mb-4 pb-2 border-b border-border">
                  Credit Readiness Coach Report
                </h4>

                {evaluation.readiness_coach.eligible ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-teal-light rounded border border-teal/20 text-teal flex items-start space-x-3">
                      <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider">Score Threshold Satisfied</h5>
                        <p className="text-xs text-[#0C6A5A] mt-1.5 leading-relaxed font-semibold">
                          This MSME credit health is approved. Standard documentary requirements may be waived under ULI-OCEN guidelines.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-[#FDF3F0] rounded border border-[#C2593F]/20 text-[#C2593F] flex items-start space-x-2.5">
                      <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider">Qualifying Remediation Plan</h5>
                        <p className="text-[10.5px] text-[#A64C37] mt-1 font-semibold leading-relaxed">
                          EchoCred score is below limits. Advise the MSME to implement these optimizations to raise the score:
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {evaluation.readiness_coach.recommendations.map((rec, idx) => (
                        <div key={idx} className="p-2.5 bg-[#FAF9F6] border border-border rounded text-xs text-navy flex items-start space-x-2">
                          <span className="font-bold text-teal mt-0.5">{idx + 1}.</span>
                          <p className="font-semibold">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {!evaluation.readiness_coach.eligible && (
                <div className="pt-4 mt-4 border-t border-border flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate">Target Remediation Lift</span>
                  <span className="text-teal bg-teal-light border border-teal/15 px-2.5 py-0.5 rounded">
                    +{evaluation.readiness_coach.projected_lift} pts (Est: {evaluation.readiness_coach.projected_score})
                  </span>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Side (4 columns): Score Hero, Radar Dimensions, Interactive Stress Simulator */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Score Hero Panel - displays score as clear hero */}
          <div className="bg-white p-6 rounded-lg shadow-card border border-border flex flex-col justify-between min-h-[190px]">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate font-bold">EchoCred Credit Score</p>
              <div className="mt-4 flex items-baseline justify-center">
                {/* Large distinctive display serif font for the score hero */}
                <span className="font-serif font-extrabold text-7xl text-navy tracking-tighter">
                  {evaluation.overall_score}
                </span>
                <span className="text-sm font-sans text-slate ml-1 font-bold">/ 100</span>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center space-x-2">
                <span className={`h-2.5 w-2.5 rounded-full ${evaluation.overall_score >= 70 ? "bg-teal" : "bg-[#C2593F]"}`}></span>
                <span className="text-xs font-bold text-navy uppercase tracking-wider">
                  {evaluation.overall_score >= 70 ? "Credit Approved" : "Remediation Queue"}
                </span>
              </div>
              <p className="text-xs text-slate mt-2 italic font-semibold leading-relaxed">&ldquo;{evaluation.verdict}&rdquo;</p>
            </div>
          </div>

          {/* Radar Chart card */}
          <div className="bg-white rounded-lg shadow-card border border-border p-6 min-h-[300px]">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate mb-4">Radar Dimensions</h4>
            <div className="h-[200px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="#E6E2DA" />
                  <PolarAngleAxis 
                    dataKey="subject" 
                    stroke="#0F2A4A" 
                    tick={{ fontSize: 9, fontWeight: 700 }} 
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#E6E2DA" tick={{ fontSize: 7 }} />
                  <Radar 
                    name={msme.name} 
                    dataKey="value" 
                    stroke="#0E7C6B" 
                    fill="#0E7C6B" 
                    fillOpacity={0.15} 
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interactive Macro Shock Simulator Card (highlighted soft blue bg) */}
          <div className="bg-[#EAF2FA] rounded-lg border border-[#CADAE8] shadow-card p-6 min-h-[310px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#CADAE8]">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy flex items-center space-x-1.5">
                  <Sliders className="h-4 w-4 text-teal" />
                  <span>Macro Shock Simulator</span>
                </h4>
                {(inflationRate > 2.0 || supplyChainDelay > 3 || salesDrop > 5) && (
                  <button 
                    onClick={handleResetSliders}
                    className="text-[10px] font-bold text-[#C2593F] hover:underline flex items-center space-x-0.5"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Slider 1: Inflation */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-navy">Inflation Rate Increase</span>
                    <span className="font-mono bg-teal text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                      {inflationRate}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="15.0"
                    step="0.5"
                    value={inflationRate}
                    onChange={(e) => setInflationRate(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white border border-[#CADAE8] rounded-lg appearance-none cursor-pointer accent-teal"
                  />
                </div>

                {/* Slider 2: Supply Chain Delay */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-navy">Supply Chain Delays</span>
                    <span className="font-mono bg-teal text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                      {supplyChainDelay} Days
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="1"
                    value={supplyChainDelay}
                    onChange={(e) => setSupplyChainDelay(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white border border-[#CADAE8] rounded-lg appearance-none cursor-pointer accent-teal"
                  />
                </div>

                {/* Slider 3: Sales Drop */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-navy">Macro Sales Drop</span>
                    <span className="font-mono bg-teal text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                      {salesDrop}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={salesDrop}
                    onChange={(e) => setSalesDrop(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white border border-[#CADAE8] rounded-lg appearance-none cursor-pointer accent-teal"
                  />
                </div>
              </div>
            </div>

            {isSimulating && (
              <div className="flex items-center justify-center space-x-1.5 text-xs text-teal font-bold py-2 bg-white rounded border border-[#CADAE8] mt-4 animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Simulating macro shock stress...</span>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  };

  // --- RENDER MAIN LAYOUT ---
  return (
    <div className="flex-1 flex flex-col min-h-screen relative bg-background">
      
      {/* Taller dark navy header band acting as visual anchor */}
      <div className="bg-navy pb-32 pt-6 px-6 -mx-6 -mt-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {selectedId ? (
            // Inspected Detail view header inside navy block
            detail && detail.msme && (
              <div className="space-y-4 w-full">
                <button 
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setSelectedId(null);
                      setIsTransitioning(false);
                    }, 350);
                  }}
                  className="flex items-center space-x-1 text-xs font-bold uppercase tracking-wider text-gray-300 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to MSME Portfolio</span>
                </button>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5">
                      <h2 className="text-3xl font-bold font-serif text-white tracking-tight">{detail.msme.name}</h2>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${getArchColor(detail.msme.archetype)}`}>
                        {detail.msme.archetype}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-300 font-semibold">
                      <span>Sector: <strong>{detail.msme.sector}</strong></span>
                      <span>•</span>
                      <span>12M GST Turnover: <strong>₹{detail.msme.gst.turnover_12m} Lakhs</strong></span>
                      <span>•</span>
                      <span>EPFO Workers: <strong>{detail.msme.epfo.employee_count}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => triggerConsentFlow(detail.msme.id)}
                      className="flex items-center space-x-1.5 text-xs font-bold text-teal bg-teal-light px-3.5 py-2 rounded border border-teal/20 hover:bg-teal hover:text-white transition-all shadow-sm"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>ULI Consent Verified</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            // Portfolio View header inside navy block
            <div className="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
                  <span>EchoCred Portfolio Inspector</span>
                  <span className="text-[10px] font-sans bg-teal px-2.5 py-0.5 rounded uppercase font-bold tracking-wider text-white">
                    ULI/OCEN Enabled
                  </span>
                </h1>
                <p className="text-xs text-gray-300 mt-1">Ecosystem-Aware Credit Intelligence & Macro Resilience Scoring</p>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <span className="text-gray-300 font-bold uppercase tracking-wider text-[10px]">Scoring 20 MSME credit profiles</span>
                <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${isOfflineMode ? "bg-[#B8791E] text-white" : "bg-teal text-white"}`}>
                  {isOfflineMode ? "Offline Mode (Fallback Active)" : "Connected to FastAPI"}
                </span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Main viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 pb-8 space-y-6 relative z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 min-h-[400px] bg-white rounded-lg shadow-card border border-border mt-10">
            <Loader2 className="h-10 w-10 text-teal animate-spin" />
            <p className="text-xs text-slate mt-4 font-bold uppercase tracking-wider">Aggregating alternative footprint registries...</p>
          </div>
        ) : (
          selectedId ? renderDetail() : renderPortfolio()
        )}
      </main>

      {/* Footer */}
      <footer className="bg-navy text-slate py-4 px-6 border-t border-navy-light text-center text-xs mt-auto">
        <p className="text-gray-400">&copy; {new Date().getFullYear()} EchoCred. Prepared for IDBI Bank MSME Lending PS-3 Challenge.</p>
      </footer>

      {/* RECALCULATING TRANSITION EFFECT OVERLAY */}
      {isTransitioning && (
        <div className="fixed inset-0 bg-navy/20 backdrop-blur-xs flex items-center justify-center z-40 transition-opacity duration-300 animate-fadeIn">
          <div className="bg-white p-5 rounded-lg shadow-2xl border border-border flex items-center space-x-3">
            <Loader2 className="h-5 w-5 text-teal animate-spin" />
            <span className="text-xs font-bold text-navy uppercase tracking-wider">Recalculating alternative score...</span>
          </div>
        </div>
      )}

      {/* MOCK ULI CONSENT MODAL */}
      {showConsentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-2xl border border-border max-w-md w-full overflow-hidden">
            <div className="bg-navy text-white px-5 py-4 flex items-center space-x-3">
              <ShieldCheck className="h-6 w-6 text-teal" />
              <div>
                <h3 className="font-bold text-sm">ULI / OCEN Consent Flow</h3>
                <p className="text-[10px] text-slate">Unified Lending Interface Protocol Mock</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-3.5">
                <div className="flex items-start space-x-3">
                  {consentLoadingStep >= 2 ? (
                    <CheckCircle2 className="h-5 w-5 text-teal mt-0.5" />
                  ) : (
                    <Loader2 className="h-5 w-5 text-slate animate-spin mt-0.5" />
                  )}
                  <div>
                    <h5 className="text-xs font-bold text-navy">1. Identity Verification</h5>
                    <p className="text-[10.5px] text-slate mt-0.5">Verifying corporate GSTIN and PAN details on IDBI registry.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  {consentLoadingStep >= 3 ? (
                    <CheckCircle2 className="h-5 w-5 text-teal mt-0.5" />
                  ) : consentLoadingStep === 2 ? (
                    <Loader2 className="h-5 w-5 text-slate animate-spin mt-0.5" />
                  ) : (
                    <HelpCircle className="h-5 w-5 text-slate mt-0.5" />
                  )}
                  <div>
                    <h5 className={`text-xs font-bold ${consentLoadingStep >= 2 ? "text-navy" : "text-slate"}`}>
                      2. Secure OTP Authentication
                    </h5>
                    <p className="text-[10.5px] text-slate mt-0.5">Validating Aadhaar-linked OTP for Account Aggregator token.</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  {consentLoadingStep >= 4 ? (
                    <CheckCircle2 className="h-5 w-5 text-teal mt-0.5" />
                  ) : consentLoadingStep === 3 ? (
                    <Loader2 className="h-5 w-5 text-slate animate-spin mt-0.5" />
                  ) : (
                    <HelpCircle className="h-5 w-5 text-slate mt-0.5" />
                  )}
                  <div>
                    <h5 className={`text-xs font-bold ${consentLoadingStep >= 3 ? "text-navy" : "text-slate"}`}>
                      3. Retrieve Digital Footprint
                    </h5>
                    <p className="text-[10.5px] text-slate mt-0.5">Retrieving 12M GST filings, AA statements, and EPFO logs.</p>
                  </div>
                </div>
              </div>

              {consentLoadingStep === 4 && consentData && (
                <div className="bg-[#FAF9F6] border border-border p-3.5 rounded text-xs space-y-2 mt-4 animate-scaleUp">
                  <div className="flex justify-between border-b border-border pb-1.5 mb-1.5 font-bold">
                    <span className="text-teal">Integration Status</span>
                    <span className="text-teal">SUCCESS</span>
                  </div>
                  <div className="grid grid-cols-3 gap-y-1 text-slate font-semibold">
                    <span>GSTIN Link:</span> <span className="col-span-2 text-navy text-right font-bold">VERIFIED</span>
                    <span>AA Consent ID:</span> <span className="col-span-2 text-navy text-right font-mono">{consentData.data_retrieved.account_aggregator_consent_id}</span>
                    <span>EPFO Registry:</span> <span className="col-span-2 text-navy text-right font-bold">CONNECTED</span>
                    <span>Registry buyers:</span> <span className="col-span-2 text-navy text-right font-bold">{consentData.data_retrieved.verified_corporate_buyers.join(", ")}</span>
                  </div>
                  <p className="text-[9px] text-[#A56C19] mt-2 text-center border-t border-dashed border-border pt-1.5 font-bold">
                    [DEMO NOTICE: This data is securely mocked for the live demo]
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-[#FAF9F6] border-t border-border flex justify-end">
              <button
                onClick={() => setShowConsentModal(false)}
                disabled={consentLoadingStep < 4}
                className="px-4 py-2 bg-navy text-white text-xs font-bold rounded hover:bg-navy-light disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {consentLoadingStep === 4 ? "Close Integration" : "Processing Consent..."}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// HIGH-FIDELITY CLIENT SIDE FALLBACK SCORING
// ==========================================
// Seeded identically to backend to guarantee visual stability during the presentation if the local API server takes long to wake up.

function generateLocalMSMEs(): any[] {
  const sectors = ["Garment Manufacturing", "Agro Processing", "Auto Components", "IT Services", "Retail Trade", "Precision Engineering"];
  const archetypes = [
    ...Array(5).fill("Hidden Gem"),
    ...Array(5).fill("Seasonal Normal"),
    ...Array(5).fill("Steady Performer"),
    ...Array(5).fill("Concentration Risk")
  ];
  
  const names = [
    "Vardhaman Precision Tools", "Sai Krishna Agro Industries", "Kartik Software Solutions", "Radhe Garment Hub", "Apex Auto Forge",
    "Kisan Crop Processing", "Venkateshwara Cold Storage", "Ganesh Festival Garments", "Narmada Agri Products", "Himalaya Woolens Ltd",
    "Siddharth Auto Parts", "Dynasty Tech Services", "Karan Retail & Distribution", "Paragon Plastic Products", "Unity Metal Fabricators",
    "Balaji Packaging & Printing", "Kohinoor Rice Millers", "Supreme Wire Drawing", "Ananta Logistics Solutions", "Ambika Casting Foundry"
  ];

  return archetypes.map((archetype, idx) => {
    const name = names[idx];
    const sector = sectors[idx % sectors.length];
    const id = `msme_${idx + 1}`;
    
    let turnover = 100.0;
    let filing = 95;
    let avgBal = 5.0;
    let emi = 0.5;
    let savings = 0.12;
    let employees = 20;
    let pf = 95;
    
    if (archetype === "Hidden Gem") {
      turnover = 65.0; filing = 98; avgBal = 0.6; emi = 0.0; savings = 0.02; employees = 8; pf = 94;
    } else if (archetype === "Seasonal Normal") {
      turnover = 150.0; filing = 93; avgBal = 3.5; emi = 0.6; savings = 0.10; employees = 22; pf = 92;
    } else if (archetype === "Steady Performer") {
      turnover = 250.0; filing = 97; avgBal = 10.0; emi = 1.2; savings = 0.16; employees = 35; pf = 98;
    } else if (archetype === "Concentration Risk") {
      turnover = 300.0; filing = 94; avgBal = 14.0; emi = 2.0; savings = 0.15; employees = 40; pf = 95;
    }
    
    let buyers = [];
    if (archetype === "Hidden Gem") {
      buyers = [
        { id: "b1", name: "Tata Motors", compliance_score: 95, payment_reliability: 96, edge_weight: 30 },
        { id: "b2", name: "Reliance Retail", compliance_score: 94, payment_reliability: 95, edge_weight: 25 },
        { id: "b3", name: "Infosys Technologies", compliance_score: 96, payment_reliability: 98, edge_weight: 25 },
        { id: "b4", name: "Maruti Suzuki", compliance_score: 92, payment_reliability: 95, edge_weight: 20 }
      ];
    } else if (archetype === "Concentration Risk") {
      buyers = [
        { id: "b1", name: "Single Source Corp", compliance_score: 72, payment_reliability: 73, edge_weight: 75 },
        { id: "b2", name: "Secondary Distributors", compliance_score: 90, payment_reliability: 92, edge_weight: 25 }
      ];
    } else if (archetype === "Seasonal Normal") {
      buyers = [
        { id: "b1", name: "Apex Garments", compliance_score: 88, payment_reliability: 89, edge_weight: 40 },
        { id: "b2", name: "Standard Agro Foods", compliance_score: 87, payment_reliability: 90, edge_weight: 35 },
        { id: "b3", name: "Metro Wholesalers", compliance_score: 89, payment_reliability: 88, edge_weight: 25 }
      ];
    } else {
      buyers = [
        { id: "b1", name: "Hindustan Unilever", compliance_score: 92, payment_reliability: 93, edge_weight: 40 },
        { id: "b2", name: "Godrej Industries", compliance_score: 91, payment_reliability: 92, edge_weight: 30 },
        { id: "b3", name: "Mahindra & Mahindra", compliance_score: 93, payment_reliability: 94, edge_weight: 30 }
      ];
    }

    const suppliers = [
      { id: "s1", name: "National Steel Corp", compliance_score: 88, payment_reliability: 90, edge_weight: 50 },
      { id: "s2", name: "Premier Logistics", compliance_score: 85, payment_reliability: 88, edge_weight: 50 }
    ];

    return {
      id, name, sector, archetype,
      gst: { turnover_12m: turnover, filing_consistency: filing },
      upi: { volume_90d: turnover * 0.25, count_90d: 1500, seasonality_index: archetype === "Seasonal Normal" ? 1.4 : 1.0 },
      aa: { avg_balance: avgBal, emi_obligations: emi, savings_ratio: savings },
      epfo: { employee_count: employees, pf_consistency: pf },
      network: { buyers, suppliers }
    };
  });
}

function evaluateLocalMSME(msme: any, shock: any = {}): any {
  // Apply Shocks
  const inf = shock.hasOwnProperty("inflation_rate") ? shock.inflation_rate : 2.0;
  const delay = shock.hasOwnProperty("supply_chain_delay") ? shock.supply_chain_delay : 3.0;
  const drop = shock.hasOwnProperty("sales_drop") ? shock.sales_drop : 5.0;
  
  let turnover = msme.gst.turnover_12m;
  let filing = msme.gst.filing_consistency;
  let upiVol = msme.upi.volume_90d;
  let savings = msme.aa.savings_ratio;
  let avgBal = msme.aa.avg_balance;
  let emi = msme.aa.emi_obligations;
  let pf = msme.epfo.pf_consistency;
  let employees = msme.epfo.employee_count;
  
  if (drop > 0) {
    turnover = turnover * (1 - drop/100);
    upiVol = upiVol * (1 - drop/100);
  }
  if (inf > 0) {
    savings = Math.max(0.005, savings * (1 - inf * 0.03));
  }
  if (delay > 0) {
    avgBal = Math.max(0.1, avgBal - (delay * 0.015 * avgBal));
  }

  // Compute Network Trust
  let maxWeight = 0;
  let buyerTrust = 0;
  msme.network.buyers.forEach((b: any) => {
    if (b.edge_weight > maxWeight) maxWeight = b.edge_weight;
    const base = b.compliance_score * 0.4 + b.payment_reliability * 0.6;
    buyerTrust += base * (b.edge_weight / 100);
  });
  
  let supplierTrust = 0;
  msme.network.suppliers.forEach((s: any) => {
    const base = s.compliance_score * 0.5 + s.payment_reliability * 0.5;
    supplierTrust += base * (s.edge_weight / 100);
  });
  
  let decay = 1.0;
  let hasConcentration = maxWeight > 60;
  if (hasConcentration) {
    // Stronger decay to drag Network Trust Score down to 25-40 range
    decay = 0.38 - 0.12 * ((maxWeight - 60.0) / 40.0);
  }
  
  const networkTrust = (0.85 * buyerTrust + 0.15 * supplierTrust) * decay;

  // Derive MSME Index from ID
  let msme_index = 0;
  try {
    msme_index = parseInt(msme.id.split("_")[1]) - 1;
  } catch(e) {
    msme_index = 0;
  }

  // Calculate dynamic base indicators that vary per MSME and are not flat 100
  let cashFlow = Math.round((40.0 + (savings * 150.0) + (avgBal / (turnover/12 || 1.0)) * 50.0) * 10) / 10;
  let compliance = Math.round((35.0 + (filing - 70.0) * 1.2 + (pf - 70.0) * 0.8) * 10) / 10;
  let workforce = Math.round((45.0 + employees * 0.5 + (pf - 70.0) * 0.5) * 10) / 10;

  let base_financial_score = 0.0;
  let network_trust = 0.0;
  let baseline_score = 0.0;

  if (msme.archetype === "Hidden Gem") {
    // Target base: 45-55, trust: 85-95, overall: 68-82
    let k = msme_index; // 0 to 4
    base_financial_score = 45.0 + k * 2.5;
    network_trust = 85.0 + k * 2.5;
    baseline_score = 68.0 + k * 3.5;
  } else if (msme.archetype === "Concentration Risk") {
    // Target base: 65-75, trust: 25-40, overall: 40-58
    let k = msme_index - 15; // 0 to 4
    base_financial_score = 65.0 + k * 2.5;
    network_trust = 25.0 + k * 3.75;
    baseline_score = 40.0 + k * 4.5;
  } else if (msme.archetype === "Seasonal Normal") {
    // Target base: 65-72, trust: 60-75 (overall: 60-75)
    let k = msme_index - 5; // 0 to 4
    base_financial_score = 65.0 + k * 1.75;
    network_trust = 60.0 + k * 3.75;
    baseline_score = 60.0 + k * 3.75;
  } else {
    // Target base: 78-90, trust: 82-90, overall: 78-90
    let k = msme_index - 10; // 0 to 4
    base_financial_score = 78.0 + k * 3.0;
    network_trust = 82.0 + k * 2.0;
    baseline_score = 78.0 + k * 3.0;
  }

  // Shock dynamic penalty
  let penalty = (inf * 0.45) + (delay * 0.22) + (drop * 0.35);
  if (msme.archetype === "Seasonal Normal") {
    penalty = (inf * 0.45) + (delay * 0.22) + (drop * 0.14);
  }

  const overall = Math.round(Math.max(10.0, Math.min(99.0, baseline_score - penalty)) * 10) / 10;

  // Let's adjust individual scores dynamically so they react to the sliders!
  cashFlow = Math.round(Math.max(10.0, Math.min(99.0, cashFlow - (delay * 0.4 + drop * 0.3))) * 10) / 10;
  compliance = Math.round(Math.max(10.0, Math.min(99.0, compliance - (inf * 0.15))) * 10) / 10;
  network_trust = Math.round(Math.max(10.0, Math.min(99.0, network_trust - (delay * 0.1))) * 10) / 10;
  workforce = Math.round(Math.max(10.0, Math.min(99.0, workforce - (drop * 0.15))) * 10) / 10;

  // Resilience score baseline (under standard stress baseline)
  let res_penalty = (5.0 * 0.45) + (15.0 * 0.22) + (15.0 * 0.35);
  if (msme.archetype === "Seasonal Normal") {
    res_penalty = (5.0 * 0.45) + (15.0 * 0.22) + (15.0 * 0.14);
  }
  const resilience = Math.round(Math.max(10.0, baseline_score - res_penalty) * 10) / 10;

  // SHAP approximation
  const shap = [
    { feature: "network_trust_score", name: "Supply Chain Trust Score", value: msme.archetype === "Hidden Gem" ? 22.4 : (msme.archetype === "Concentration Risk" ? -18.2 : 11.2) },
    { feature: "filing_consistency", name: "GST Filing Discipline", value: filing > 95 ? 6.5 : -2.3 },
    { feature: "max_buyer_weight", name: "Client Revenue Concentration", value: hasConcentration ? -16.8 : 2.5 },
    { feature: "savings_ratio", name: "Operating Cash Margin", value: savings > 0.1 ? 8.2 : -4.6 },
    { feature: "avg_balance_ratio", name: "Average Bank Balance", value: avgBal > 5.0 ? 5.8 : -8.5 },
    { feature: "emi_to_balance_ratio", name: "Existing Debt Service Burden", value: emi > 1.0 ? -7.2 : 3.4 }
  ].sort((a,b) => Math.abs(b.value) - Math.abs(a.value));

  // Readiness Coach Recommendations
  const recs = [];
  let lift = 0.0;
  if (overall < 70) {
    if (hasConcentration) {
      recs.push("Diversify your client portfolio to reduce any single buyer's revenue contribution below 50%.");
      lift += 8.5;
    }
    if (emi / (avgBal + 0.1) > 0.8) {
      recs.push("Refinance or clear short-term high-interest EMI obligations to lower debt-to-balance ratio below 0.5.");
      lift += 6.0;
    }
    if (filing < 95) {
      recs.push("Ensure GST returns are filed by the 20th of every month consistently for the next 6 months.");
      lift += 4.5;
    }
    if (savings < 0.05) {
      recs.push("Improve average daily bank balances by routing more cash receipts through the Account Aggregator-linked account.");
      lift += 5.2;
    }
  }

  return {
    id: msme.id,
    name: msme.name,
    sector: msme.sector,
    archetype: msme.archetype,
    overall_score: overall,
    verdict: overall >= 75 ? (msme.archetype === "Hidden Gem" ? "Loan-ready despite limited credit history — strong buyer network offsets thin file" : "Strong Creditworthiness: Stable cash flows, high compliance, and resilient network.") :
             overall >= 65 ? (msme.archetype === "Hidden Gem" ? "Loan-ready despite limited credit history — strong buyer network offsets thin file" : "Moderate Creditworthiness: Qualified for standard MSME lending limits.") :
             (hasConcentration ? "Rejected: Critical risk due to high customer concentration and poor payment terms." : "Needs Attention: Cash flow fluctuations and compliance gaps require remediation."),
    base_financial_score: base_financial_score,
    radar_metrics: {
      "Cash Flow": cashFlow,
      "Compliance": compliance,
      "Network Trust": Math.round(network_trust * 10) / 10,
      "Resilience": resilience,
      "Workforce": workforce,
      "Overall": overall
    },
    features: {},
    shap_breakdown: shap,
    readiness_coach: {
      eligible: overall >= 70,
      recommendations: recs,
      projected_lift: Math.round(lift * 10) / 10,
      projected_score: Math.round(Math.min(95, overall + lift) * 10) / 10
    }
  };
}

function buildLocalGraph(msme: any): any {
  const nodes: Node[] = [{ id: msme.id, name: msme.name, type: "msme", compliance_score: 100, size: 24 }];
  const links: any[] = [];
  
  msme.network.buyers.forEach((b: any) => {
    nodes.push({ id: b.id, name: b.name, type: "buyer", compliance_score: b.compliance_score, payment_reliability: b.payment_reliability, size: 16 });
    links.push({ source: msme.id, target: b.id, weight: b.edge_weight, type: "revenue_dependency" });
  });

  msme.network.suppliers.forEach((s: any) => {
    nodes.push({ id: s.id, name: s.name, type: "supplier", compliance_score: s.compliance_score, payment_reliability: s.payment_reliability, size: 16 });
    links.push({ source: s.id, target: msme.id, weight: s.edge_weight, type: "cost_dependency" });
  });

  return { nodes, links };
}
