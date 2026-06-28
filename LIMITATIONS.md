# AI Investment Research Agent — Functional Software Limitations & Technical Debt

A product-architect's evaluation of the current technical boundaries, functional constraints, and roadmap considerations for the Antigravity Research Agent.

---

## 🔍 Executive Summary

While our system implements a production-grade, math-validated sequential graph flow with robust LLM guardrails, it currently operates under specific **functional and structural boundaries**. These limitations must be resolved to elevate the product from a high-quality sandbox to a true institutional-grade research tool.

---

## 🧱 Key Functional & Architectural Limitations

### 1. The Listed Equity Dependency (Private Market Blindspot)
* **The Boundary:** The system's data gateway is strictly dependent on public tickers mapped to Yahoo Finance, FMP, and Finnhub.
* **The Impact:** When a user requests research on non-listed companies, pre-IPO startups (e.g., SpaceX, OpenAI, Stripe), or local SMEs, the data gateway stalls, falls back to a sparse web-search report, and cannot run any verified financial math.
* **The Architecture:**
  ```mermaid
  graph TD
      A[User Input: SpaceX] --> B[Data Sufficiency Gateway]
      B -->|No Ticker Match| C[Sparse Search Report]
      B -.->|Blocked| D[Deterministic Math Engine]
      B -.->|Blocked| E[Peer Percentile Benchmarking]
  ```
* **Remediation Roadmap:**
  1. **Document Ingestion Layer:** Integrate `pdf-parse` or a cloud OCR service (e.g., AWS Textract / Google Document AI) on the backend.
  2. **Manual Financial Grid:** Provide a manual table input in the UI where analysts can type in key financial statements (Income, Balance, Cash Flow) for unlisted companies.
  3. **Universal Normalization Mapper:** Feed the extracted or manual values into our native `financialData.js` pipeline to execute the same math checks and debate modules.

---

### 2. Static Threshold Coefficients (The Hardcoded Risk Bias)
* **The Boundary:** Key risk indicators and macro-economic filters are evaluated against hardcoded constants in the backend calculations:
  * Debt-to-Equity is flagged as "High Leverage" if it exceeds `0.5` ([anomalies.js](file:///c:/Users/HP/OneDrive/Desktop/IIM/ai-invest-agent/lib/compute/anomalies.js#L26)).
  * Interest rate valuation penalty is triggered strictly when the 10-Yr Treasury yield exceeds `4.5%` ([anomalies.js](file:///c:/Users/HP/OneDrive/Desktop/IIM/ai-invest-agent/lib/compute/anomalies.js#L54)).
  * Earnings quality ratio (Operating Cash Flow / Net Income) is marked as anomalous if it falls below `0.8`.
* **The Impact:** A static threshold does not adapt to different economic regimes (e.g., low-interest-rate eras vs. high-inflation cycles) or different sector norms. For instance, capital-intensive utility firms naturally run Debt-to-Equity ratios > 1.5, which will trigger false positive warnings.
* **Remediation Roadmap:**
  * **Configurable Risk Model:** Expose these coefficients as an advanced slider drawer in the Next.js UI (similar to the weights sliders), passing them as a `riskParameters` object to the API route.

---

### 3. Shallow Web Search vs. Deep SEC Filings (RAG Limitation)
* **The Boundary:** For qualitative research (moats, headwinds, regulatory risks), the agent runs Tavily search queries over the public web.
* **The Impact:** Public web search yields shallow news summaries, market blogs, or press releases. It lacks the depth of official regulatory filings (SEC 10-K/10-Q), earnings call transcripts, or paywalled broker research. This exposes the agent to "consensus narrative bias."
* **Remediation Roadmap:**
  * **SEC EDGAR Integration:** Wire up an SEC filing reader to retrieve official disclosures.
  * **Semantic Chunking & Vector DB (RAG):** Store 10-K sections in a vector database (e.g., PGVector or Pinecone) to allow the LLM to pull specific disclosures (e.g., *Item 1A Risk Factors*) rather than relying on generic search results.

---

### 4. TTM-Centric Analytics (Missing Cyclical & Trend Analysis)
* **The Boundary:** The metrics and anomaly engines analyze the *most recent* trailing twelve months (TTM) or annual filings.
* **The Impact:** The system cannot detect multi-year trends or cyclical trajectories (e.g., a company whose margins have compressed for 3 consecutive years, or a cyclical commodity producer at the peak of its cycle).
* **Remediation Roadmap:**
  * **CAGR Calculations:** Upgrade `lib/compute/metrics.js` to compute 3-year and 5-year compounded annual growth rates (CAGR).
  * **Sequential Trend Checks:** Trigger accounting anomalies if a metric (like Operating Margin or ROIC) shows a downward trend over a 3-year sequence.

---

### 5. Regex-Based LLM Math Auditing (Syntax Vulnerability)
* **The Boundary:** The validation layer ([multiMethodValidation.js](file:///c:/Users/HP/OneDrive/Desktop/IIM/ai-invest-agent/lib/validation/multiMethodValidation.js)) uses regular expressions to extract numbers from LLM text and verify them.
* **The Impact:** While highly effective for formatted numbers (e.g., `$12.5B`, `45%`), it is vulnerable to syntax variations. If the LLM writes numbers as words (e.g., *"twelve percent"*), refers to values using indirect phrasing, or outputs markdown tables with complex dividers, the regex can fail to extract the values, leading to skipped validation checks.
* **Remediation Roadmap:**
  * **LLM-Guided Extraction Parser:** Run a fast, low-temperature LLM pass (using Gemini Flash Lite) to extract claims as structured JSON `{ claim: string, value: number, category: string }`, then validate that JSON deterministically in code.

---

## 📊 Summary of Technical Debt & Mitigations

| Functional Limitation | Business Risk | Technical Debt Level | Near-term Mitigation |
| :--- | :--- | :--- | :--- |
| **No Private Companies** | Missing venture capital / SME use cases | 🔴 **High** (Requires pipeline restructure) | Add manual statement grid inputs in frontend |
| **Hardcoded Constants** | Regimes shifts lead to false risk flags | 🟡 **Medium** (Quick to parameterize) | Pass risk parameters in API state query |
| **Consensus News Bias** | Misses regulatory disclosures / SEC details | 🔴 **High** (Requires Vector DB) | Integrate Tavily's SEC-focused search domain |
| **No Trend Auditing** | Fails to detect multi-year decay | 🟢 **Low** (Simple math logic update) | Calculate 3-year CAGR in metrics engine |
| **Regex Validation** | Potential bypassed grounding audits | 🟡 **Medium** (Code refactor) | standard JSON output parsing for audits |
