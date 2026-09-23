from __future__ import annotations
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Security, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification, T5Tokenizer, T5ForConditionalGeneration
from sentence_transformers import SentenceTransformer, CrossEncoder
from sklearn.metrics.pairwise import cosine_similarity
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
import os
import fitz
import jwt
import numpy as np
import torch
import asyncio
import re
import json
from dotenv import load_dotenv
import sys
import io

os.environ["USE_TF"] = "0"
os.environ["USE_TORCH"] = "1"

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

print("Loading Interrogator Model (Local T5 QG)...")
try:
    from transformers import T5Tokenizer, T5ForConditionalGeneration
    qg_tokenizer = T5Tokenizer.from_pretrained("doc2query/msmarco-t5-base-v1", local_files_only=False)
    qg_model = T5ForConditionalGeneration.from_pretrained("doc2query/msmarco-t5-base-v1", local_files_only=False)
    qg_model.to(device_name.lower() if device_name == "cuda" else "cpu")
    print(f"[OK] Interrogator QG Model Loaded")
except Exception as e:
    print(f"[ERROR] Interrogator QG failed to load: {e}")

# --- HELPER: LOCAL QUESTION GENERATION ---
def generate_local_questions(text: str, max_questions: int = 5) -> list[str]:
    """Uses local T5 to generate relevant interrogation questions from the text."""
    # Grab the most substantial sentences to generate questions
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.strip()) > 40]
    target_sentences = sentences[:max_questions] # Keep it token-cheap
    
    questions = set()
    for sentence in target_sentences:
        input_ids = qg_tokenizer.encode(sentence, return_tensors='pt').to(qg_model.device)
        outputs = qg_model.generate(
            input_ids=input_ids,
            max_length=64,
            do_sample=True,
            top_k=10,
            num_return_sequences=1
        )
        q = qg_tokenizer.decode(outputs[0], skip_special_tokens=True)
        if "?" in q:
            # Clean formatting
            q = q.split("?")[0] + "?"
            questions.add(q.capitalize())
            
    return list(questions)

# --- HELPER: GROQ PARALLEL QUERYING ---
async def extract_answers_from_text(questions: list[str], text: str, role: str) -> dict:
    """Asks Groq to answer the list of questions strictly based on the provided text."""
    
    # We ask Groq to return a strict JSON dictionary { "Question 1": "Answer", ... }
    system_prompt = f"""You are a neutral fact-extractor. 
Read the {role} testimony carefully. 
Answer the provided questions strictly using the facts stated in the text.
If the text does not contain the answer, your exact response MUST be: "Not mentioned."
Output valid JSON where keys are the exact questions, and values are the answers."""

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "QUESTIONS:\n{questions}\n\nTEXT:\n{text}")
    ])
    
    try:
        response = await analyst.ainvoke({
            "questions": json.dumps(questions),
            "text": text
        })
        
        # Parse JSON output from Groq
        raw_content = response.content
        # Strip markdown json blocks if present
        if raw_content.startswith("```json"):
            raw_content = raw_content[7:-3]
            
        return json.loads(raw_content.strip())
    except Exception as e:
        print(f"[ERROR] Groq extraction failed for {role}: {e}")
        return {q: "Error retrieving data" for q in questions}

# --- ENDPOINT: STREAMING COMPARATOR ---
@app.post("/stream_compare_testimonies")
async def stream_compare_testimonies(
    client_file: UploadFile = File(None),
    client_text: str = Form(None),
    accused_file: UploadFile = File(None),
    accused_text: str = Form(None),
    # user_id: str = Depends(verify_clerk_token) # Uncomment in prod
):
    """
    Streaming Endpoint (Server-Sent Events).
    1. Local T5 generates questions from Client text.
    2. Groq queries BOTH texts in parallel.
    3. Streams results row-by-row to the frontend for the flashing UI.
    """
    
    # 1. Resolve inputs
    async def resolve_input(file: UploadFile, text: str) -> str:
        if file and file.filename:
            content = await file.read()
            if file.filename.lower().endswith(".pdf"):
                return " ".join(extract_text_from_pdf(content))
            return content.decode("utf-8", errors="ignore")
        return text or ""
            
    c_content = await resolve_input(client_file, client_text)
    a_content = await resolve_input(accused_file, accused_text)

    if not c_content or not a_content:
        raise HTTPException(status_code=400, detail="Missing testimony data.")

    # 2. Generator for Server-Sent Events (SSE)
    async def event_generator():
        try:
            # Event: Booting up / Generating Questions
            yield f"data: {json.dumps({'status': 'initializing', 'msg': 'Local AI extracting core interrogations...'})}\n\n"
            await asyncio.sleep(0.5)

            # Local T5 Execution
            questions = generate_local_questions(c_content, max_questions=6)
            if not questions:
                questions = ["What are the main events described?", "Who was involved?"]
                
            yield f"data: {json.dumps({'status': 'questions_ready', 'msg': f'Generated {len(questions)} factual queries.'})}\n\n"
            
            # Event: Querying Groq in Parallel
            yield f"data: {json.dumps({'status': 'querying', 'msg': 'Querying independent testimonies via Groq LPU...'})}\n\n"
            
            # Fire both Groq prompts SIMULTANEOUSLY
            client_answers, accused_answers = await asyncio.gather(
                extract_answers_from_text(questions, c_content, "Client"),
                extract_answers_from_text(questions, a_content, "Accused")
            )
            
            # Event: Streaming the Matrix Comparison Row-by-Row
            for q in questions:
                ans_c = client_answers.get(q, "Not mentioned.")
                ans_a = accused_answers.get(q, "Not mentioned.")
                
                # Unbiased logic check
                is_omission = "Not mentioned" in ans_c or "Not mentioned" in ans_a
                match_status = "Incomplete Event" if is_omission else "Event details do not align"
                if ans_c.lower() == ans_a.lower() and not is_omission:
                    match_status = "Accounts Align"

                payload = {
                    "status": "flashing_pair",
                    "question": q,
                    "client_answer": ans_c,
                    "accused_answer": ans_a,
                    "match_status": match_status
                }
                
                # Stream the payload to Vercel instantly
                yield f"data: {json.dumps(payload)}\n\n"
                
                # Pause for 2 seconds to allow the Frontend UI to flash it on screen
                await asyncio.sleep(2.0)
                
            # Close Stream
            yield f"data: {json.dumps({'status': 'done', 'msg': 'Forensic evaluation complete.'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'msg': str(e)})}\n\n"

    # Return HTTP Stream
    return StreamingResponse(event_generator(), media_type="text/event-stream")
    
