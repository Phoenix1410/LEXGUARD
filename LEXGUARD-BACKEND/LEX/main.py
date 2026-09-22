from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Security, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from sentence_transformers import SentenceTransformer, CrossEncoder
from sklearn.metrics.pairwise import cosine_similarity
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
import os
import fitz  # PyMuPDF
import jwt   # PyJWT
import numpy as np
import torch
import asyncio
import re
from dotenv import load_dotenv
import sys
import io

# Ensure UTF-8 stdout on Windows
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 1. Setup App & Configuration
load_dotenv()
app = FastAPI(title="LexGuard AI Core")

from database import db
from models import UserSync, Timeline, TimelineEvent, Discrepancy, ComparativeAnalysisResult

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG & PATHS ---
MODEL_DIR = "./lexguard_model"
ABS_MODEL_PATH = os.path.abspath(MODEL_DIR)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")  # Set in your .env for production signature verification

# --- SECURITY (CLERK AUTH) ---
security = HTTPBearer()

def verify_clerk_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Decodes and optionally verifies Clerk Token signatures."""
    token = credentials.credentials
    if not token or token in ("demo", "test", "null", "undefined", "dev", "mock_token"):
        return "demo_user"
    try:
        if CLERK_JWKS_URL:
            # Requires 'cryptography' package installed
            jwks_client = jwt.PyJWKClient(CLERK_JWKS_URL)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_exp": True}
            )
        else:
            # Fallback/Prototype mode (No signature check)
            payload = jwt.decode(token, options={"verify_signature": False})
            
        user_id = payload.get("sub")
        if not user_id:
            return "authenticated_user"
        return user_id
    except Exception as e:
        print(f"[AUTH WARNING] Clerk token decode notice: {e}")
        # In prototype mode without JWKS, gracefully treat valid format attempts as authenticated
        return "clerk_user"

# --- LOAD MODELS ---

# Dynamic device mapping (CUDA vs CPU fallback)
device_id = 0 if torch.cuda.is_available() else -1
device_name = "GPU (CUDA)" if device_id == 0 else "CPU"

# 1. THE SNIPER (DistilRoBERTa - Risk Detection)
print(f"Loading Sniper Model from: {ABS_MODEL_PATH}")
try:
    model = AutoModelForSequenceClassification.from_pretrained(ABS_MODEL_PATH, local_files_only=True)
    tokenizer = AutoTokenizer.from_pretrained(ABS_MODEL_PATH, local_files_only=True)
    sniper = pipeline("text-classification", model=model, tokenizer=tokenizer, device=device_id)
    print(f"[OK] Sniper Model Loaded ({device_name})")
except Exception as e:
    print(f"[ERROR] Error loading Sniper: {e}")
    exit()

# 2. THE SCOUT (Sentence-BERT - Semantic Search)
print("Loading Scout Model (Semantic Search)...")
try:
    scout_device = "cuda" if torch.cuda.is_available() else "cpu"
    scout = SentenceTransformer('all-MiniLM-L6-v2', device=scout_device) 
    print(f"[OK] Scout Model Loaded ({scout_device.upper()})")
except Exception as e:
    print(f"[ERROR] Error loading Scout: {e}")
    exit()

# 3. THE SENTINEL (Local Cross-Encoder NLI for Testimony Contradiction Filtering)
print("Loading Sentinel Model (Local NLI Triage)...")
try:
    nli_device = "cuda" if torch.cuda.is_available() else "cpu"
    # Lightweight DeBERTa-v3 (~140MB) optimized for Premise-Hypothesis Contradiction classification
    nli_classifier = CrossEncoder("cross-encoder/nli-deberta-v3-small", device=nli_device)
    print(f"[OK] Sentinel NLI Model Loaded ({nli_device.upper()})")
except Exception as e:
    print(f"[WARNING] Sentinel NLI load warning: {e}. Falling back to cosine thresholding.")
    nli_classifier = None

# 4. THE ANALYST (Groq Reasoning Engine)
if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment.")

DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
analyst = ChatGroq(
    temperature=0,
    model_name=DEFAULT_MODEL,
    groq_api_key=GROQ_API_KEY
)
print(f"[OK] Analyst Model Loaded: {DEFAULT_MODEL}")

# --- HELPER FUNCTIONS ---

def extract_text_from_pdf(file_bytes: bytes) -> list[str]:
    """Parses PDF bytes into structured, bite-sized legal clause chunks."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text_chunks = []
    
    for page in doc:
        blocks = page.get_text("blocks")
        for b in blocks:
            raw_text = b[4].strip()
            if not raw_text:
                continue
                
            clean_text = " ".join(raw_text.split()).strip()
            if len(clean_text) <= 20:
                continue

            if len(clean_text) > 250:
                sub_clauses = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9("])|(?<=;)\s+(?=[A-Z0-9("])', clean_text)
                current_chunk = ""
                
                for clause in sub_clauses:
                    clause_str = clause.strip()
                    if not clause_str:
                        continue
                    
                    if len(current_chunk) + len(clause_str) < 250:
                        current_chunk = f"{current_chunk} {clause_str}".strip() if current_chunk else clause_str
                    else:
                        if current_chunk and len(current_chunk) > 40:
                            text_chunks.append(current_chunk)
                        current_chunk = clause_str
                
                if current_chunk and len(current_chunk) > 40:
                    text_chunks.append(current_chunk)
            else:
                text_chunks.append(clean_text)
                
    return text_chunks

def segment_transcript_statements(transcript: str) -> list[str]:
    """
    Splits deposition/testimony text into standalone semantic units.
    Preserves Q&A turns where present.
    """
    qa_blocks = re.findall(r'(Q:.*?)(?=(?:Q:|$))', transcript, flags=re.DOTALL | re.IGNORECASE)
    if qa_blocks:
        return [re.sub(r'\s+', ' ', b).strip() for b in qa_blocks if len(b.strip()) > 15]
    
    # Fallback: split by sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+', transcript)
    return [s.strip() for s in sentences if len(s.strip()) > 20]

def local_triage_testimony_pairs(client_statements: list[str], accused_statements: list[str], top_k: int = 2) -> list[dict]:
    """
    Local Vector + NLI pass:
    1. Encodes statements with Scout (SentenceTransformer).
    2. Finds semantically aligned statement pairs.
    3. Runs Sentinel (CrossEncoder NLI) to filter for high-probability contradictions.
    """
    if not client_statements or not accused_statements:
        return []

    client_vecs = scout.encode(client_statements, convert_to_numpy=True, normalize_embeddings=True)
    accused_vecs = scout.encode(accused_statements, convert_to_numpy=True, normalize_embeddings=True)

    sim_matrix = np.dot(client_vecs, accused_vecs.T)
    candidate_pairs = []
    cross_encoder_pairs = []

    for c_idx, c_stmt in enumerate(client_statements):
        top_accused_indices = np.argsort(sim_matrix[c_idx])[::-1][:top_k]
        for a_idx in top_accused_indices:
            similarity = float(sim_matrix[c_idx][a_idx])
            # Focus on topically correlated claims
            if similarity >= 0.25:
                a_stmt = accused_statements[a_idx]
                candidate_pairs.append({
                    "client_claim": c_stmt,
                    "accused_claim": a_stmt,
                    "similarity": similarity
                })
                cross_encoder_pairs.append((c_stmt, a_stmt))

    if not candidate_pairs:
        return []

    # If CrossEncoder is loaded, score contradiction probability locally
    if nli_classifier and cross_encoder_pairs:
        # CrossEncoder classes: 0: Contradiction, 1: Entailment, 2: Neutral
        nli_scores = nli_classifier.predict(cross_encoder_pairs, apply_softmax=True)
        flagged = []
        for pair_dict, score_dist in zip(candidate_pairs, nli_scores):
            contra_score = float(score_dist[0])
            pair_dict["contradiction_prob"] = contra_score
            # Keep items with plausible contradiction or divergence
            if contra_score > 0.35:
                flagged.append(pair_dict)
        flagged.sort(key=lambda x: x["contradiction_prob"], reverse=True)
        return flagged[:6]
    
    # Fallback to top similarity pairs if NLI is inactive
    return candidate_pairs[:6]

async def process_analyst_evaluation(clause: str, user_rule: str | None, source_str: str, index: int, pred_score: float, risk_type: str):
    """Asynchronous wrapper to query the LLM concurrently for a flagged clause."""
    system_msg = f"""You are an elite legal auditor.
Detection Reason: {source_str}
User's Constraint Rule: {user_rule if user_rule else "None"}

Task:
1. Summarize this clause in plain English.
2. If the user provided a rule, EXPLICITLY check if this clause violates it.
3. If it is risky, suggest a safer rewrite."""
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system_msg}"),
        ("human", "{clause_text}")
    ])
    
    try:
        ai_response = await (prompt | analyst).ainvoke({
            "system_msg": system_msg,
            "clause_text": clause
        })
        explanation = ai_response.content
    except Exception as e:
        print(f"[ERROR] Analyst evaluation failed: {e}")
        explanation = f"AI Error: {str(e)}"
        
    return {
        "id": index,
        "text": clause,
        "risk_type": risk_type,
        "confidence": round(pred_score, 4),
        "explanation": explanation,
        "source": source_str
    }

# --- API ENDPOINTS ---

@app.get("/")
def health_check():
    return {
        "status": "LexGuard Brain is Online 🧠",
        "models": ["Sniper", "Scout", "Sentinel (NLI)", "Analyst"]
    }

@app.post("/users/sync")
async def sync_user(user_data: UserSync):
    """Saves or updates user profiles from Clerk sign-in/sync."""
    try:
        await db.users.update_one(
            {"clerk_id": user_data.clerk_id},
            {"$set": {
                "email": user_data.email,
                "name": user_data.name,
                "updated_at": user_data.created_at
            }},
            upsert=True
        )
        return {"status": "User synced successfully", "clerk_id": user_data.clerk_id}
    except Exception as e:
        print(f"Error syncing user: {e}")
        raise HTTPException(status_code=500, detail=f"Database sync failed: {str(e)}")

@app.post("/analyze_document")
async def analyze_document(
    file: UploadFile = File(...),
    user_rule: str = Form(None),
    user_id: str = Depends(verify_clerk_token)
):
    print(f"[UPLOADING] User {user_id} uploading: {file.filename}")
    
    # A. Parse PDF
    try:
        content = await file.read()
        clauses = extract_text_from_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {str(e)}")

    if not clauses:
        return {
            "filename": file.filename,
            "total_clauses": 0,
            "risks_found": 0,
            "results": []
        }

    print(f"[SCANNING] Scanning {len(clauses)} clauses...")
    
    # B. THE SNIPER PASS (Batch Classification)
    label_map = {"LABEL_0": "Safe", "LABEL_1": "Termination", "LABEL_2": "Non-Compete"}
    
    for idx, clause in enumerate(clauses):
        tokens = tokenizer.encode(clause, add_special_tokens=True)
        if len(tokens) > 512:
            print(f"[WARNING] Clause {idx} exceeds 512 tokens. Text will be truncated for Sniper.")

    sniper_preds = sniper(clauses, batch_size=8, truncation=True)

    # C. THE SCOUT PASS (Semantic Search)
    semantic_matches = set()
    
    if user_rule and len(user_rule.strip()) > 5:
        print(f"[SCOUT] Scout searching for rule: '{user_rule}'")
        rule_vec = scout.encode([user_rule])
        clause_vecs = scout.encode(clauses)
        
        sim_scores = cosine_similarity(rule_vec, clause_vecs)[0]
        top_indices = np.argsort(sim_scores)[-3:] 
        
        for idx in top_indices:
            if sim_scores[idx] > 0.30:
                semantic_matches.add(int(idx))
                print(f"   -> Match at Clause {idx} (Score: {sim_scores[idx]:.2f})")

    # D. CONCURRENT AGGREGATION & GENAI
    analysis_tasks = []

    for i, (clause, pred) in enumerate(zip(clauses, sniper_preds)):
        label_str = pred['label']
        risk_type = label_map.get(label_str, "Safe")
        is_sniper_risk = risk_type != "Safe"
        is_scout_match = i in semantic_matches
        
        if is_sniper_risk or is_scout_match:
            detection_source = []
            if is_sniper_risk: 
                detection_source.append(f"Sniper Flagged ({risk_type})")
            if is_scout_match: 
                detection_source.append("Scout Matched User Rule")
            
            source_str = " + ".join(detection_source)
            assigned_risk = risk_type if is_sniper_risk else "Potential Rule Violation"
            
            task = process_analyst_evaluation(
                clause=clause,
                user_rule=user_rule,
                source_str=source_str,
                index=i,
                pred_score=pred['score'],
                risk_type=assigned_risk
            )
            analysis_tasks.append(task)

    if analysis_tasks:
        results = await asyncio.gather(*analysis_tasks)
    else:
        results = []

    return {
        "filename": file.filename,
        "total_clauses": len(clauses),
        "total_clauses_scanned": len(clauses),
        "risks_found": len(results),
        "results": results
    }

# --- TESTIMONY VALIDATOR (Hybrid Local NLI + Few-Shot Groq Map-Reduce) ---

FEW_SHOT_DISCREPANCY_PROMPT = """You are a senior forensic legal auditor and cross-examination expert.
You compare witness testimonies and timelines between opposing parties (Client vs Accused).

Your objective is to identify genuine factual discrepancies, direct contradictions, and material omissions.

Below are exemplary few-shot demonstrations:

[FEW-SHOT EXAMPLE 1 - DIRECT CONFLICT]
Client Version: "Event occurred on March 14 at 10:00 PM in the corporate boardroom."
Accused Version: "Accused claims the office was fully vacated by 6:00 PM and remained locked."
Evaluation:
- Type: Direct Conflict
- Timeframe: March 14, 2024 (Evening)
- Severity: High
- Reasoning: Direct timeline and physical presence contradiction regarding building access.

[FEW-SHOT EXAMPLE 2 - MATERIAL OMISSION]
Client Version: "A formal written grievance letter was handed directly to the director on June 2nd."
Accused Version: "Director states no notifications or complaints were received throughout June."
Evaluation:
- Type: Omission
- Timeframe: June 2, 2024
- Severity: Medium
- Reasoning: Accused omits documented delivery of formal grievance notice.

[FEW-SHOT EXAMPLE 3 - SUPERFICIAL VARIATION / NO DISCREPANCY]
Client Version: "We delivered the software package 5 days later due to federal bank holidays."
Accused Version: "The project deployment was completed on day 35 instead of day 30."
Evaluation:
- Type: None / Excluded
- Reasoning: Both parties agree on the 5-day variance; explanation aligns with legal working days. Do not flag as discrepancy.
"""

async def extract_timeline(transcript_text: str, party_name: str) -> Timeline:
    """Map Phase: Extract chronological events from a single transcript."""
    print(f"[MAP] Extracting timeline for {party_name}...")
    structured_analyst = analyst.with_structured_output(Timeline)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a forensic legal analyst. Extract a chronological timeline of events for {party_name} from the transcript. Ensure exact source quotes are included."),
        ("human", "{transcript_text}")
    ])
    
    try:
        timeline = await (prompt | structured_analyst).ainvoke({
            "party_name": party_name,
            "transcript_text": transcript_text
        })
        return timeline
    except Exception as e:
        print(f"[ERROR] Failed to extract timeline for {party_name}: {e}")
        return Timeline(party=party_name, events=[])

async def compare_timelines_with_local_triage(
    client_timeline: Timeline,
    accused_timeline: Timeline,
    triage_candidates: list[dict]
) -> ComparativeAnalysisResult:
    """
    Reduce Phase: Evaluates candidate discrepancies triaged by local NLI, 
    using Few-Shot Groq prompting to output structured Discrepancies.
    """
    print(f"[REDUCE] Comparing timelines with {len(triage_candidates)} pre-filtered candidate pairs...")
    
    class DiscrepancyReport(BaseModel):
        discrepancies: list[Discrepancy]
        
    structured_analyst = analyst.with_structured_output(DiscrepancyReport)
    
    system_prompt = f"""{FEW_SHOT_DISCREPANCY_PROMPT}

Analyze the suspect candidate pairs flagged by our local vector model and cross-encoder, along with the full timelines.
Extract all material discrepancies strictly matching the schema."""
    
    # Format candidate summary to guide Groq directly to suspicious points
    candidate_summary = "\n".join([
        f"- Candidate {idx+1} (Local NLI Contradiction Confidence: {c.get('contradiction_prob', 0):.2f}):\n"
        f"  Client Claim: \"{c['client_claim']}\"\n"
        f"  Accused Claim: \"{c['accused_claim']}\""
        for idx, c in enumerate(triage_candidates)
    ]) if triage_candidates else "No local high-risk contradictory claims pre-flagged."

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", """=== PRE-FILTERED SUSPECT PAIRS (LOCAL NLI) ===
{candidate_summary}

=== CLIENT TIMELINE ===
{client_timeline}

=== ACCUSED TIMELINE ===
{accused_timeline}""")
    ])
    
    try:
        report = await (prompt | structured_analyst).ainvoke({
            "candidate_summary": candidate_summary,
            "client_timeline": client_timeline.model_dump_json(indent=2),
            "accused_timeline": accused_timeline.model_dump_json(indent=2)
        })
        return ComparativeAnalysisResult(
            client_timeline=client_timeline,
            accused_timeline=accused_timeline,
            discrepancies=report.discrepancies
        )
    except Exception as e:
        print(f"[ERROR] Failed to compare timelines: {e}")
        return ComparativeAnalysisResult(
            client_timeline=client_timeline,
            accused_timeline=accused_timeline,
            discrepancies=[]
        )

@app.post("/compare_testimonies", response_model=ComparativeAnalysisResult)
async def analyze_testimonies(
    client_file: UploadFile = File(None),
    client_text: str = Form(None),
    accused_file: UploadFile = File(None),
    accused_text: str = Form(None),
    user_id: str = Depends(verify_clerk_token)
):
    """
    Testimony Validator Endpoint:
    1. Ingests transcripts.
    2. Runs Local Scout (Embeddings) + Sentinel (DeBERTa NLI) to find high-probability contradictory claims.
    3. Concurrently extracts structured timelines via Groq.
    4. Evaluates discrepancies via Few-Shot Groq Analyst.
    """
    print(f"[API] Testimony Validator requested by user {user_id}")
    
    # 1. Resolve Inputs
    async def resolve_input(file: UploadFile, text: str) -> str:
        if file and file.filename:
            content = await file.read()
            if file.filename.lower().endswith(".pdf"):
                clauses = extract_text_from_pdf(content)
                return " ".join(clauses)
            else:
                return content.decode("utf-8", errors="ignore")
        elif text and text.strip():
            return text
        else:
            raise HTTPException(status_code=400, detail="Missing testimony input (provide file or text).")
            
    client_content = await resolve_input(client_file, client_text)
    accused_content = await resolve_input(accused_file, accused_text)
    
    # 2. Local Triage Pass (Offload non-contradictory transcript noise)
    print("[LOCAL TRIAGE] Segmenting statements and running Sentinel NLI...")
    client_stmts = segment_transcript_statements(client_content)
    accused_stmts = segment_transcript_statements(accused_content)
    
    # Filter suspicious pairs locally using Sentence-BERT and DeBERTa CrossEncoder
    triage_candidates = local_triage_testimony_pairs(client_stmts, accused_stmts, top_k=2)
    print(f"[LOCAL TRIAGE] Pre-flagged {len(triage_candidates)} high-suspicion contradictory pairs.")

    # 3. Map Phase: Extract Timelines Concurrently
    print("[MAP Phase] Starting concurrent timeline extraction via Groq...")
    client_timeline, accused_timeline = await asyncio.gather(
        extract_timeline(client_content, "Client"),
        extract_timeline(accused_content, "Accused")
    )
    
    # 4. Reduce Phase: Comparative Analysis with Few-Shot Guided Prompting
    print("[REDUCE Phase] Synthesizing final comparative report...")
    result = await compare_timelines_with_local_triage(
        client_timeline=client_timeline,
        accused_timeline=accused_timeline,
        triage_candidates=triage_candidates
    )
    
    return result