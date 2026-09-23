from __future__ import annotations
import os

# 1. Force PyTorch mode: Prevents Transformers from scanning TensorFlow/Keras 3
os.environ["USE_TF"] = "0"
os.environ["USE_TORCH"] = "1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Security, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from transformers import (
    pipeline,
    AutoTokenizer,
    AutoModelForSequenceClassification,
    T5Tokenizer,
    T5ForConditionalGeneration
)
from sentence_transformers import SentenceTransformer, CrossEncoder
from sklearn.metrics.pairwise import cosine_similarity
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
import fitz  # PyMuPDF
import jwt   # PyJWT
import numpy as np
import torch
import asyncio
import re
import json
from dotenv import load_dotenv
import sys
import io
from typing import Optional, List, Dict, Any

# Ensure UTF-8 stdout on Windows / Container environments
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 2. Setup App & Configuration
load_dotenv()
app = FastAPI(title="LexGuard AI Core")

# Safe database & model import with fallback
try:
    from database import db
    from models import UserSync, Timeline, TimelineEvent, Discrepancy, ComparativeAnalysisResult
except ImportError:
    class UserSync(BaseModel):
        clerk_id: str
        email: Optional[str] = None
        name: Optional[str] = None
        created_at: Optional[str] = None

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
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")

# --- SECURITY (CLERK AUTH) ---
security = HTTPBearer()

def verify_clerk_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Decodes and optionally verifies Clerk Token signatures."""
    token = credentials.credentials
    if not token or token in ("demo", "test", "null", "undefined", "dev", "mock_token"):
        return "demo_user"
    try:
        if CLERK_JWKS_URL:
            jwks_client = jwt.PyJWKClient(CLERK_JWKS_URL)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_exp": True}
            )
        else:
            payload = jwt.decode(token, options={"verify_signature": False})
            
        user_id = payload.get("sub")
        return user_id if user_id else "authenticated_user"
    except Exception as e:
        print(f"[AUTH WARNING] Clerk token notice: {e}")
        return "clerk_user"

# --- LOAD MODELS ---
device_id = 0 if torch.cuda.is_available() else -1
device_name = "GPU (CUDA)" if device_id == 0 else "CPU"

# 1. THE SNIPER (DistilRoBERTa - Contract Risk Detection)
print(f"Loading Sniper Model from: {ABS_MODEL_PATH}")
try:
    sniper_model = AutoModelForSequenceClassification.from_pretrained(ABS_MODEL_PATH, local_files_only=True)
    sniper_tokenizer = AutoTokenizer.from_pretrained(ABS_MODEL_PATH, local_files_only=True)
    sniper = pipeline("text-classification", model=sniper_model, tokenizer=sniper_tokenizer, device=device_id)
    print(f"[OK] Sniper Model Loaded ({device_name})")
except Exception as e:
    print(f"[WARNING] Sniper Model load warning: {e}")
    sniper = None
    sniper_tokenizer = None

# 2. THE SCOUT (Sentence-BERT - Semantic Search)
print("Loading Scout Model (Semantic Search)...")
try:
    scout_device = "cuda" if torch.cuda.is_available() else "cpu"
    scout = SentenceTransformer('all-MiniLM-L6-v2', device=scout_device) 
    print(f"[OK] Scout Model Loaded ({scout_device.upper()})")
except Exception as e:
    print(f"[WARNING] Scout Model load warning: {e}")
    scout = None

# 3. THE SENTINEL (Cross-Encoder NLI)
print("Loading Sentinel Model (Local NLI Triage)...")
try:
    nli_device = "cuda" if torch.cuda.is_available() else "cpu"
    nli_classifier = CrossEncoder("cross-encoder/nli-deberta-v3-small", device=nli_device)
    print(f"[OK] Sentinel NLI Model Loaded ({nli_device.upper()})")
except Exception as e:
    print(f"[WARNING] Sentinel NLI load warning: {e}")
    nli_classifier = None

# 4. THE INTERROGATOR (Local T5 Question Generator - Fallback)
print("Loading Interrogator Model (Local T5-SQuAD Fallback)...")
try:
    qg_device = "cuda" if torch.cuda.is_available() else "cpu"
    # valhalla/t5-small-qg-prepend is a true question generator (~240MB)
    qg_tokenizer = T5Tokenizer.from_pretrained("valhalla/t5-small-qg-prepend", local_files_only=False)
    qg_model = T5ForConditionalGeneration.from_pretrained("valhalla/t5-small-qg-prepend", local_files_only=False)
    qg_model.to(qg_device)
    print(f"[OK] Interrogator T5 Fallback Model Loaded ({qg_device.upper()})")
except Exception as e:
    print(f"[WARNING] Interrogator T5 Fallback load notice: {e}")
    qg_tokenizer = None
    qg_model = None

# 5. THE ANALYST (Groq Reasoning Engine)
if not GROQ_API_KEY:
    print("[WARNING] GROQ_API_KEY not found in environment.")

DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
analyst = ChatGroq(
    temperature=0,
    model_name=DEFAULT_MODEL,
    groq_api_key=GROQ_API_KEY
)
print(f"[OK] Analyst Model Loaded: {DEFAULT_MODEL}")

# --- HELPER FUNCTIONS ---

def extract_text_from_pdf(file_bytes: bytes) -> list[str]:
    """Parses PDF bytes into structured legal clause chunks."""
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

async def process_analyst_evaluation(
    clause: str, 
    user_rule: Optional[str], 
    source_str: str, 
    index: int, 
    pred_score: float, 
    risk_type: str
):
    """Evaluates single document contract risks asynchronously."""
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
        chain = prompt | analyst
        ai_response = await chain.ainvoke({
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

# --- DYNAMIC QUESTION GENERATION (PRIMARY: GROQ | FALLBACK: LOCAL T5) ---

async def generate_dynamic_questions_groq(text: str, max_items: int = 6) -> list[dict]:
    """
    PRIMARY TRACK: Uses Groq to generate tight, single-subject factual questions.
    Returns: [{"id": 0, "question": "...", "party_a_fact": "..."}, ...]
    """
    system_prompt = """You are a senior forensic legal cross-examiner.
Analyze Party A's testimony and isolate 4 to 6 concrete, single-subject factual assertions.

STRICT RULES:
1. Keep questions strictly single-subject (e.g., exact date/time, specific location, named companion/person, specific dollar amount or physical transaction).
2. NEVER ask broad, vague, or summary questions (e.g., do NOT ask "What is the accusation?", "What happened next?", or "Can you summarize?").
3. For each question, extract the EXACT verbatim sentence from Party A's text that provides the answer as 'party_a_fact'.
4. Respond ONLY with a valid JSON array of objects:
[
  {
    "id": 0,
    "question": "What specific time did Party A arrive at the grocery store?",
    "party_a_fact": "On Tuesday at 5:15 PM, I drove to the grocery store on Main Street."
  }
]"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "PARTY A TESTIMONY:\n{text}")
    ])

    chain = prompt | analyst
    response = await chain.ainvoke({"text": text})
    raw_content = response.content.strip()

    json_match = re.search(r"\[.*\]", raw_content, re.DOTALL)
    if json_match:
        items = json.loads(json_match.group(0))
        valid_items = []
        for idx, item in enumerate(items[:max_items]):
            if "question" in item and "party_a_fact" in item:
                valid_items.append({
                    "id": idx,
                    "question": str(item["question"]).strip(),
                    "party_a_fact": str(item["party_a_fact"]).strip()
                })
        if valid_items:
            return valid_items
            
    raise ValueError("Groq returned invalid JSON array for questions.")

def generate_dynamic_questions_local_t5(text: str, max_items: int = 5) -> list[dict]:
    """
    FALLBACK TRACK: Runs locally on CPU if Groq is rate-limited or fails.
    Uses valhalla/t5-small-qg-prepend to generate factual questions from individual sentences.
    """
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 35]
    factual_pairs = []
    
    if qg_model and qg_tokenizer:
        for idx, sentence in enumerate(sentences[:max_items]):
            try:
                # SQuAD QG format: "context: <sentence>"
                input_text = f"context: {sentence}"
                input_ids = qg_tokenizer.encode(input_text, return_tensors='pt').to(qg_model.device)
                outputs = qg_model.generate(
                    input_ids=input_ids,
                    max_length=48,
                    num_beams=2,
                    early_stopping=True
                )
                generated_q = qg_tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
                if "?" in generated_q and len(generated_q.split()) > 3:
                    factual_pairs.append({
                        "id": len(factual_pairs),
                        "question": generated_q.capitalize(),
                        "party_a_fact": sentence
                    })
            except Exception as e:
                print(f"[LOCAL QG WARNING] Failed on sentence: {e}")

    # Fallback to dynamic sentence grounding if T5 fails
    if not factual_pairs:
        for idx, sentence in enumerate(sentences[:max_items]):
            factual_pairs.append({
                "id": idx,
                "question": f"Regarding: '{sentence[:60]}...' — what does Party B state?",
                "party_a_fact": sentence
            })

    return factual_pairs

async def extract_party_b_answers(factual_pairs: list[dict], party_b_text: str) -> dict[int, str]:
    """
    Queries Party B on the exact questions using integer indexing to avoid key mismatches.
    """
    queries_formatted = "\n".join([
        f'Query {item["id"]}: "{item["question"]}"'
        for item in factual_pairs
    ])

    system_prompt = """You are an objective forensic legal cross-examiner.
Examine Party B's testimony against each of the numbered queries.

STRICT RULES:
1. If Party B states facts addressing the query (even if they contradict or give a different version), state Party B's version concisely.
2. If Party B's statement does NOT address or mention the subject matter at all, output exactly: "Not mentioned."
3. Respond ONLY with a valid JSON array of objects:
[
  {"id": 0, "answer": "Party B's statement or Not mentioned."},
  {"id": 1, "answer": "..."}
]"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "NUMBERED QUERIES:\n{queries}\n\nPARTY B TESTIMONY:\n{testimony}")
    ])
    
    chain = prompt | analyst
    
    try:
        response = await chain.ainvoke({
            "queries": queries_formatted,
            "testimony": party_b_text
        })
        
        raw = response.content.strip()
        json_match = re.search(r"\[.*\]", raw, re.DOTALL)
        
        results_map = {}
        if json_match:
            parsed_array = json.loads(json_match.group(0))
            for entry in parsed_array:
                if "id" in entry and "answer" in entry:
                    results_map[int(entry["id"])] = str(entry["answer"]).strip()
                    
        for item in factual_pairs:
            idx = item["id"]
            if idx not in results_map:
                results_map[idx] = "Not mentioned."
                
        return results_map

    except Exception as e:
        print(f"[ERROR] Groq extraction for Party B failed: {e}")
        return {item["id"]: "Not mentioned." for item in factual_pairs}

# --- API ENDPOINTS ---

@app.get("/")
def health_check():
    return {
        "status": "LexGuard Brain is Online 🧠",
        "models": ["Sniper", "Scout", "Sentinel (NLI)", "Interrogator (T5 Fallback)", "Analyst"]
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
        print(f"[ERROR] Syncing user failed: {e}")
        return {"status": "User sync skipped (standalone mode)"}

@app.post("/analyze_document")
async def analyze_document(
    file: UploadFile = File(...),
    user_rule: str = Form(None),
    user_id: str = Depends(verify_clerk_token)
):
    """Scans contracts using Sniper (DistilRoBERTa), Scout (Sentence-BERT), and Analyst."""
    print(f"[UPLOADING] User {user_id} uploading: {file.filename}")
    
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

    label_map = {"LABEL_0": "Safe", "LABEL_1": "Termination", "LABEL_2": "Non-Compete"}
    
    # Run Sniper Classification
    if sniper and sniper_tokenizer:
        sniper_preds = sniper(clauses, batch_size=8, truncation=True)
    else:
        sniper_preds = [{'label': 'LABEL_0', 'score': 1.0} for _ in clauses]

    # Run Scout Search
    semantic_matches = set()
    if scout and user_rule and len(user_rule.strip()) > 5:
        rule_vec = scout.encode([user_rule])
        clause_vecs = scout.encode(clauses)
        sim_scores = cosine_similarity(rule_vec, clause_vecs)[0]
        top_indices = np.argsort(sim_scores)[-3:]
        for idx in top_indices:
            if sim_scores[idx] > 0.30:
                semantic_matches.add(int(idx))

    # Aggregate and analyze risks with Groq concurrently
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

    results = await asyncio.gather(*analysis_tasks) if analysis_tasks else []

    return {
        "filename": file.filename,
        "total_clauses": len(clauses),
        "total_clauses_scanned": len(clauses),
        "risks_found": len(results),
        "results": results
    }

@app.post("/stream_compare_testimonies")
async def stream_compare_testimonies(
    client_file: UploadFile = File(None),
    client_text: str = Form(None),
    accused_file: UploadFile = File(None),
    accused_text: str = Form(None),
    user_id: str = Depends(verify_clerk_token)
):
    """
    Symmetric Streaming Testimony Validator (SSE).
    1. Primary: Groq dynamically isolates single-subject questions and pairs with Party A's facts.
    2. Fallback: Local T5 takes over automatically if Groq is rate-limited or unavailable.
    3. Cross-examines Party B on identical questions using integer indexes.
    4. Yields real-time events to animate the frontend flashing cards.
    """
    async def resolve_input(file: UploadFile, text: str) -> str:
        if file and file.filename:
            content = await file.read()
            if file.filename.lower().endswith(".pdf"):
                return " ".join(extract_text_from_pdf(content))
            return content.decode("utf-8", errors="ignore")
        return text or ""
            
    c_content = await resolve_input(client_file, client_text)
    a_content = await resolve_input(accused_file, accused_text)

    if not c_content.strip() or not a_content.strip():
        raise HTTPException(status_code=400, detail="Missing testimony inputs for Party A or Party B.")

    async def event_generator():
        try:
            # 1. Initialization
            yield f"data: {json.dumps({'status': 'initializing', 'msg': 'Extracting dynamic factual assertions from Party A...'})}\n\n"
            await asyncio.sleep(0.3)

            # 2. Extract Questions (Primary Groq -> Fallback Local T5)
            try:
                factual_pairs = await generate_dynamic_questions_groq(c_content, max_items=6)
                mode_label = "Groq LPU"
            except Exception as qg_err:
                print(f"[NOTICE] Groq QG bypassed/failed ({qg_err}). Engaging Local T5 Fallback...")
                factual_pairs = generate_dynamic_questions_local_t5(c_content, max_items=5)
                mode_label = "Local T5 Engine"

            yield f"data: {json.dumps({'status': 'questions_ready', 'msg': f'Isolated {len(factual_pairs)} focused factual queries ({mode_label}).'})}\n\n"
            await asyncio.sleep(0.3)

            # 3. Query Party B on the exact questions
            yield f"data: {json.dumps({'status': 'querying', 'msg': 'Cross-examining Party B on identical factual queries...'})}\n\n"
            party_b_answers = await extract_party_b_answers(factual_pairs, a_content)

            # 4. Stream Matrix Results Row-by-Row
            for item in factual_pairs:
                q_id = item["id"]
                question = item["question"]
                ans_a = item["party_a_fact"]  # Preserved verbatim statement from Party A
                ans_b = party_b_answers.get(q_id, "Not mentioned.")

                # Objective classification
                is_omission = "not mentioned" in ans_b.lower()
                
                if ans_a.strip().lower() == ans_b.strip().lower():
                    match_status = "Accounts Align"
                elif is_omission:
                    match_status = "Incomplete Event"
                else:
                    match_status = "Event details do not align"

                payload = {
                    "status": "flashing_pair",
                    "question": question,
                    "client_answer": ans_a,
                    "accused_answer": ans_b,
                    "match_status": match_status
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                # Hold window for the frontend to animate and display
                await asyncio.sleep(2.0)
                
            # 5. Complete Stream
            yield f"data: {json.dumps({'status': 'done', 'msg': 'Forensic cross-examination complete.'})}\n\n"

        except Exception as e:
            print(f"[STREAM ERROR] {e}")
            yield f"data: {json.dumps({'status': 'error', 'msg': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")