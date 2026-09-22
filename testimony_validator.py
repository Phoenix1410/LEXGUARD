import os
import re
import numpy as np
from typing import List, Dict, Any
from sentence_transformers import SentenceTransformer, CrossEncoder
from groq import Groq

# 1. Global In-Memory Model Initialization (Runs once at startup)
# Lightweight models tailored for free CPU environments:
# all-MiniLM-L6-v2: ~80MB | nli-deberta-v3-small: ~140MB
embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
nli_cross_encoder = CrossEncoder("cross-encoder/nli-deberta-v3-small")

def get_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set.")
    return Groq(api_key=api_key)

# 2. Transcript & Baseline Segmentation
def segment_transcript(text: str) -> List[str]:
    """
    Preserves legal Q&A structure while splitting unstructured text into atomic claims.
    """
    qa_blocks = re.findall(r'(Q:.*?)(?=(?:Q:|$))', text, flags=re.DOTALL | re.IGNORECASE)
    if qa_blocks:
        chunks = [b.strip().replace('\n', ' ') for b in qa_blocks if len(b.strip()) > 15]
    else:
        # Fallback to paragraph/sentence boundaries
        chunks = [p.strip() for p in re.split(r'\n+|\.\s+', text) if len(p.strip()) > 20]
    return chunks

def segment_baseline(text: str) -> List[str]:
    """Splits contract clauses or baseline facts into discrete clauses/rules."""
    clauses = [c.strip() for c in re.split(r'\n{2,}|\.\s+(?=[A-Z0-9])', text) if len(c.strip()) > 25]
    return clauses if clauses else [text]

# 3. Local Triage Pipeline (Semantic Matching + Local NLI)
def extract_candidate_conflicts(
    baseline_text: str,
    testimony_text: str,
    top_k: int = 2,
    contradiction_threshold: float = 0.45
) -> List[Dict[str, Any]]:
    
    baseline_clauses = segment_baseline(baseline_text)
    testimony_statements = segment_transcript(testimony_text)

    if not baseline_clauses or not testimony_statements:
        return []

    # Local Vector Embeddings (Cosine Similarity)
    clause_embeddings = embedding_model.encode(baseline_clauses, convert_to_numpy=True, normalize_embeddings=True)
    testimony_embeddings = embedding_model.encode(testimony_statements, convert_to_numpy=True, normalize_embeddings=True)

    # Compute similarity matrix: (num_statements x num_clauses)
    sim_matrix = np.dot(testimony_embeddings, clause_embeddings.T)

    candidate_pairs = []
    cross_encoder_inputs = []

    # For each testimony statement, find the most topically aligned baseline clauses
    for i, statement in enumerate(testimony_statements):
        top_clause_indices = np.argsort(sim_matrix[i])[::-1][:top_k]
        for idx in top_clause_indices:
            clause = baseline_clauses[idx]
            cross_encoder_inputs.append((clause, statement))
            candidate_pairs.append({
                "baseline_clause": clause,
                "testimony_claim": statement,
                "similarity": float(sim_matrix[i][idx])
            })

    if not cross_encoder_inputs:
        return []

    # Local NLI Classification
    # Outputs logits for [Contradiction, Entailment, Neutral]
    scores = nli_cross_encoder.predict(cross_encoder_inputs, apply_softmax=True)
    
    flagged_candidates = []
    for pair_data, score_dist in zip(candidate_pairs, scores):
        # nli-deberta-v3 labels: 0: Contradiction, 1: Entailment, 2: Neutral
        contra_score = float(score_dist[0])
        if contra_score >= contradiction_threshold:
            pair_data["contradiction_prob"] = contra_score
            flagged_candidates.append(pair_data)

    # Sort descending by contradiction score and take top candidates
    flagged_candidates.sort(key=lambda x: x["contradiction_prob"], reverse=True)
    return flagged_candidates[:5]

# 4. Few-Shot Prompting Execution via Groq
FEW_SHOT_SYSTEM_PROMPT = """You are a Senior Judicial Analyst and Legal Cross-Examiner.
Your task is to analyze flagged pairs of Baseline Facts (Contracts/Evidence) and Witness Testimony Claims.
Determine whether a true legal contradiction exists, assess perjury/credibility risk, and suggest an impeachment cross-examination question.

Below are exemplary few-shot demonstrations:

[EXAMPLE 1]
Baseline: "Section 8.1 specifies the employee was terminated for cause on March 12, 2024, and surrendered all company access badges."
Claim: "Witness states: 'I continued working at my designated office desk with my normal keycard access until late April 2024.'"
Result: {
  "is_contradiction": true,
  "severity": "HIGH",
  "reasoning": "Direct conflict on dates of physical access and termination timeline. Contradicts documented revocation of badges.",
  "impeachment_question": "If your access was revoked on March 12, can you explain why no keycard logs record your badge after that date?"
}

[EXAMPLE 2]
Baseline: "Vendor shall deliver software assets within 30 business days of initial deposit."
Claim: "Witness states: 'We delivered the codebase on day 40 because two calendar weeks were non-business holidays.'"
Result: {
  "is_contradiction": false,
  "severity": "NONE",
  "reasoning": "The witness clarifies that 30 business days were respected due to holidays. This represents operational ambiguity, not a legal contradiction.",
  "impeachment_question": null
}
"""

def evaluate_with_groq_analyst(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    client = get_groq_client()
    validated_results = []

    for item in candidates:
        user_prompt = f"""Evaluate this suspect pair:
Baseline: "{item['baseline_clause']}"
Claim: "{item['testimony_claim']}"
Local Model Contradiction Score: {item['contradiction_prob']:.2f}

Respond ONLY in valid JSON matching this schema:
{{
  "is_contradiction": true/false,
  "severity": "LOW" | "MEDIUM" | "HIGH" | "NONE",
  "reasoning": "detailed explanation",
  "impeachment_question": "suggested question for counsel or null"
}}"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": FEW_SHOT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        import json
        analysis = json.loads(response.choices[0].message.content)
        
        # Only keep true contradictions or noteworthy ambiguities
        if analysis.get("is_contradiction") or analysis.get("severity") in ["MEDIUM", "HIGH"]:
            validated_results.append({
                "baseline": item["baseline_clause"],
                "claim": item["testimony_claim"],
                "local_confidence": item["contradiction_prob"],
                **analysis
            })

    return validated_results

def run_testimony_pipeline(baseline_text: str, testimony_text: str) -> Dict[str, Any]:
    # Phase 1 & 2: Local Vector Filtering + Local NLI
    candidate_conflicts = extract_candidate_conflicts(baseline_text, testimony_text)
    
    if not candidate_conflicts:
        return {
            "status": "success",
            "contradictions_found": 0,
            "discrepancies": [],
            "verdict": "No contradictions or material inconsistencies detected."
        }

    # Phase 3: Groq Analyst with Few-Shot Legal Reasoning
    final_discrepancies = evaluate_with_groq_analyst(candidate_conflicts)

    return {
        "status": "success",
        "contradictions_found": len(final_discrepancies),
        "discrepancies": final_discrepancies,
        "verdict": f"Identified {len(final_discrepancies)} material inconsistencies requiring cross-examination."
    }
