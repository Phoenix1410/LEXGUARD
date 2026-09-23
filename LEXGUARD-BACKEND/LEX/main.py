from __future__ import annotations
import os

# 1. Force PyTorch mode: Prevents Transformers from scanning TensorFlow/Keras 3
os.environ["USE_TF"] = "0"
os.environ["USE_TORCH"] = "1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import sys
import io

# Ensure unbuffered, UTF-8 stdout for instant Hugging Face container logging
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(line_buffering=True, encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(line_buffering=True, encoding='utf-8', errors='replace')
    except Exception:
        pass

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
from typing import Optional, List, Dict, Any

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

# --- CONFIG & PATHS (SANITIZED) ---
MODEL_DIR = "./lexguard_model"
ABS_MODEL_PATH = os.path.abspath(MODEL_DIR)

# Sanitize GROQ_API_KEY: Strips all invisible newlines, carriage returns, and spaces
raw_groq_key = os.getenv("GROQ_API_KEY", "")
GROQ_API_KEY = raw_groq_key.strip() if raw_groq_key else None

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")

# --- SECURITY (CLERK AUTH) ---
security = HTTPBearer()

def verify_clerk_token(credentials: HTTPAuthorizationCredentials = Security(security)):
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
        print(f"[AUTH WARNING] Clerk token notice: {e}", flush=True)
        return "clerk_user"

# --- LOAD MODELS ---
device_id = 0 if torch.cuda.is_available() else -1
device_name = "GPU (CUDA)" if device_id == 0 else "CPU"

# 1. THE SNIPER (DistilRoBERTa - Contract Risk Detection)
print(f"Loading Sniper Model from: {ABS_MODEL_PATH}", flush=True)
try:
    sniper_model = AutoModelForSequenceClassification.from_pretrained(ABS_MODEL_PATH, local_files_only=True)
    sniper_tokenizer = AutoTokenizer.from_pretrained(ABS_MODEL_PATH, local_files_only=True)
    sniper = pipeline("text-classification", model=sniper_model, tokenizer=sniper_tokenizer, device=device_id)
    print(f"[OK] Sniper Model Loaded ({device_name})", flush=True)
except Exception as e:
    print(f"[WARNING] Sniper Model load warning: {e}", flush=True)
    sniper = None
    sniper_tokenizer = None

# 2. THE SCOUT (Sentence-BERT - Semantic Search)
print("Loading Scout Model (Semantic Search)...", flush=True)
try:
    scout_device = "cuda" if torch.cuda.is_available() else "cpu"
    scout = SentenceTransformer('all-MiniLM-L6-v2', device=scout_device) 
    print(f"[OK] Scout Model Loaded ({scout_device.upper()})", flush=True)
except Exception as e:
    print(f"[WARNING] Scout Model load warning: {e}", flush=True)
    scout = None

# 3. THE SENTINEL (Cross-Encoder NLI)
print("Loading Sentinel Model (Local NLI Triage)...", flush=True)
try:
    nli_device = "cuda" if torch.cuda.is_available() else "cpu"
    nli_classifier = CrossEncoder("cross-encoder/nli-deberta-v3-small", device=nli_device)
    print(f"[OK] Sentinel NLI Model Loaded ({nli_device.upper()})", flush=True)
except Exception as e:
    print(f"[WARNING] Sentinel NLI load warning: {e}", flush=True)
    nli_classifier = None

# 4. THE INTERROGATOR (Local T5 Question Generator - Fast Fallback)
print("Loading Interrogator Model (Local T5-SQuAD Fast Fallback)...", flush=True)
try:
    qg_device = "cuda" if torch.cuda.is_available() else "cpu"
    qg_tokenizer = T5Tokenizer.from_pretrained("valhalla/t5-small-qg-prepend", local_files_only=False)
    qg_model = T5ForConditionalGeneration.from_pretrained("valhalla/t5-small-qg-prepend", local_files_only=False)
    qg_model.to(qg_device)
    print(f"[OK] Interrogator T5 Fallback Model Loaded ({qg_device.upper()})", flush=True)
except Exception as e:
    print(f"[WARNING] Interrogator T5 Fallback load notice: {e}", flush=True)
    qg_tokenizer = None
    qg_model = None

# 5. THE ANALYST (Groq Reasoning Engine with Timeout & Retries)
if not GROQ_API_KEY:
    print("[WARNING] GROQ_API_KEY not found in environment.", flush=True)

DEFAULT_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
analyst = ChatGroq(
    temperature=0,
    model_name=DEFAULT_MODEL,
    groq_api_key=GROQ_API_KEY,
    request_timeout=35.0,
    max_retries=2
)
print(f"[OK] Analyst Model Configured: {DEFAULT_MODEL}", flush=True)

# --- HELPER FUNCTIONS ---

def extract_text_from_pdf(file_bytes: bytes) -> list[str]:
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
        print(f"[ERROR] Analyst evaluation failed: {e}", flush=True)
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
    Extracts OBJECTIVE, THIRD-PERSON factual questions from Party A's text.
    Focuses strictly on observable shared facts: Times, Doors, Aisles, Exits, Parking.
    """
    system_prompt = """You are a senior forensic legal interrogator.
Analyze Party A's testimony. Extract 4 to 6 OBJECTIVE, THIRD-PERSON factual assertions.

STRICT CRITERIA:
1. NEVER write questions in the first person ("I", "me", "my bag", "my wallet"). 
   Always refer to the parties as "the complainant", "Party A", or "the accused".
2. Focus ONLY on observable, external facts that both parties or security could witness:
   - Arrival time and entrance door used
   - In-store location, movements, and observations of the other party (e.g., electronics aisle, pharmacy, registers)
   - Departure time and exit door used
   - Parking lot location
3. NEVER ask about private internal actions (e.g., do NOT ask about checking phone prices or private thoughts).
4. For each question, extract the EXACT verbatim sentence from Party A's testimony answering it as 'party_a_fact'.
5. Respond ONLY with a valid JSON object matching this structure:
{
  "queries": [
    {
      "id": 0,
      "question": "At what time and through which door did the accused allegedly exit the store?",
      "party_a_fact": "Security reviewed footage and pointed me toward the accused, who had exited through the side door near the pharmacy at approximately 6:35 PM."
    }
  ]
}"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "PARTY A TESTIMONY:\n{text}")
    ])

    chain = prompt | analyst
    response = await chain.ainvoke({"text": text})
    raw_content = response.content.strip()

    # 1. Clean reasoning tags (<think>...</think>) if present
    raw_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()
    
    # 2. Clean markdown code block markers
    if "```" in raw_content:
        raw_content = re.sub(r"```(?:json)?", "", raw_content).replace("```", "").strip()

    # 3. Extract JSON object
    json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group(0))
            items = data.get("queries", []) if isinstance(data, dict) else data
            valid_items = []
            for idx, item in enumerate(items[:max_items]):
                q_text = str(item.get("question", "")).strip()
                fact_text = str(item.get("party_a_fact", "")).strip()
                if q_text and fact_text:
                    valid_items.append({
                        "id": idx,
                        "question": q_text,
                        "party_a_fact": fact_text
                    })
            if valid_items:
                return valid_items
        except Exception as parse_err:
            print(f"[PARSER ERROR] {parse_err} | Raw: {raw_content[:150]}", flush=True)

    raise ValueError(f"Groq output could not be parsed: {raw_content[:150]}")

def generate_dynamic_questions_local_t5(text: str, max_items: int = 5) -> list[dict]:
    """
    FAST CPU FALLBACK: Uses greedy decoding (num_beams=1) to finish in ~1.5s on CPU.
    """
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 30]
    factual_pairs = []
    
    if qg_model and qg_tokenizer:
        for idx, sentence in enumerate(sentences[:max_items]):
            try:
                input_text = f"context: {sentence}"
                input_ids = qg_tokenizer.encode(input_text, return_tensors='pt').to(qg_model.device)
                outputs = qg_model.generate(
                    input_ids=input_ids,
                    max_length=36,
                    num_beams=1,
                    do_sample=False
                )
                generated_q = qg_tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
                if "?" in generated_q and len(generated_q.split()) > 3:
                    factual_pairs.append({
                        "id": len(factual_pairs),
                        "question": generated_q.capitalize(),
                        "party_a_fact": sentence
                    })
            except Exception as e:
                print(f"[LOCAL QG WARNING] Failed on sentence: {e}", flush=True)

    if not factual_pairs:
        for idx, sentence in enumerate(sentences[:max_items]):
            factual_pairs.append({
                "id": idx,
                "question": f"Regarding: '{sentence[:55]}...' — what does Party B state?",
                "party_a_fact": sentence
            })

    return factual_pairs

async def extract_party_b_answers(factual_pairs: list[dict], party_b_text: str) -> dict[int, str]:
    """
    Queries Party B on the exact questions using integer ID mapping.
    """
    queries_formatted = "\n".join([
        f'Query {item["id"]}: "{item["question"]}"'
        for item in factual_pairs
    ])

    system_prompt = """You are an objective forensic legal cross-examiner.
Examine Party B's testimony against each of the provided numbered queries.

RULES:
1. If Party B mentions facts addressing the query (even if they contradict or give a different version), state Party B's version concisely.
2. If Party B's statement does NOT address or mention the subject matter of that query, output exactly: "Not mentioned."
3. Respond ONLY with a valid JSON object with a root key "answers":
{
  "answers": [
    {"id": 0, "answer": "Party B's statement or Not mentioned."}
  ]
}"""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "NUMBERED QUERIES:\n{queries}\n\nPARTY B TESTIMONY:\n{testimony}")
    ])
    
    chain = prompt | analyst
    response = await chain.ainvoke({
        "queries": queries_formatted,
        "testimony": party_b_text
    })
    
    raw_content = response.content.strip()
    raw_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()
    if "```" in raw_content:
        raw_content = re.sub(r"```(?:json)?", "", raw_content).replace("```", "").strip()

    json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
    results_map = {}
    if json_match:
        try:
            data = json.loads(json_match.group(0))
            items = data.get("answers", []) if isinstance(data, dict) else data
            for entry in items:
                if "id" in entry and "answer" in entry:
                    results_map[int(entry["id"])] = str(entry["answer"]).strip()
        except Exception as e:
            print(f"[PARTY B PARSE WARNING] {e}", flush=True)

    for item in factual_pairs:
        idx = item["id"]
        if idx not in results_map:
            results_map[idx] = "Not mentioned."

    return results_map

# --- API ENDPOINTS ---

@app.get("/")
async def health_check():
    """Live diagnostic: Tests API key formatting, DNS, direct HTTPS, and LangChain Groq invocation."""
    import socket
    import urllib.request
    
    diagnostic = {}
    
    # 1. Key Sanitization Check
    diagnostic["key_present"] = bool(GROQ_API_KEY)
    diagnostic["key_length"] = len(GROQ_API_KEY) if GROQ_API_KEY else 0
    diagnostic["key_format_valid"] = (GROQ_API_KEY.startswith("gsk_") and len(GROQ_API_KEY) > 20) if GROQ_API_KEY else False

    # 2. DNS Check
    try:
        ip = socket.gethostbyname("api.groq.com")
        diagnostic["dns_resolution"] = f"SUCCESS ({ip})"
    except Exception as dns_err:
        diagnostic["dns_resolution"] = f"FAILED: {str(dns_err)}"

    # 3. Direct HTTPS Ping
    if GROQ_API_KEY:
        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                diagnostic["direct_groq_api_auth"] = f"SUCCESS (HTTP {response.status} - Key is Valid!)"
        except urllib.error.HTTPError as http_err:
            diagnostic["direct_groq_api_auth"] = f"FAILED: HTTP {http_err.code} ({http_err.reason})"
        except Exception as conn_err:
            diagnostic["direct_groq_api_auth"] = f"NETWORK ERROR: {str(conn_err)}"
    else:
        diagnostic["direct_groq_api_auth"] = "SKIPPED (No Key)"

    # 4. LangChain SDK Execution
    try:
        test_res = await analyst.ainvoke("Reply only with the word: ONLINE")
        diagnostic["groq_sdk_execution"] = f"ONLINE ({test_res.content.strip()})"
    except Exception as sdk_err:
        cause = getattr(sdk_err, "__cause__", None)
        diagnostic["groq_sdk_execution"] = f"FAILED: {type(sdk_err).__name__} ({str(sdk_err)}) | Cause: {cause}"

    return {
        "status": "LexGuard Brain Diagnostic",
        "diagnostics": diagnostic,
        "models": ["Sniper", "Scout", "Sentinel (NLI)", "Interrogator (T5)", "Analyst"]
    }

@app.post("/users/sync")
async def sync_user(user_data: UserSync):
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
        print(f"[ERROR] Syncing user failed: {e}", flush=True)
        return {"status": "User sync skipped (standalone mode)"}

@app.post("/analyze_document")
async def analyze_document(
    file: UploadFile = File(...),
    user_rule: str = Form(None),
    user_id: str = Depends(verify_clerk_token)
):
    print(f"[UPLOADING] User {user_id} uploading: {file.filename}", flush=True)
    
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
    
    if sniper and sniper_tokenizer:
        sniper_preds = sniper(clauses, batch_size=8, truncation=True)
    else:
        sniper_preds = [{'label': 'LABEL_0', 'score': 1.0} for _ in clauses]

    semantic_matches = set()
    if scout and user_rule and len(user_rule.strip()) > 5:
        rule_vec = scout.encode([user_rule])
        clause_vecs = scout.encode(clauses)
        sim_scores = cosine_similarity(rule_vec, clause_vecs)[0]
        top_indices = np.argsort(sim_scores)[-3:]
        for idx in top_indices:
            if sim_scores[idx] > 0.30:
                semantic_matches.add(int(idx))

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
    1. Primary: Groq dynamically isolates single-subject, third-person questions.
    2. Fast Fallback: Local T5 takes over in ~1.5s if Groq is unavailable.
    3. Cross-examines Party B on identical queries using integer indexes.
    4. Anti-buffering headers flush SSE chunks to Vercel instantly.
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
            await asyncio.sleep(0.2)

            # 2. Extract Questions (Primary Groq -> Fast Fallback Local T5)
            try:
                factual_pairs = await generate_dynamic_questions_groq(c_content, max_items=6)
                mode_label = "Groq LPU"
                print(f"[SUCCESS] Groq generated {len(factual_pairs)} objective questions.", flush=True)
            except Exception as qg_err:
                print(f"[NOTICE] Groq QG failed ({qg_err}). Engaging Fast T5 Fallback...", flush=True)
                factual_pairs = generate_dynamic_questions_local_t5(c_content, max_items=5)
                mode_label = f"T5 Fallback ({type(qg_err).__name__})"

            yield f"data: {json.dumps({'status': 'questions_ready', 'msg': f'Isolated {len(factual_pairs)} focused factual queries ({mode_label}).'})}\n\n"
            await asyncio.sleep(0.2)

            # 3. Query Party B on the exact questions
            yield f"data: {json.dumps({'status': 'querying', 'msg': 'Cross-examining Party B on identical factual queries...'})}\n\n"
            try:
                party_b_answers = await extract_party_b_answers(factual_pairs, a_content)
                print(f"[SUCCESS] Party B answered {len(party_b_answers)} queries.", flush=True)
            except Exception as pb_err:
                print(f"[ERROR] Party B extraction failed: {pb_err}", flush=True)
                party_b_answers = {item["id"]: "Not mentioned." for item in factual_pairs}

            # 4. Stream Matrix Results Row-by-Row
            for item in factual_pairs:
                q_id = item["id"]
                question = item["question"]
                ans_a = item["party_a_fact"]
                ans_b = party_b_answers.get(q_id, "Not mentioned.")

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
                await asyncio.sleep(1.8)
                
            # 5. Complete Stream
            yield f"data: {json.dumps({'status': 'done', 'msg': 'Forensic cross-examination complete.'})}\n\n"

        except Exception as e:
            print(f"[STREAM ERROR] {e}", flush=True)
            yield f"data: {json.dumps({'status': 'error', 'msg': str(e)})}\n\n"

    # Anti-buffering headers for NGINX/Hugging Face Spaces
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)
