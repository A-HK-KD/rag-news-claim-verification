# System Architecture - LangChain Integration

## 📊 End-to-End Flow with LangChain

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                              │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
         ┌──────▼──────┐   ┌─────▼─────┐   ┌──────▼──────┐
         │   Browser   │   │    Web    │   │  Context    │
         │  Extension  │   │ Interface │   │    Menu     │
         └──────┬──────┘   └─────┬─────┘   └──────┬──────┘
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
                                  │ HTTP POST /api/verify
                                  │
┌─────────────────────────────────▼─────────────────────────────────┐
│                    EXPRESS SERVER (Port 3000)                      │
│                     backend/server.js                              │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
                                  │ verifyClaim(claim)
                                  │
┌─────────────────────────────────▼─────────────────────────────────┐
│                      RAG PIPELINE (LangChain)                      │
│                     backend/services/rag.js                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ STEP 1: Claim Analysis (LangChain Chain)                 │    │
│  │                                                            │    │
│  │  claimAnalysisPrompt                                      │    │
│  │         │                                                  │    │
│  │         ▼                                                  │    │
│  │  ChatOpenAI (gpt-4o-mini)                                │    │
│  │         │                                                  │    │
│  │         ▼                                                  │    │
│  │  withStructuredOutput(ClaimAnalysisSchema) ← Zod         │    │
│  │         │                                                  │    │
│  │         ▼                                                  │    │
│  │  { type, entities, temporality, keywords } ✅ Validated  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                  │                                 │
│  ┌──────────────────────────────▼─────────────────────────┐      │
│  │ STEP 2: Evidence Retrieval (Hybrid Search)             │      │
│  │                                                          │      │
│  │  ┌─────────────────────────────────────────────────┐   │      │
│  │  │ Vector Database Search (LangChain)              │   │      │
│  │  │                                                  │   │      │
│  │  │  OpenAIEmbeddings (text-embedding-3-large)     │   │      │
│  │  │           │                                      │   │      │
│  │  │           ▼                                      │   │      │
│  │  │  similaritySearch() → Pinecone                  │   │      │
│  │  │           │                                      │   │      │
│  │  │           ▼                                      │   │      │
│  │  │  Document[] with metadata ← LangChain format   │   │      │
│  │  └─────────────────────────────────────────────────┘   │      │
│  │                      │                                   │      │
│  │  ┌───────────────────▼──────────────────────────────┐  │      │
│  │  │ Web Search (Wikipedia API)                       │  │      │
│  │  │  → Additional evidence sources                   │  │      │
│  │  └──────────────────────────────────────────────────┘  │      │
│  │                      │                                   │      │
│  │                      ▼                                   │      │
│  │  Deduplicate & sort by relevance                        │      │
│  └──────────────────────────────────────────────────────────┘    │
│                                  │                                 │
│  ┌──────────────────────────────▼─────────────────────────┐      │
│  │ STEP 3: Verification (LangChain Chain)                 │      │
│  │                                                          │      │
│  │  verificationPrompt                                     │      │
│  │         │                                                │      │
│  │         ▼                                                │      │
│  │  ChatOpenAI (gpt-4o)                                    │      │
│  │         │                                                │      │
│  │         ▼                                                │      │
│  │  withStructuredOutput(VerdictSchema) ← Zod             │      │
│  │         │                                                │      │
│  │         ▼                                                │      │
│  │  { verdict, confidence, reasoning, citations }          │      │
│  │  ✅ Validated & type-safe                              │      │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────┬─────────┘
                                  │
                                  │ Return structured result
                                  │
                        ┌─────────▼─────────┐
                        │   JSON Response   │
                        │  (Type-safe ✅)   │
                        └─────────┬─────────┘
                                  │
                                  ▼
                        Display to User 🎉
```

## 🔑 Key Components

### LangChain Components Used

1. **ChatOpenAI**
   - GPT-4o for verification
   - GPT-4o-mini for analysis
   - Structured output support

2. **OpenAIEmbeddings**
   - text-embedding-3-large (3072 dimensions)
   - Consistent embedding generation

3. **ChatPromptTemplate**
   - Centralized prompt management
   - Variable interpolation
   - Version control friendly

4. **Zod Schemas**
   - ClaimAnalysisSchema
   - VerdictSchema
   - Automatic validation

5. **RecursiveCharacterTextSplitter**
   - Semantic chunking
   - 500 char chunks, 80 char overlap

6. **Document Objects**
   - Standard format: { pageContent, metadata }
   - Metadata tracking through pipeline

### Data Flow

```
User Input (Text) 
    → Claim Analysis (LangChain Chain)
    → Entity Extraction (Zod Validated)
    → Embedding Generation (OpenAIEmbeddings)
    → Vector Search (Pinecone + LangChain)
    → Web Search (Wikipedia)
    → Evidence Compilation
    → Verification (LangChain Chain)
    → Structured Output (Zod Validated)
    → JSON Response
    → User Display
```

## 🎯 Integration Points

### Browser Extension → Backend
- **Protocol:** HTTP REST API
- **Endpoint:** `POST http://localhost:3000/api/verify`
- **Format:** JSON with claim text
- **Response:** Structured verdict with citations

### Backend → LangChain
- **Prompts:** Centralized in `prompts.js`
- **Chains:** Composable pipelines
- **Validation:** Automatic via Zod

### Backend → Vector Database
- **Client:** Pinecone v7
- **Wrapper:** LangChain-style methods
- **Format:** Document objects with metadata

### Backend → OpenAI
- **Client:** LangChain ChatOpenAI
- **Models:** gpt-4o, gpt-4o-mini
- **Features:** Structured outputs, streaming (future)

## 📦 Module Structure

```
backend/
├── server.js                 # Express server
├── routes/
│   └── verify.js            # API endpoints
├── services/
│   ├── prompts.js           # ✨ LangChain prompts & Zod schemas
│   ├── rag.js               # ✨ LangChain chains & verification
│   ├── vectordb.js          # ✨ LangChain-style vector ops
│   ├── embeddings.js        # Legacy embedding functions
│   └── websearch.js         # Wikipedia API integration
├── utils/
│   └── chunking.js          # ✨ RecursiveCharacterTextSplitter
└── scripts/
    └── seed-knowledge-base.js  # Vector DB seeding

extension/
├── manifest.json            # Extension config
├── background/
│   └── service-worker.js    # API calls
├── content/
│   └── content.js          # Text selection UI
└── popup/
    ├── popup.html          # Extension popup
    └── popup.js            # Popup logic
```

## 🔄 Request/Response Cycle

### Example Request
```javascript
// From browser extension
fetch('http://localhost:3000/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    claim: 'The Eiffel Tower was completed in 1889',
    useWebSearch: true
  })
});
```

### Internal Processing (with LangChain)
```javascript
// 1. Analyze claim
const chain = claimAnalysisPrompt.pipe(model.withStructuredOutput(schema));
const analysis = await chain.invoke({ claim });
// Result: { type: 'fact', entities: [...], temporality: 'historical' }

// 2. Retrieve evidence
const docs = await similaritySearch(claim, 5, null, 'knowledge-base');
const webResults = await searchWeb(claim, analysis.entities);

// 3. Verify with LangChain
const verifyChain = verificationPrompt.pipe(model.withStructuredOutput(VerdictSchema));
const result = await verifyChain.invoke({ claim, evidence });
// Result: { verdict: 'TRUE', confidence: 0.95, reasoning: '...', citations: [...] }
```

### Response
```json
{
  "verdict": "TRUE",
  "confidence": 0.95,
  "reasoning": "The claim is accurate. The Eiffel Tower was indeed completed in 1889 [1][2]...",
  "citations": [
    {
      "index": 1,
      "title": "Knowledge Base: The Eiffel Tower was completed in 1889",
      "url": "https://en.wikipedia.org/wiki/Eiffel_Tower",
      "relevance": "Direct historical evidence",
      "credibility": "high"
    }
  ],
  "processingTime": "2.3s"
}
```

## 🔐 Security & Validation

- ✅ Zod schemas validate all LLM outputs
- ✅ Type safety prevents runtime errors
- ✅ CORS enabled for browser extension
- ✅ No sensitive data in responses
- ✅ API keys in environment variables only

## 🎨 User Experience Flow

```
1. User selects text on webpage
2. "✓ Verify" button appears (content script)
3. User clicks button
4. Extension sends claim to backend (service worker)
5. Backend processes with LangChain (structured pipeline)
6. Response returns to extension
7. Popup displays verdict with citations
8. User sees color-coded result (green=TRUE, red=FALSE, etc.)
```

## 📈 Performance

- **Vector Search:** ~100ms (Pinecone)
- **LLM Analysis:** ~1-2s (GPT-4o-mini)
- **LLM Verification:** ~2-3s (GPT-4o)
- **Total:** ~3-5s end-to-end

**LangChain Overhead:** Minimal (~10-20ms) - mostly serialization

## 🚀 Benefits of LangChain Integration

| Aspect | Before | After (LangChain) |
|--------|--------|-------------------|
| Output Parsing | Manual JSON.parse | Automatic with Zod |
| Type Safety | ❌ None | ✅ Full |
| Error Handling | Basic try/catch | Built-in + validation |
| Prompts | Hardcoded strings | Centralized templates |
| Maintainability | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Testability | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Extensibility | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

**Last Updated:** February 15, 2026  
**Architecture Version:** 2.0 (with LangChain)  
**Status:** ✅ Production Ready
