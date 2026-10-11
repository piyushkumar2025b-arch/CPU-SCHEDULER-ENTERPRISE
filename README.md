# CPU Scheduler Comparator

A production-grade, interactive operating systems CPU scheduling comparator and pedagogical laboratory. Analyze and compare First-Come First-Served (FCFS), Shortest Job First (SJF), Shortest Remaining Time First (SRTF), Round Robin (RR), Priority (Non-preemptive), and Preemptive Priority algorithms side-by-side with interactive step playback, Gantt charts, queue inspectors, and retrieval-augmented generation (RAG) performance explainers.

## Features

- **Six Deterministic Scheduling Engines**: Accurate simulation of FCFS, SJF, SRTF, Round Robin, and Priority (preemptive & non-preemptive) with strict mathematical invariants.
- **Interactive Gantt & Step Playback**: Visual dispatch timelines, ready-queue inspectors, and discrete clock-tick state tracing.
- **Quantum Sensitivity Analyzer**: Parametric quantum sweep with 80th-percentile heuristic recommendations to optimize context switch vs. turnaround trade-offs.
- **Workload Anomaly Detection**: Automated detection of Convoy effects, starvation risks, quantum thrashing, and high response-time jitter.
- **Local RAG & Operating Systems Copilot**: Grounded explanations derived from kernel scheduling literature (CFS, MLFQ, Kleinrock conservation law, Little's Law) with resilient offline fallback.
- **Zero-Latency Offline Mode**: Full deterministic execution without requiring external API keys.

## Quickstart

### Prerequisites
- Node.js 20+
- npm or bun

### Environment Configuration
Copy `.env.example` to `.env` (or configure secrets in your deployment dashboard):
```bash
GEMINI_API_KEY="your-gemini-api-key"        # Optional: For Gemini-powered workload synthesis
OPENROUTER_API_KEY="your-openrouter-key"    # Optional: For OpenRouter multi-model synthesis
PORT=3000                                   # Server port (defaults to 3000)
```

### Development
```bash
npm install
npm run dev
```

### Automated Testing
Runs the native Node.js test runner covering scheduler invariants, boundary validation, and anomaly detection:
```bash
npm test
```

### Type Checking & Building
```bash
npm run lint
npm run build
npm start
```

## API Architecture

| Endpoint | Method | Description |
|---|---|---|
| `/api/ai-providers` | GET | Status of configured AI providers (Gemini, OpenRouter, Heuristic). |
| `/api/parse-workload` | POST | Translates natural language descriptions into CPU benchmark workloads. |
| `/api/rag/knowledge-topics` | GET | Returns authoritative operating system scheduling topic cards. |
| `/api/rag/query` | POST | Answers scheduling questions grounded in telemetry and kernel principles. |
| `/api/generate-insights` | POST | Post-simulation comparative tradeoff analysis. |
| `/api/explain-workload` | POST | Executive performance review and scheduling optimization advice. |
| `/api/test-provider` | POST | Diagnostic test for provider connectivity. |

## License
Apache-2.0
