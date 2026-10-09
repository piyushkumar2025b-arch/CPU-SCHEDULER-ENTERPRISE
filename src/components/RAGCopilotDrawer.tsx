import React, { useState, useEffect, useRef } from 'react';
import { ProcessInput, AllResults } from '../types';
import {
  queryRAGBackend,
  RAGResponse,
  RAGCitation,
  RAGKnowledgeTopic,
  fetchRAGKnowledgeTopics,
} from '../services/ragService';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  BookOpen,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  Lightbulb,
  ExternalLink,
  Bot,
  Layers,
} from 'lucide-react';

export interface RAGCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  processes: ProcessInput[];
  results: AllResults | null;
  quantum: number;
  fingerprint?: any;
  anomalies?: any[];
  initialQuestion?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'rag';
  text: string;
  citations?: RAGCitation[];
  telemetryHighlights?: RAGResponse['telemetryHighlights'];
  source?: string;
  timestamp: string;
}

const DEFAULT_PROMPTS = [
  {
    label: '🏆 Why Winner Won',
    question: 'Why did the winning algorithm perform best on this workload?',
    domain: 'scheduling' as const,
  },
  {
    label: '⏱️ Optimal Quantum',
    question: 'What is the optimal Round Robin quantum for this workload, and what are the trade-offs?',
    domain: 'quantum' as const,
  },
  {
    label: '🛡️ Mitigate Starvation',
    question: 'How do we resolve starvation risks for longer tasks in this workload?',
    domain: 'starvation' as const,
  },
  {
    label: '🚛 Convoy Effect in FCFS',
    question: 'Explain any Convoy effect observed in FCFS and how preemptive algorithms fix it.',
    domain: 'anomaly' as const,
  },
  {
    label: '🐧 Linux CFS Dispatching',
    question: 'How would the Linux Completely Fair Scheduler (CFS) handle this task queue?',
    domain: 'kernel' as const,
  },
  {
    label: '📐 Kleinrock Conservation Law',
    question: "How does Kleinrock's Conservation Law apply to waiting times for this workload?",
    domain: 'scheduling' as const,
  },
];

export const RAGCopilotDrawer: React.FC<RAGCopilotDrawerProps> = ({
  isOpen,
  onClose,
  processes,
  results,
  quantum,
  fingerprint,
  anomalies,
  initialQuestion,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCitationId, setExpandedCitationId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [topics, setTopics] = useState<RAGKnowledgeTopic[]>([]);
  const [showTopicsModal, setShowTopicsModal] = useState(false);
  const [showTelemetryDrawer, setShowTelemetryDrawer] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load available knowledge topics on mount
  useEffect(() => {
    fetchRAGKnowledgeTopics().then(setTopics);
  }, []);

  const lastSubmittedQuestionRef = useRef<string | null>(null);

  // Handle incoming external question
  useEffect(() => {
    if (isOpen && initialQuestion && initialQuestion.trim().length > 0) {
      if (lastSubmittedQuestionRef.current !== initialQuestion) {
        lastSubmittedQuestionRef.current = initialQuestion;
        handleAskQuestion(initialQuestion.trim());
      }
    } else if (!isOpen) {
      lastSubmittedQuestionRef.current = null;
    }
  }, [isOpen, initialQuestion]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleAskQuestion = async (
    questionToAsk: string,
    domain?: 'scheduling' | 'starvation' | 'quantum' | 'anomaly' | 'kernel' | 'general'
  ) => {
    if (!questionToAsk.trim() || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: questionToAsk,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsLoading(true);

    try {
      const res = await queryRAGBackend({
        question: questionToAsk,
        domain: domain || 'general',
        processes,
        results,
        quantum,
        fingerprint,
        anomalies,
      });

      const ragMsg: Message = {
        id: `rag-${Date.now()}`,
        sender: 'rag',
        text: res.answer,
        citations: res.citations,
        telemetryHighlights: res.telemetryHighlights,
        source: res.source,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, ragMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'rag',
        text: `Error contacting RAG backend: ${err?.message || 'Unable to retrieve answer.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: '560px',
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.45)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight 0.22s ease-out',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                RAG OS Kernel Copilot
              </h3>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  padding: '2px 6px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--green)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontWeight: 600,
                }}
              >
                LIVE RAG
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--dim)' }}>
              Connected to simulation telemetry &amp; OS scheduling theory
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => setShowTopicsModal((prev) => !prev)}
            title="Browse retrieved OS knowledge topics"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.35rem 0.6rem',
              fontSize: '0.72rem',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <BookOpen size={13} />
            <span>Topics ({topics.length})</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Close copilot"
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              padding: '0.4rem',
              color: 'var(--dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Live Telemetry Bar */}
      <div
        style={{
          padding: '0.55rem 1.25rem',
          background: 'rgba(59, 130, 246, 0.05)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          fontSize: '0.72rem',
          color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Cpu size={13} style={{ color: 'var(--accent)' }} />
            <span>Tasks: <strong>{processes.length}</strong></span>
          </span>
          <span>Quantum: <strong>q={quantum}</strong></span>
          {results && (
            <span>
              Best: <strong style={{ color: 'var(--green)' }}>
                {Object.keys(results).reduce((best, curr) =>
                  results[curr as any]?.avgWT < results[best as any]?.avgWT ? curr : best
                ).toUpperCase()}
              </strong>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowTelemetryDrawer((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '0.7rem',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem',
          }}
        >
          <span>{showTelemetryDrawer ? 'Hide context' : 'View live RAG context'}</span>
          {showTelemetryDrawer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Expandable Telemetry Context Details */}
      {showTelemetryDrawer && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            background: 'var(--surface-secondary)',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.7rem',
            fontFamily: 'IBM Plex Mono, monospace',
            maxHeight: '140px',
            overflowY: 'auto',
            color: 'var(--text)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: 'var(--accent)' }}>
            Active Simulation Feed to RAG Backend:
          </div>
          <div>Process Count: {processes.length} | Round Robin Quantum: {quantum}</div>
          {results && (
            <div style={{ marginTop: '0.25rem' }}>
              Algorithms Evaluated: {Object.keys(results).map((k) => `${k.toUpperCase()} (WT: ${results[k as any]?.avgWT.toFixed(1)}ms)`).join(', ')}
            </div>
          )}
          {anomalies && anomalies.length > 0 && (
            <div style={{ marginTop: '0.25rem', color: 'var(--yellow)' }}>
              Active Anomalies: {anomalies.map((a: any) => `${a.type} (${a.severity})`).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Topics Drawer/Overlay if opened */}
      {showTopicsModal && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--surface-tertiary)',
            borderBottom: '1px solid var(--border)',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)' }}>
              📚 Indexed OS Knowledge Topics (Retrieved on Query)
            </span>
            <button
              type="button"
              onClick={() => setShowTopicsModal(false)}
              style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: '0.7rem' }}
            >
              Close
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {topics.map((t) => (
              <div
                key={t.id}
                onClick={() => {
                  handleAskQuestion(`Tell me about ${t.title} and how it relates to this workload.`, t.domain as any);
                  setShowTopicsModal(false);
                }}
                style={{
                  padding: '0.45rem 0.6rem',
                  borderRadius: '6px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text)' }}>{t.title}</span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: 'var(--accent)',
                    }}
                  >
                    {t.domain}
                  </span>
                </div>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.68rem', color: 'var(--dim)' }}>{t.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages Thread */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <Bot size={24} />
            </div>
            <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>
              Welcome to the RAG OS Copilot
            </h4>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--dim)', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
              Ask anything about your active simulation, CPU scheduling algorithms, Convoy bottlenecks, starvation, or production kernels.
            </p>

            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--dim)', marginBottom: '0.5rem', textAlign: 'left' }}>
                💡 Click a Quick Prompt to Begin:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {DEFAULT_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAskQuestion(p.question, p.domain)}
                    style={{
                      background: 'var(--surface-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '0.55rem 0.75rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{p.label} — <span style={{ color: 'var(--dim)' }}>{p.question}</span></span>
                    <Lightbulb size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div
                style={{
                  background: isUser ? 'var(--accent)' : 'var(--surface-secondary)',
                  color: isUser ? '#ffffff' : 'var(--text)',
                  border: isUser ? 'none' : '1px solid var(--border)',
                  borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  padding: '0.75rem 0.95rem',
                  fontSize: '0.8rem',
                  lineHeight: '1.45',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      paddingBottom: '0.35rem',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.64rem',
                          fontFamily: 'IBM Plex Mono, monospace',
                          padding: '1px 6px',
                          borderRadius: '8px',
                          background:
                            m.source === 'openrouter'
                              ? 'rgba(155, 114, 247, 0.15)'
                              : m.source === 'gemini'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                          color:
                            m.source === 'openrouter'
                              ? '#9b72f7'
                              : m.source === 'gemini'
                              ? 'var(--accent)'
                              : 'var(--green)',
                          fontWeight: 700,
                        }}
                      >
                        Source: {m.source || 'RAG Kernel'}
                      </span>
                      {m.telemetryHighlights && (
                        <span style={{ fontSize: '0.64rem', color: 'var(--dim)' }}>
                          • Winner: {m.telemetryHighlights.winner} ({m.telemetryHighlights.bestWT}ms)
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(m.id, m.text)}
                      title="Copy response"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedId === m.id ? 'var(--green)' : 'var(--dim)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        fontSize: '0.65rem',
                      }}
                    >
                      {copiedId === m.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                      <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {/* Formatted Text */}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>

                {/* Citations / Theoretical Grounding Accordion */}
                {!isUser && m.citations && m.citations.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.55rem',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: 'var(--accent)',
                        marginBottom: '0.4rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <BookOpen size={12} />
                      <span>Retrieved OS Knowledge Citations ({m.citations.length}):</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {m.citations.map((c) => {
                        const isExpanded = expandedCitationId === c.id;
                        return (
                          <div
                            key={c.id}
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              padding: '0.4rem 0.55rem',
                              fontSize: '0.72rem',
                            }}
                          >
                            <div
                              onClick={() => setExpandedCitationId(isExpanded ? null : c.id)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.title}</span>
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </div>

                            {isExpanded && (
                              <div style={{ marginTop: '0.4rem', color: 'var(--dim)', fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <div><strong>Principle:</strong> {c.snippet}</div>
                                {c.formula && (
                                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', background: 'var(--surface-secondary)', padding: '2px 5px', borderRadius: '4px' }}>
                                    <strong>Formula:</strong> {c.formula}
                                  </div>
                                )}
                                {c.kernelImplementation && (
                                  <div><strong>Kernel:</strong> {c.kernelImplementation}</div>
                                )}
                                {c.remediation && (
                                  <div style={{ color: 'var(--green)' }}><strong>Remediation:</strong> {c.remediation}</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <span
                style={{
                  fontSize: '0.64rem',
                  color: 'var(--dim)',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  padding: '0 4px',
                }}
              >
                {m.timestamp}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px 12px 12px 2px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--dim)',
            }}
          >
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span>Retrieving OS scheduling principles &amp; analyzing live simulation telemetry...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested chips above input */}
      {messages.length > 0 && (
        <div
          style={{
            padding: '0.4rem 1.25rem',
            background: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '0.35rem',
            overflowX: 'auto',
          }}
        >
          {DEFAULT_PROMPTS.slice(0, 3).map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleAskQuestion(p.question, p.domain)}
              disabled={isLoading}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '0.68rem',
                color: 'var(--text)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Form Bar */}
      <div
        style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskQuestion(inputVal);
          }}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Ask about this simulation, quantum, starvation, CFS..."
            disabled={isLoading}
            style={{
              flex: 1,
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.6rem 0.85rem',
              fontSize: '0.8rem',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputVal.trim()}
            style={{
              background: !inputVal.trim() || isLoading ? 'var(--surface-tertiary)' : 'var(--accent)',
              color: !inputVal.trim() || isLoading ? 'var(--dim)' : '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 0.95rem',
              cursor: !inputVal.trim() || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span>Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
};
