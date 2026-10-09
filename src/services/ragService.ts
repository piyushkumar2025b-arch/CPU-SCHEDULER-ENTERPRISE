import { ProcessInput, AllResults } from '../types';

export interface RAGCitation {
  id: string;
  title: string;
  snippet: string;
  formula?: string;
  kernelImplementation?: string;
  remediation?: string;
}

export interface RAGResponse {
  answer: string;
  citations: RAGCitation[];
  telemetryHighlights: {
    winner: string;
    bestWT: number;
    runnerUp?: string;
    runnerUpWT?: number;
    quantum: number;
    taskCount: number;
  };
  source: 'gemini' | 'openrouter' | 'rag-deterministic' | 'fallback';
  timestamp: string;
}

export interface RAGQueryParams {
  question: string;
  domain?: 'scheduling' | 'starvation' | 'quantum' | 'anomaly' | 'kernel' | 'general';
  processes?: ProcessInput[];
  results?: AllResults | null;
  quantum?: number;
  fingerprint?: any;
  anomalies?: any[];
}

export interface RAGKnowledgeTopic {
  id: string;
  title: string;
  domain: string;
  tags: string[];
  summary: string;
  formula?: string;
}

export async function queryRAGBackend(params: RAGQueryParams): Promise<RAGResponse> {
  const savedProvider = (localStorage.getItem('remix_selected_ai_provider') || 'gemini') as
    | 'gemini'
    | 'openrouter'
    | 'heuristic';
  const savedModel = localStorage.getItem('remix_selected_ai_model') || undefined;
  const savedKey = localStorage.getItem('remix_openrouter_api_key') || undefined;

  const response = await fetch('/api/rag/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      provider: savedProvider,
      model: savedModel,
      openRouterApiKey: savedKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`RAG service returned HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchRAGKnowledgeTopics(): Promise<RAGKnowledgeTopic[]> {
  try {
    const res = await fetch('/api/rag/knowledge-topics');
    if (!res.ok) return [];
    const data = await res.json();
    return data.topics || [];
  } catch {
    return [];
  }
}
