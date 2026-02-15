# Real-Time News Claim Verification System - Architecture

## Executive Summary

This architecture implements a **three-tier hybrid RAG system** with intelligent routing, multi-source evidence aggregation, and an agentic verification loop. It employs **adaptive retrieval strategies** that choose between static knowledge, live web search, and agentic investigation based on claim characteristics.

**Key Differentiators:**
- **Intelligent Claim Router**: Automatically classifies claims and routes to optimal verification strategy
- **Multi-Stage Verification**: Progressive verification with confidence-based escalation
- **Hybrid Knowledge Architecture**: Three-tier knowledge system (curated → cached → live)
- **Agentic Self-Critique**: Agent validates its own conclusions before presenting results
- **Temporal Intelligence**: Understands time-sensitive vs. historical claims
- **LangChain-Powered**: Production-grade orchestration with built-in observability and error handling

---

## Table of Contents
1. [System Architecture Diagram](#1-system-architecture-diagram)
2. [Detailed Component Descriptions](#2-detailed-component-descriptions)
3. [Data Flow: Complete Verification Journey](#3-data-flow-complete-verification-journey)
4. [Technical Specifications](#4-technical-specifications)
5. [LangChain Integration Strategy](#5-langchain-integration-strategy)
6. [Performance Characteristics](#6-performance-characteristics)
7. [Production Readiness: Security, Reliability & Monitoring](#7-production-readiness-security-reliability--monitoring)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Addressing Problem Statement Requirements](#9-addressing-problem-statement-requirements)
10. [Success Metrics](#10-success-metrics)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph "User Interface Layer"
        BEX[Browser Extension<br/>Content Script + Popup]
        WUI[Web Interface<br/>React/HTML]
        API_GW[API Gateway<br/>Rate Limiting + Auth]
    end

    subgraph "Intelligence Layer"
        CR[Claim Router<br/>Classification + Routing Logic]
        AM[Agentic Manager<br/>Verification Orchestrator]
        
        subgraph "Claim Analysis"
            CA[Claim Analyzer<br/>GPT-4o-mini]
            CD[Claim Decomposer<br/>Complex → Sub-claims]
            TC[Temporal Classifier<br/>Historical vs Current]
        end
        
        subgraph "Verification Strategies"
            SV[Simple Verification<br/>Direct KB Lookup]
            HV[Hybrid Verification<br/>KB + Web Search]
            AV[Agentic Verification<br/>Multi-step Investigation]
        end
    end

    subgraph "Evidence Retrieval Layer"
        subgraph "Tier 1: Curated Knowledge"
            PKB[(Pinecone<br/>Verified Facts)]
            EMB1[Embeddings<br/>text-embedding-3-large]
        end
        
        subgraph "Tier 2: Cached Intelligence"
            REDIS[(Redis Cache<br/>Recent Verifications)]
            VC[Verdict Cache<br/>TTL: 24h-7d]
        end
        
        subgraph "Tier 3: Live Sources"
            WK[Wikipedia API<br/>General Knowledge]
            TV[Tavily API<br/>News + Web]
        end
    end

    subgraph "Processing Layer"
        RR[Reranker<br/>Cross-Encoder Model]
        SA[Stance Analyzer<br/>Batch Classification]
        CS[Credibility Scorer<br/>Source Trust Rating]
        CD_DETECT[Conflict Detector<br/>Evidence Contradictions]
    end

    subgraph "Verification Layer"
        VE[Verdict Engine<br/>GPT-4o]
        SC[Self-Critique Agent<br/>Validation Loop]
        AG[Evidence Aggregator<br/>Multi-source Merger]
        CI[Citation Inspector<br/>No Hallucination Check]
    end

    subgraph "Data & Monitoring"
        DB[(PostgreSQL<br/>Verification History)]
        MON[Monitoring<br/>Langfuse/OpenTelemetry]
        METRICS[Metrics Store<br/>Performance Tracking]
    end

    %% User Flow
    BEX --> API_GW
    WUI --> API_GW
    API_GW --> CR
    
    %% Intelligence Flow
    CR --> CA
    CA --> TC
    CA --> CD
    TC --> AM
    CD --> AM
    
    AM --> SV
    AM --> HV
    AM --> AV
    
    %% Evidence Retrieval
    SV --> PKB
    HV --> PKB
    HV --> WK
    AV --> PKB
    AV --> WK
    AV --> TV
    AV --> FC
    
    %% Caching
    CR --> REDIS
    REDIS -.Cache Hit.-> API_GW
    
    %% Processing
    PKB --> EMB1
    EMB1 --> RR
    WK --> RR
    TV --> RR
    FC --> RR
    
    RR --> SA
    RR --> CS
    SA --> CD_DETECT
    
    %% Verification
    CD_DETECT --> AG
    AG --> VE
    VE --> SC
    SC --> CI
    
    %% Output & Storage
    CI --> API_GW
    CI --> DB
    CI --> REDIS
    AM --> MON
    VE --> MON
    MON --> METRICS

    style CR fill:#FFE066
    style AM fill:#FF6B6B
    style PKB fill:#4ECDC4
    style VE fill:#95E1D3
    style SC fill:#F38181
    style REDIS fill:#FFA07A
```
