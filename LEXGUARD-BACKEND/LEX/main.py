from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
import os
import jwt
import fitz  # PyMuPDF
from dotenv import load_dotenv
from typing import Dict, Optional

# DB Imports
from models import UserSync
from database import db

# 1. Setup App & Configuration
load_dotenv()
app = FastAPI(title="JURIDIX AI Core")

# --- CORS CONFIGURATION (CRITICAL FOR REACT) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows localhost:3000, localhost:5173, etc.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODEL PATHS ---
MODEL_DIR = "./juridix_model"
ABS_MODEL_PATH = os.path.abspath(MODEL_DIR)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# 2. Load Models (The Sniper & The Analyst)
print(f"Loading Predictive Model from: {ABS_MODEL_PATH}")
try:
    # Force local loading to prevent Hugging Face URL errors
    model = AutoModelForSequenceClassification.from_pretrained(
        ABS_MODEL_PATH, local_files_only=True
    )
    tokenizer = AutoTokenizer.from_pretrained(
        ABS_MODEL_PATH, local_files_only=True
    )
    # device=0 uses RTX 4060
    classifier = pipeline("text-classification", model=model, tokenizer=tokenizer, device=0)
    print("✅ Sniper Model Loaded on GPU")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    exit()

llm = ChatGroq(
    temperature=0,
    model_name="llama-3.3-70b-versatile",
    groq_api_key=GROQ_API_KEY
)

# 3. Helper: PDF to Text Chunks
def extract_text_from_pdf(file_bytes):
    """
    Opens PDF bytes, extracts text, and splits into paragraphs (clauses).
    """
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text_chunks = []
    
    for page in doc:
        text = page.get_text("text")
        # Split by double newline to find paragraphs
        paragraphs = text.split('\n\n')
        for p in paragraphs:
            clean_p = " ".join(p.split()).strip()
            # Filter out tiny page numbers or headers
            if len(clean_p) > 50: 
                text_chunks.append(clean_p)
    return text_chunks

# 4. API Endpoints

@app.get("/")
def health_check():
    return {"status": "JURIDIX API is Ready", "gpu_active": True}

@app.post("/users/sync")
async def sync_user(user: UserSync):
    """
    Syncs user from Clerk Frontend to MongoDB Backend.
    """
    user_data = user.model_dump()
    # Upsert based on clerk_id
    result = await db.users.update_one(
        {"clerk_id": user.clerk_id},
        {"$set": user_data},
        upsert=True
    )
    return {"status": "synced", "updated": result.modified_count > 0 or result.upserted_id is not None}

@app.post("/analyze_document")
async def analyze_document(
    file: UploadFile = File(...),
    user_rule: str = Form(None) # React sends this as FormData
):
    """
    Main Endpoint: Receives a PDF file + Optional User Rule.
    Returns a list of Risky Clauses with GenAI explanations.
    """
    print(f"📥 Receiving file: {file.filename}")
    
    # A. Read & Parse PDF
    try:
        content = await file.read()
        clauses = extract_text_from_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF: {str(e)}")

    results = []
    
    # B. The Sniper Pass (Batch Prediction)
    # We predict all clauses at once for speed
    print(f"🔍 Scanning {len(clauses)} clauses...")
    
    # Map model output to human labels
    label_map = {"LABEL_0": "Safe", "LABEL_1": "Termination", "LABEL_2": "Non-Compete"}
    
    # Run inference (This is fast on RTX 4060)
    predictions = classifier(clauses, batch_size=8, truncation=True)

    # C. The Filter & Logic Pass
    for i, (clause, pred) in enumerate(zip(clauses, predictions)):
        label_str = pred['label']
        score = pred['score']
        risk_type = label_map.get(label_str, "Safe")

        # LOGIC: We only keep it if it's RISKY OR if User has a specific rule to check
        # (We skip "Safe" clauses to save GenAI tokens and Frontend clutter)
        is_risky = risk_type != "Safe"
        has_rule = user_rule is not None and len(user_rule) > 5
        
        if is_risky or has_rule:
            
            explanation = "Standard standard clause."
            
            # D. The Analyst Pass (GenAI)
            # Only call GenAI if it's actually risky or we need to check a rule
            # If it's Safe but we have a rule, we ask GenAI to check that rule specifically
            if is_risky or (has_rule and i < 20): # Limit rule checking to first 20 clauses for speed
                
                system_msg = f"""
                You are a legal auditor.
                Detected Risk Category: {risk_type} (Confidence: {score:.2f})
                User's Constraint Rule: {user_rule if user_rule else "None"}
                
                Task:
                1. Summarize what this clause says in plain English.
                2. If a User Rule exists, explicitly state if this clause violates it.
                3. If it is risky, suggest a 1-sentence edit to make it safer.
                """
                
                prompt = ChatPromptTemplate.from_messages([
                    ("system", system_msg),
                    ("human", clause)
                ])
                
                try:
                    # Invoke Groq
                    ai_response = (prompt | llm).invoke({})
                    explanation = ai_response.content
                except Exception as e:
                    explanation = "AI Analysis unavailable."

            # Append to results
            results.append({
                "id": i,
                "text": clause,
                "risk_type": risk_type,
                "confidence": round(score, 4),
                "explanation": explanation
            })

    return {
        "filename": file.filename,
        "total_clauses_scanned": len(clauses),
        "risks_found": len(results),
        "results": results
    }