from fastapi.testclient import TestClient
import json

# Import the app instance from main
from main import app

client = TestClient(app)

def test_get_msmes():
    response = client.get("/api/msmes")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 20
    print(f"[*] GET /api/msmes: Success, returned {len(data)} MSMEs.")
    
    # Check keys
    first_item = data[0]
    expected_keys = ["id", "name", "sector", "archetype", "overall_score", "verdict", "network_trust_score", "cash_flow_score"]
    for key in expected_keys:
        assert key in first_item
        
    # Check archetype presence
    archetypes = [item["archetype"] for item in data]
    for arch in ["Hidden Gem", "Seasonal Normal", "Steady Performer", "Concentration Risk"]:
        assert arch in archetypes
        print(f"  - Archetype '{arch}' exists in dataset.")

def test_get_msme_detail():
    # Test for normal MSME
    response = client.get("/api/msme/msme_1")
    assert response.status_code == 200
    data = response.json()
    
    assert "msme" in data
    assert "evaluation" in data
    assert "graph_data" in data
    
    # Check detailed evaluation elements
    eval_data = data["evaluation"]
    assert "overall_score" in eval_data
    assert "verdict" in eval_data
    assert "radar_metrics" in eval_data
    assert "shap_breakdown" in eval_data
    assert "readiness_coach" in eval_data
    
    # Check graph data elements
    graph_data = data["graph_data"]
    assert "nodes" in graph_data
    assert "links" in graph_data
    assert len(graph_data["nodes"]) > 0
    assert len(graph_data["links"]) > 0
    
    # Ensure there is a center node and neighbors
    node_types = [n["type"] for n in graph_data["nodes"]]
    assert "msme" in node_types
    assert "buyer" in node_types or "supplier" in node_types
    
    print("[*] GET /api/msme/msme_1: Success, detailed evaluation, SHAP, and Graph models validated.")

def test_simulate_shock():
    # Simulate a shock: 10% sales drop, 15 days supply delay, 3% inflation
    payload = {
        "msme_id": "msme_1",
        "inflation_rate": 3.0,
        "supply_chain_delay": 15.0,
        "sales_drop": 10.0
    }
    response = client.post("/api/simulate-shock", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    assert "overall_score" in data
    assert "radar_metrics" in data
    assert "verdict" in data
    
    print(f"[*] POST /api/simulate-shock: Success, stress testing recomputed score to {data['overall_score']}.")

def test_mock_uli_consent():
    response = client.get("/api/mock-uli-consent/msme_1")
    assert response.status_code == 200
    data = response.json()
    
    assert data["status"] == "CONSENT_VERIFIED"
    assert data["mocked_integration"] is True
    assert "data_retrieved" in data
    
    print("[*] GET /api/mock-uli-consent/msme_1: Success, mocked ULI flow verified.")

if __name__ == "__main__":
    print("Starting EchoCred API tests...")
    try:
        test_get_msmes()
        test_get_msme_detail()
        test_simulate_shock()
        test_mock_uli_consent()
        print("\nAll API verification tests PASSED successfully!")
    except AssertionError as e:
        print("\nAssertion Error encountered during testing!")
        raise e
