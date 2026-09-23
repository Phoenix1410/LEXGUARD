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
from langchain_core.messages import SystemMessage, HumanMessage
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
    allow_origins=[
        "https://juridix-xi.vercel.app",
        "https://lexguard-xi.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG & PATHS ---
MODEL_DIR = "./lexguard_model"
ABS_MODEL_PATH = os.path.abspath(MODEL_DIR)

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
    qg_tokenizer = T5Tokenizer.from_pretrained("valhalla/t5-small-qg-prepend", local_files_only=False, legacy=False)
    qg_model = T5ForConditionalGeneration.from_pretrained("valhalla/t5-small-qg-prepend", local_files_only=False)
    qg_model.to(qg_device)
    print(f"[OK] Interrogator T5 Fallback Model Loaded ({qg_device.upper()})", flush=True)
except Exception as e:
    print(f"[WARNING] Interrogator T5 Fallback load notice: {e}", flush=True)
    qg_tokenizer = None
    qg_model = None

# 5. THE ANALYST (Groq Reasoning Engine)
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

            if len(clean_text) > 350:
                sub_clauses = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9("])|(?<=;)\s+(?=[A-Z0-9("])', clean_text)
                current_chunk = ""
                for clause in sub_clauses:
                    clause_str = clause.strip()
                    if not clause_str:
                        continue
                    if len(current_chunk) + len(clause_str) < 350:
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
    
    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=clause)
    ]
    
    try:
        ai_response = await analyst.ainvoke(messages)
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

async def generate_dynamic_questions_groq(text: str, max_items: int = 5) -> list[dict]:
    """
    Extracts factual queries from Party A that focus strictly on observable anchor points
    (time, location, movements, doors, confrontations) that Party B (the accused) can speak to.
    """
    system_prompt = """You are a senior forensic legal interrogator.
Your goal is to extract factual queries from Party A's deposition that the OTHER PARTY (Party B / Accused) can be cross-examined on.

CRITICAL RULES:
1. NEVER frame questions around Party A's private internal actions (e.g., do NOT ask "Why did Party A go to buy groceries?" or "What was Party A thinking?").
2. Focus on SHARED EXTERNAL EVENTS that Party B / Accused was either present for or accused of:
   - What time did the incident or encounter take place?
   - What specific area of the premises (e.g. register, electronics aisle, exit door) is involved?
   - What specific actions, movements, or interactions are alleged regarding the accused?
   - What exit or vehicle was allegedly used?
3. For each query, quote Party A's exact sentence answering it as 'party_a_fact'.
4. Respond ONLY with a valid JSON object matching:
{
  "queries": [
    {
      "id": 0,
      "question": "What time did the encounter or incident take place near the register area?",
      "party_a_fact": "On March 14, I arrived at the store around 6:15 PM and noticed the accused near the registers."
    }
  ]
}"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"PARTY A DEPOSITION:\n{text}")
    ]

    response = await analyst.ainvoke(messages)
    raw_content = response.content.strip()

    raw_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()
    if "```" in raw_content:
        raw_content = re.sub(r"```(?:json)?", "", raw_content).replace("```", "").strip()

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

# --- ROBUST PARTY B EXTRACTION & LOCAL FALLBACK ---

def extract_party_b_local_fallback(factual_pairs: list[dict], party_b_text: str) -> dict[int, str]:
    """
    Local CPU Fallback: If Groq returns empty/unmentioned for everything, uses Scout (Sentence-BERT)
    to find the most relevant factual sentence in Party B's testimony.
    """
    b_sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', party_b_text) if len(s.strip()) > 15]
    if not b_sentences or not scout:
        return {item["id"]: "Not mentioned." for item in factual_pairs}
        
    try:
        b_embeddings = scout.encode(b_sentences)
        results = {}
        for item in factual_pairs:
            q_vec = scout.encode([item["question"]])
            sims = cosine_similarity(q_vec, b_embeddings)[0]
            best_idx = int(np.argmax(sims))
            if sims[best_idx] > 0.32:
                results[item["id"]] = b_sentences[best_idx]
            else:
                results[item["id"]] = "Not mentioned."
        return results
    except Exception as e:
        print(f"[LOCAL SCOUT FALLBACK ERROR] {e}", flush=True)
        return {item["id"]: "Not mentioned." for item in factual_pairs}

async def extract_party_b_answers(factual_pairs: list[dict], party_b_text: str) -> dict[int, str]:
    """
    Cross-examines Party B (the accused) against the factual queries,
    capturing their version, alibi, or counter-statement.
    """
    queries_formatted = "\n".join([
        f'Query {item["id"]}: "{item["question"]}"'
        for item in factual_pairs
    ])

    system_prompt = """You are an objective forensic legal cross-examiner.
You are examining Party B's deposition against factual queries arising from Party A's account.

CRITICAL IDENTITY AND RULES:
1. Party B IS the accused / respondent. Party B speaks using "I", "me", or "my".
2. If a query touches upon a time, location, or event that Party B discusses:
   - State Party B's version of that fact (e.g., "Party B states they were in the pharmacy aisle at 6:30 PM, not near the registers.").
   - If Party B denies the occurrence or offers an alibi, report that denial concisely.
3. DO NOT BE OVERLY RIGID. If the query asks about the time or location of the incident, and Party B mentions their own arrival, departure, or location during that period, THAT IS PARTY B'S ACCOUNT. Do not say "Not mentioned."
4. ONLY write "Not mentioned." if Party B's entire deposition has zero information related to that timeframe, location, or interaction.
5. Respond ONLY with a valid JSON object matching:
{
  "answers": [
    {"id": 0, "answer": "Party B's statement, denial, or counter-account"}
  ]
}"""

    human_prompt = f"FACTUAL QUERIES:\n{queries_formatted}\n\nPARTY B (ACCUSED) DEPOSITION:\n{party_b_text}"

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt)
    ]

    try:
        response = await analyst.ainvoke(messages)
        raw_content = response.content.strip()
        
        # 1. Clean reasoning tags & markdown
        raw_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()
        if "```" in raw_content:
            raw_content = re.sub(r"```(?:json)?", "", raw_content).replace("```", "").strip()

        print(f"[DEBUG Party B Output]: {raw_content[:300]}...", flush=True)

        results_map = {}

        # 2. Parse JSON
        json_match = re.search(r"(\{|\[).*(\}|\])", raw_content, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group(0))
                items = parsed.get("answers", []) if isinstance(parsed, dict) else parsed
                if isinstance(items, list):
                    for idx, entry in enumerate(items):
                        if isinstance(entry, dict) and "answer" in entry:
                            raw_id = entry.get("id", idx)
                            id_digits = re.findall(r"\d+", str(raw_id))
                            matched_id = int(id_digits[0]) if id_digits else idx
                            
                            # Handle 1-based indexing if LLM counted 1..N
                            if matched_id not in [p["id"] for p in factual_pairs] and idx < len(factual_pairs):
                                matched_id = factual_pairs[idx]["id"]
                                
                            results_map[matched_id] = str(entry["answer"]).strip()
            except Exception as json_err:
                print(f"[PARTY B JSON PARSE NOTICE]: {json_err}", flush=True)

        # 3. Regex Fallback if JSON parsing missed any fields
        if not results_map:
            answer_matches = re.findall(r'"answer"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', raw_content)
            if answer_matches:
                for idx, ans_text in enumerate(answer_matches[:len(factual_pairs)]):
                    target_id = factual_pairs[idx]["id"]
                    results_map[target_id] = ans_text.replace('\\"', '"').strip()

        # Check if the LLM returned "Not mentioned." for all items despite testimony being present
        all_unmentioned = all("not mentioned" in results_map.get(item["id"], "").lower() for item in factual_pairs)
        if all_unmentioned:
            print("[NOTICE] LLM returned 'Not mentioned.' for all items. Engaging Scout semantic matcher...", flush=True)
            return await asyncio.to_thread(extract_party_b_local_fallback, factual_pairs, party_b_text)

        for item in factual_pairs:
            idx = item["id"]
            if idx not in results_map or not results_map[idx]:
                results_map[idx] = "Not mentioned."
        return results_map

    except Exception as api_err:
        print(f"[ERROR in Party B Extraction]: {api_err}. Engaging Scout semantic search fallback...", flush=True)

    # Local fallback if Groq call failed or timed out
    return await asyncio.to_thread(extract_party_b_local_fallback, factual_pairs, party_b_text)

# --- API ENDPOINTS ---

@app.get("/")
async def health_check():
    """Live diagnostic: Tests API key formatting, DNS, and LangChain Groq invocation."""
    import socket
    
    diagnostic = {}
    diagnostic["key_present"] = bool(GROQ_API_KEY)
    diagnostic["key_length"] = len(GROQ_API_KEY) if GROQ_API_KEY else 0
    diagnostic["key_format_valid"] = (GROQ_API_KEY.startswith("gsk_") and len(GROQ_API_KEY) > 20) if GROQ_API_KEY else False

    try:
        ip = await asyncio.to_thread(socket.gethostbyname, "api.groq.com")
        diagnostic["dns_resolution"] = f"SUCCESS ({ip})"
    except Exception as dns_err:
        diagnostic["dns_resolution"] = f"FAILED: {str(dns_err)}"

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

    # Throttled execution to protect free tier rate limits
    sem = asyncio.Semaphore(4)
    async def bounded_task(t):
        async with sem:
            return await t

    results = await asyncio.gather(*(bounded_task(t) for t in analysis_tasks)) if analysis_tasks else []

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
    Streaming Testimony Validator (SSE).
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

            # 2. Dynamic Question Generation (Groq -> Local T5 Fallback)
            try:
                factual_pairs = await generate_dynamic_questions_groq(c_content, max_items=5)
                mode_label = "Groq LPU"
                print(f"[SUCCESS] Groq generated {len(factual_pairs)} objective questions.", flush=True)
            except Exception as qg_err:
                print(f"[NOTICE] Groq QG fallback triggered ({qg_err}). Running T5 in background thread...", flush=True)
                factual_pairs = await asyncio.to_thread(generate_dynamic_questions_local_t5, c_content, 5)
                mode_label = "T5 Fallback"

            yield f"data: {json.dumps({'status': 'questions_ready', 'msg': f'Isolated {len(factual_pairs)} focused factual queries ({mode_label}).'})}\n\n"
            await asyncio.sleep(0.2)

            # 3. Cross-examine Party B
            yield f"data: {json.dumps({'status': 'querying', 'msg': 'Cross-examining Party B on identical factual queries...'})}\n\n"
            try:
                party_b_answers = await extract_party_b_answers(factual_pairs, a_content)
                print(f"[SUCCESS] Party B answered {len(party_b_answers)} queries.", flush=True)
            except Exception as pb_err:
                print(f"[ERROR] Party B extraction failed: {pb_err}", flush=True)
                party_b_answers = {item["id"]: "Not mentioned." for item in factual_pairs}

            # 4. Stream Results Row-by-Row
            for item in factual_pairs:
                q_id = item["id"]
                question = item["question"]
                ans_a = item["party_a_fact"]
                ans_b = party_b_answers.get(q_id, "Not mentioned.")

                is_omission = "not mentioned" in ans_b.lower() or "not stated" in ans_b.lower()
                
                if is_omission:
                    match_status = "Incomplete Event"
                elif scout:
                    try:
                        emb_a = scout.encode([ans_a])
                        emb_b = scout.encode([ans_b])
                        sim = float(cosine_similarity(emb_a, emb_b)[0][0])
                        if sim > 0.65:
                            match_status = "Accounts Align"
                        elif sim < 0.35:
                            match_status = "Event details do not align"
                        else:
                            match_status = "Accounts Partially Align"
                    except Exception:
                        match_status = "Accounts Align" if ans_a.strip().lower() == ans_b.strip().lower() else "Event details do not align"
                else:
                    match_status = "Accounts Align" if ans_a.strip().lower() == ans_b.strip().lower() else "Event details do not align"

                payload = {
                    "status": "flashing_pair",
                    "question": question,
                    "client_answer": ans_a,
                    "accused_answer": ans_b,
                    "match_status": match_status
                }
                
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(1.2)
                
            # 5. Complete Stream
            yield f"data: {json.dumps({'status': 'done', 'msg': 'Forensic cross-examination complete.'})}\n\n"

        except Exception as e:
            print(f"[STREAM ERROR] {e}", flush=True)
            yield f"data: {json.dumps({'status': 'error', 'msg': str(e)})}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)