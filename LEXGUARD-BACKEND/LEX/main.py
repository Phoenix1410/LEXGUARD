from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Security, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from sentence_transformers import SentenceTransformer
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
            raise HTTPException(status_code=401, detail="Subject identifier ('sub') missing from token")
        return user_id
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
        )

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
    # Set device dynamically on sentence transformer if GPU is available
    scout_device = "cuda" if torch.cuda.is_available() else "cpu"
    scout = SentenceTransformer('all-MiniLM-L6-v2', device=scout_device) 
    print(f"[OK] Scout Model Loaded ({scout_device.upper()})")
except Exception as e:
    print(f"[ERROR] Error loading Scout: {e}")
    exit()

# 3. THE ANALYST (Groq Llama-3 - Reasoning)
if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment.")

analyst = ChatGroq(
    temperature=0,
    model_name="llama-3.3-70b-versatile",
    groq_api_key=GROQ_API_KEY
)

# --- HELPER FUNCTIONS ---

def extract_text_from_pdf(file_bytes) -> list[str]:
    """Parses PDF bytes into structured, bite-sized legal clause chunks."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text_chunks = []
    
    for page in doc:
        # 'blocks' returns visual bounding box groups
        blocks = page.get_text("blocks")
        for b in blocks:
            raw_text = b[4].strip()
            if not raw_text:
                continue
                
            clean_text = " ".join(raw_text.split()).strip()
            if len(clean_text) <= 50:
                continue

            # If block is large (> 250 chars), break into logical sub-clauses at sentence/section boundaries
            if len(clean_text) > 250:
                # Split at periods, colons, semi-colons followed by new thoughts/capital letters
                sub_clauses = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9("])|(?<=;)\s+(?=[A-Z0-9("])', clean_text)
                current_chunk = ""
                
                for clause in sub_clauses:
                    clause_str = clause.strip()
                    if not clause_str:
                        continue
                    
                    # Accumulate sentences into coherent ~150-250 character clause chunks
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

async def process_analyst_evaluation(clause: str, user_rule: str | None, source_str: str, index: int, pred_score: float, risk_type: str):
    """Asynchronous wrapper to query the LLM concurrently for a flagged clause."""
    system_msg = f"""
    You are a legal auditor.
    Detection Reason: {source_str}
    User's Constraint Rule: {user_rule if user_rule else "None"}
    
    Task:
    1. Summarize this clause in plain English.
    2. If the user provided a rule, EXPLICITLY check if this clause violates it.
    3. If it is risky, suggest a safer rewrite.
    """
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_msg),
        ("human", clause)
    ])
    
    try:
        # Utilize non-blocking async invoke
        ai_response = await (prompt | analyst).ainvoke({})
        explanation = ai_response.content
    except Exception as e:
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
    return {"status": "LexGuard Brain is Online 🧠", "models": ["Sniper", "Scout", "Analyst"]}

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
    
    # Safety check: log warnings for text blocks exceeding model max context length (512 tokens)
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
        
        # Take up to top 3 indices matching best scores
        top_indices = np.argsort(sim_scores)[-3:] 
        
        for idx in top_indices:
            if sim_scores[idx] > 0.30:  # Match threshold
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
            
            # Queue up the coroutine instead of executing instantly
            task = process_analyst_evaluation(
                clause=clause,
                user_rule=user_rule,
                source_str=source_str,
                index=i,
                pred_score=pred['score'],
                risk_type=assigned_risk
            )
            analysis_tasks.append(task)

    # Resolve all queued Groq tasks concurrently
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

# --- TESTIMONY VALIDATOR (Map-Reduce) ---

async def extract_timeline(transcript_text: str, party_name: str) -> Timeline:
    """Map Phase: Extract chronological events from a single transcript."""
    print(f"[MAP] Extracting timeline for {party_name}...")
    structured_analyst = analyst.with_structured_output(Timeline)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", f"You are a forensic legal analyst. Extract a chronological timeline of events for the {party_name} from the provided testimony transcript. Ensure exact source quotes are included for each event."),
        ("human", transcript_text)
    ])
    
    try:
        timeline = await (prompt | structured_analyst).ainvoke({})
        return timeline
    except Exception as e:
        print(f"[ERROR] Failed to extract timeline for {party_name}: {e}")
        # Return empty timeline on failure
        return Timeline(party=party_name, events=[])

async def compare_timelines(client_timeline: Timeline, accused_timeline: Timeline) -> ComparativeAnalysisResult:
    """Reduce Phase: Compare the extracted timelines to find discrepancies."""
    print(f"[REDUCE] Comparing timelines...")
    
    # Create a temporary container model since with_structured_output expects a Pydantic class
    class DiscrepancyReport(BaseModel):
        discrepancies: list[Discrepancy]
        
    structured_analyst = analyst.with_structured_output(DiscrepancyReport)
    
    system_prompt = """
    You are a forensic legal auditor comparing two testimony timelines: one from the Client, one from the Accused.
    Your task is to identify discrepancies strictly based on these two rules:
    1. Direct Conflict: The Client and Accused state directly opposing facts about the same event.
    2. Omission: One party mentions a critical event or detail that the other party completely leaves out.
    
    For each discrepancy, classify it, describe the timeframe, provide both versions (if available), and explain your reasoning.
    Assign a severity (High, Medium, Low) based on its potential legal impact.
    """
    
    human_prompt = f"""
    === CLIENT TIMELINE ===
    {client_timeline.model_dump_json(indent=2)}
    
    === ACCUSED TIMELINE ===
    {accused_timeline.model_dump_json(indent=2)}
    """
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", human_prompt)
    ])
    
    try:
        report = await (prompt | structured_analyst).ainvoke({})
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
    Accepts two testimony transcripts (Client and Accused) via file upload or raw text.
    Executes a Map-Reduce LLM pipeline to extract timelines and flag discrepancies.
    """
    print(f"[API] Testimony Validator requested by user {user_id}")
    
    # 1. Resolve Inputs
    async def resolve_input(file: UploadFile, text: str) -> str:
        if file:
            content = await file.read()
            clauses = extract_text_from_pdf(content)
            return " ".join(clauses)
        elif text:
            return text
        else:
            raise HTTPException(status_code=400, detail="Missing testimony input (provide file or text).")
            
    client_content = await resolve_input(client_file, client_text)
    accused_content = await resolve_input(accused_file, accused_text)
    
    # 2. Map Phase: Extract Timelines (Concurrent)
    print("[MAP Phase] Starting concurrent extraction...")
    client_timeline, accused_timeline = await asyncio.gather(
        extract_timeline(client_content, "Client"),
        extract_timeline(accused_content, "Accused")
    )
    
    # 3. Reduce Phase: Comparative Analysis
    print("[REDUCE Phase] Starting comparative analysis...")
    result = await compare_timelines(client_timeline, accused_timeline)
    
    return result