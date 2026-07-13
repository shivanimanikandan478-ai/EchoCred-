import random
import json
from typing import List, Dict, Any

# Ensure deterministic generation for consistent demo results
random.seed(42)

SECTORS = ["Garment Manufacturing", "Agro Processing", "Auto Components", "IT Services", "Retail Trade", "Precision Engineering"]

def generate_monthly_revenues(base_turnover: float, archetype: str) -> List[float]:
    """Generates 12 months of revenue in Lakhs based on turnover and archetype."""
    base_monthly = base_turnover / 12.0
    revenues = []
    
    for month in range(12):
        if archetype == "Seasonal Normal":
            # Monsoon (months 6, 7 - July, August) dips to 40%, Festivals (months 9, 10 - Oct, Nov) peaks to 180%
            if month in [6, 7]:
                factor = 0.45
            elif month in [9, 10]:
                factor = 1.75
            else:
                factor = 1.05
        else:
            # Small random fluctuation (+/- 10%)
            factor = random.uniform(0.9, 1.1)
            
        revenues.append(round(base_monthly * factor, 2))
        
    return revenues

def generate_network(archetype: str, turnover: float) -> Dict[str, List[Dict[str, Any]]]:
    """Generates a list of buyers and suppliers for the network graph."""
    buyers = []
    suppliers = []
    
    # 1. Generate Buyers
    if archetype == "Hidden Gem":
        # Diversified, highly compliant buyer network
        num_buyers = random.randint(3, 5)
        # Distribute weights
        base_weights = [35, 25, 20, 10, 10]
        weights = base_weights[:num_buyers]
        total_w = sum(weights)
        weights = [w * 100.0 / total_w for w in weights]
        
        names = ["Tata Motors", "Reliance Retail", "Infosys Technologies", "Maruti Suzuki", "ITC Limited"]
        for i in range(num_buyers):
            buyers.append({
                "id": f"buyer_{random.randint(100, 999)}",
                "name": names[i % len(names)],
                "compliance_score": random.randint(92, 98),
                "payment_reliability": random.randint(94, 99),
                "edge_weight": round(weights[i], 1)
            })
            
    elif archetype == "Concentration Risk":
        # One dominant buyer representing >60% revenue
        dominant_weight = random.uniform(65.0, 80.0)
        other_weight = 100.0 - dominant_weight
        
        buyers.append({
            "id": f"buyer_{random.randint(100, 999)}",
            "name": "Single Source Corp",
            "compliance_score": random.randint(68, 75),  # Moderate compliance
            "payment_reliability": random.randint(70, 78),  # Slow payer
            "edge_weight": round(dominant_weight, 1)
        })
        buyers.append({
            "id": f"buyer_{random.randint(100, 999)}",
            "name": "Secondary Distributors",
            "compliance_score": random.randint(85, 92),
            "payment_reliability": random.randint(88, 94),
            "edge_weight": round(other_weight, 1)
        })
        
    elif archetype == "Seasonal Normal":
        # Regular buyers, stable but maybe regional
        num_buyers = 3
        weights = [40.0, 35.0, 25.0]
        names = ["Apex Garments", "Standard Agro Foods", "Metro Wholesalers"]
        for i in range(num_buyers):
            buyers.append({
                "id": f"buyer_{random.randint(100, 999)}",
                "name": names[i],
                "compliance_score": random.randint(85, 92),
                "payment_reliability": random.randint(87, 93),
                "edge_weight": weights[i]
            })
            
    else:  # Steady Performer
        num_buyers = random.randint(3, 4)
        weights = [40.0, 30.0, 30.0] if num_buyers == 3 else [30.0, 30.0, 20.0, 20.0]
        names = ["Hindustan Unilever", "Godrej Industries", "Mahindra & Mahindra", "L&T Engineering"]
        for i in range(num_buyers):
            buyers.append({
                "id": f"buyer_{random.randint(100, 999)}",
                "name": names[i % len(names)],
                "compliance_score": random.randint(88, 95),
                "payment_reliability": random.randint(90, 96),
                "edge_weight": weights[i]
            })
            
    # 2. Generate Suppliers
    num_suppliers = random.randint(2, 3)
    supplier_names = ["National Steel Corp", "Premier Logistics", "Alpha Chemicals", "Glow Packaging"]
    for i in range(num_suppliers):
        suppliers.append({
            "id": f"supplier_{random.randint(100, 999)}",
            "name": supplier_names[random.randint(0, len(supplier_names)-1)],
            "compliance_score": random.randint(80, 95),
            "payment_reliability": random.randint(82, 96),
            "edge_weight": round(100.0 / num_suppliers, 1)
        })
        
    return {"buyers": buyers, "suppliers": suppliers}

def generate_msmes() -> List[Dict[str, Any]]:
    msmes = []
    
    # Archetype breakdown (5 Hidden Gems, 5 Seasonal Normals, 5 Steady Performers, 5 Concentration Risks)
    archetype_allocation = (
        ["Hidden Gem"] * 5 + 
        ["Seasonal Normal"] * 5 + 
        ["Steady Performer"] * 5 + 
        ["Concentration Risk"] * 5
    )
    
    # Pre-defined names to make them look real
    business_names = [
        # Hidden Gems
        "Vardhaman Precision Tools", "Sai Krishna Agro Industries", "Kartik Software Solutions", "Radhe Garment Hub", "Apex Auto Forge",
        # Seasonal Normals
        "Kisan Crop Processing", "Venkateshwara Cold Storage", "Ganesh Festival Garments", "Narmada Agri Products", "Himalaya Woolens Ltd",
        # Steady Performers
        "Siddharth Auto Parts", "Dynasty Tech Services", "Karan Retail & Distribution", "Paragon Plastic Products", "Unity Metal Fabricators",
        # Concentration Risks
        "Balaji Packaging & Printing", "Kohinoor Rice Millers", "Supreme Wire Drawing", "Ananta Logistics Solutions", "Ambika Casting Foundry"
    ]
    
    for idx, archetype in enumerate(archetype_allocation):
        name = business_names[idx]
        sector = SECTORS[idx % len(SECTORS)]
        
        # Adjust financial parameters based on archetype
        if archetype == "Hidden Gem":
            turnover_12m = round(random.uniform(50.0, 90.0), 2)
            filing_consistency = random.randint(95, 100)
            avg_balance = round(random.uniform(0.3, 0.9), 2)  # Thin financial file
            emi_obligations = 0.0  # No prior bank loans
            savings_ratio = round(random.uniform(0.01, 0.03), 3)
            employee_count = random.randint(6, 12)
            pf_consistency = random.randint(90, 98)
            
        elif archetype == "Seasonal Normal":
            turnover_12m = round(random.uniform(120.0, 220.0), 2)
            filing_consistency = random.randint(90, 96)
            avg_balance = round(random.uniform(2.5, 5.0), 2)
            emi_obligations = round(random.uniform(0.4, 0.8), 2)
            savings_ratio = round(random.uniform(0.08, 0.14), 3)
            employee_count = random.randint(15, 30)
            pf_consistency = random.randint(85, 95)
            
        elif archetype == "Steady Performer":
            turnover_12m = round(random.uniform(150.0, 350.0), 2)
            filing_consistency = random.randint(94, 99)
            avg_balance = round(random.uniform(6.0, 15.0), 2)
            emi_obligations = round(random.uniform(0.8, 1.8), 2)
            savings_ratio = round(random.uniform(0.12, 0.22), 3)
            employee_count = random.randint(20, 50)
            pf_consistency = random.randint(95, 100)
            
        else:  # Concentration Risk
            turnover_12m = round(random.uniform(180.0, 400.0), 2)
            filing_consistency = random.randint(92, 97)
            avg_balance = round(random.uniform(8.0, 20.0), 2)  # Strong financials
            emi_obligations = round(random.uniform(1.2, 2.5), 2)
            savings_ratio = round(random.uniform(0.10, 0.20), 3)
            employee_count = random.randint(25, 60)
            pf_consistency = random.randint(92, 98)
            
        # Monthly revenues
        monthly_revenue = generate_monthly_revenues(turnover_12m, archetype)
        
        # UPI metrics
        upi_volume_90d = round(turnover_12m * 0.25 * random.uniform(0.8, 1.2), 2)  # Roughly 25% through UPI
        upi_count_90d = random.randint(800, 3000)
        
        # Network graph elements
        network_data = generate_network(archetype, turnover_12m)
        
        msmes.append({
            "id": f"msme_{idx + 1}",
            "name": name,
            "sector": sector,
            "archetype": archetype,
            "gst": {
                "turnover_12m": turnover_12m,
                "monthly_revenue": monthly_revenue,
                "filing_consistency": filing_consistency
            },
            "upi": {
                "volume_90d": upi_volume_90d,
                "count_90d": upi_count_90d,
                "seasonality_index": 1.4 if archetype == "Seasonal Normal" else 1.0
            },
            "aa": {
                "avg_balance": avg_balance,
                "emi_obligations": emi_obligations,
                "savings_ratio": savings_ratio
            },
            "epfo": {
                "employee_count": employee_count,
                "pf_consistency": pf_consistency
            },
            "network": network_data
        })
        
    return msmes

if __name__ == "__main__":
    msme_list = generate_msmes()
    print(f"Generated {len(msme_list)} MSMEs.")
    print(json.dumps(msme_list[0], indent=2))
    # Write to a file for easy mock testing
    with open("msme_data.json", "w") as f:
        json.dump(msme_list, f, indent=2)
