RedX has recently introduced a 4PL model, where parcels in low-volume zones are handed over to external partners such as Steadfast Courier and Pathao to reduce operational costs and move toward profitability.
Currently, dispatch decisions are manual or rule-based.
This product introduces an AI-driven autonomous decision engine that:
Predicts whether to dispatch via 3PL (RedX fleet) or 4PL
Selects the optimal 4PL partner
Maximizes profit per parcel
Minimizes SLA breach risk
Recommends hub expansion or closure based on projected profitability
This will reduce decision latency, increase margin optimization, and support scalable profitability.
Problem Statement
RedX faces three core operational challenges:
A. Dispatch Optimization Problem
Low-volume zones are costly to operate internally
Wrong routing decisions reduce margin
SLA breaches leads to merchants churning
B. 4PL Partner Selection Problem
Different partners have:
Different SLAs
Different rates
Different reliability levels
Choosing the wrong partner reduces profit.
C. Network Expansion Problem
Uncertainty about:
When to open a new hub
When to close an underperforming hub
Volume threshold for profitability

Goals & Success Metrics
🎯 Primary Goals
Increase per-parcel profitability
Reduce operational cost per zone
Improve SLA adherence
📊 Success Metrics
+X% improvement in contribution margin
-Y% SLA breaches
Reduced decision time from hours → seconds
Hub profitability forecasting accuracy > 80%
Target Users
Operations Managers
Network Planning Team
Finance & Strategy Team
Hub Managers

Core Features

Feature 1: Autonomous Dispatch Decision Agent
When a parcel is created, the system evaluates:
Zone volume
Delivery SLA requirement
Cost of 3PL vs 4PL
Partner SLA history
Contribution margin
Output:
3PL or 4PL recommendation
If 4PL → which partner
Expected margin
Risk score

Feature 2: 4PL Partner Optimizer
AI agents evaluate:
Historical SLA reliability
Cost structure
Current capacity
Zone compatibility
Outputs:
Optimal partner choice
Confidence score
Backup partner

Feature 3: Hub Profitability & Expansion Predictor
AI simulates:
Required daily parcel volume to break even
Fixed cost vs variable cost ratio
Zone growth potential
Partner dependency ratio
Outputs:
“Open new hub in Zone X”
“Close or convert hub Y to 4PL-only”
Projected 90-day profitability





Agent Architecture
🤖 Agent 1: Volume Forecast Agent
Predicts expected parcel flow.
🤖 Agent 2: Cost Modeling Agent
Calculates contribution margin.
🤖 Agent 3: SLA Risk Agent
Predicts breach probability.
🤖 Agent 4: Partner Evaluation Agent
Ranks 4PL providers.
🤖 Agent 5: Network Strategy Agent
Simulates hub expansion/closure impact.
🤖 Agent 6: Executive Summary Agent
Generates decision reports for managers.
Agents debate before making a final decision.




