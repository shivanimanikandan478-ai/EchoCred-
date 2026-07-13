from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Any, Optional

# Import synthetic data and scoring engine
from data_generator import generate_msmes
from scoring_engine import ScoringEngine

app = FastAPI(
    title="EchoCred API",
    description="Ecosystem-Aware Credit Intelligence Platform for MSME Lending",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo purposes, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize scoring engine and generate data
scoring_engine = ScoringEngine()
msmes_data = generate_msmes()

# In-memory dictionary for quick lookup by ID
msme_by_id = {m["id"]: m for m in msmes_data}

class ShockSimulationRequest(BaseModel):
    msme_id: str
    inflation_rate: float  # Percentage
    supply_chain_delay: float  # Days
    sales_drop: float  # Percentage

@app.get("/api/msmes")
def get_msmes():
    """Returns a list of all MSMEs with their calculated base score and verdict."""
    summary_list = []
    for msme in msmes_data:
        eval_result = scoring_engine.evaluate_msme(msme)
        summary_list.append({
            "id": msme["id"],
            "name": msme["name"],
            "sector": msme["sector"],
            "archetype": msme["archetype"],
            "overall_score": eval_result["overall_score"],
            "verdict": eval_result["verdict"],
            "network_trust_score": eval_result["radar_metrics"]["Network Trust"],
            "cash_flow_score": eval_result["radar_metrics"]["Cash Flow"]
        })
    return summary_list

@app.get("/api/msme/{msme_id}")
def get_msme_detail(msme_id: str):
    """Returns full score details, SHAP explainability, and network graph representation."""
    msme = msme_by_id.get(msme_id)
    if not msme:
        raise HTTPException(status_code=404, detail="MSME not found")
        
    eval_result = scoring_engine.evaluate_msme(msme)
    
    # Structure network graph data for frontend rendering
    nodes = []
    links = []
    
    # 1. Add center node (the MSME itself)
    nodes.append({
        "id": msme["id"],
        "name": msme["name"],
        "type": "msme",
        "compliance_score": 100,  # Center reference
        "size": 24
    })
    
    # 2. Add buyers
    for b in msme["network"]["buyers"]:
        nodes.append({
            "id": b["id"],
            "name": b["name"],
            "type": "buyer",
            "compliance_score": b["compliance_score"],
            "payment_reliability": b["payment_reliability"],
            "size": max(12, int(b["edge_weight"] * 0.25) + 10)
        })
        links.append({
            "source": msme["id"],
            "target": b["id"],
            "weight": b["edge_weight"],
            "type": "revenue_dependency"
        })
        
    # 3. Add suppliers
    for s in msme["network"]["suppliers"]:
        nodes.append({
            "id": s["id"],
            "name": s["name"],
            "type": "supplier",
            "compliance_score": s["compliance_score"],
            "payment_reliability": s["payment_reliability"],
            "size": max(12, int(s["edge_weight"] * 0.25) + 10)
        })
        links.append({
            "source": s["id"],
            "target": msme["id"],
            "weight": s["edge_weight"],
            "type": "cost_dependency"
        })
        
    graph_data = {
        "nodes": nodes,
        "links": links
    }
    
    return {
        "msme": msme,
        "evaluation": eval_result,
        "graph_data": graph_data
    }

@app.post("/api/simulate-shock")
def simulate_shock(request: ShockSimulationRequest):
    """Simulates economic shocks and returns recalculated scores."""
    msme = msme_by_id.get(request.msme_id)
    if not msme:
        raise HTTPException(status_code=404, detail="MSME not found")
        
    shock_params = {
        "inflation_rate": request.inflation_rate,
        "supply_chain_delay": request.supply_chain_delay,
        "sales_drop": request.sales_drop
    }
    
    eval_result = scoring_engine.evaluate_msme(msme, shock_params)
    
    return {
        "msme_id": request.msme_id,
        "overall_score": eval_result["overall_score"],
        "radar_metrics": eval_result["radar_metrics"],
        "verdict": eval_result["verdict"]
    }

@app.get("/api/mock-uli-consent/{msme_id}")
def mock_uli_consent(msme_id: str):
    """
    Mocked Unified Lending Interface (ULI) consent response.
    Explicitly labeled as a mock.
    """
    msme = msme_by_id.get(msme_id)
    if not msme:
        raise HTTPException(status_code=404, detail="MSME not found")
        
    return {
        "status": "CONSENT_VERIFIED",
        "mocked_integration": True,
        "protocol": "ULI/OCEN v2.1-Mocked",
        "data_retrieved": {
            "gstin_registry": "SUCCESS",
            "account_aggregator_consent_id": f"AA-CONSENT-{msme_id.upper()}-8839",
            "epfo_registry": "SUCCESS",
            "verified_corporate_buyers": [b["name"] for b in msme["network"]["buyers"]]
        },
        "timestamp_utc": "2026-07-13T15:48:00Z"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
