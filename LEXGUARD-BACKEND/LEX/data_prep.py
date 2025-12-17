import pandas as pd
import json
import os
from tqdm import tqdm
import re

# --- CONFIGURATION ---
JSON_FILENAME = "CUAD_v1.json"

def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

def prepare_data():
    if not os.path.exists(JSON_FILENAME):
        print("Error: CUAD_v1.json not found. Run the previous script to download it first.")
        return

    print("Step 1: Loading JSON...")
    with open(JSON_FILENAME, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    # 1. Indemnity, 2. Termination, 3. Non-Compete
    # We use simpler keywords to ensure we match the keys
    target_map = {
        "Indemni": 1,           # Matches "Indemnification"
        "Termination for C": 2, # Matches "Termination for Convenience"
        "Non-Compete": 3        # Matches "Non-Compete"
    }
    
    processed_data = []
    match_counts = {1: 0, 2: 0, 3: 0}

    print("Step 2: Processing...")
    
    # Iterate through contracts
    for contract in tqdm(raw_data['data']):
        for paragraph in contract['paragraphs']:
            context = paragraph['context'] # The full contract text
            
            # --- A. Find Risky Zones (Character Indices) ---
            risky_zones = []
            qas = paragraph['qas']
            
            for qa in qas:
                question_text = qa['question']
                
                # Check if this question matches our keywords
                found_label = 0
                for keyword, label_id in target_map.items():
                    if keyword.lower() in question_text.lower():
                        found_label = label_id
                        break
                
                if found_label > 0:
                    for answer in qa['answers']:
                        start_char = answer['answer_start']
                        text_len = len(answer['text'])
                        risky_zones.append({
                            'start': start_char,
                            'end': start_char + text_len,
                            'label': found_label
                        })
                        match_counts[found_label] += 1

            # --- B. Create Overlapping Chunks (Character Based) ---
            # Window size = 1500 characters (approx 250-300 words)
            chunk_size = 1500 
            overlap = 300
            
            total_len = len(context)
            
            for i in range(0, total_len, chunk_size - overlap):
                chunk_start = i
                chunk_end = min(i + chunk_size, total_len)
                chunk_text = context[chunk_start:chunk_end]
                
                # Skip tiny chunks at the end
                if len(chunk_text) < 100:
                    continue

                # --- C. Label the Chunk ---
                assigned_label = 0
                
                for zone in risky_zones:
                    # Check overlap: Does the risky zone start/end inside this chunk?
                    # 1. Clause starts inside chunk
                    cond1 = (chunk_start <= zone['start'] < chunk_end)
                    # 2. Clause ends inside chunk
                    cond2 = (chunk_start < zone['end'] <= chunk_end)
                    # 3. Clause covers the whole chunk (huge clause)
                    cond3 = (zone['start'] <= chunk_start and zone['end'] >= chunk_end)
                    
                    if cond1 or cond2 or cond3:
                        assigned_label = zone['label']
                        break
                
                # Clean and Add
                processed_data.append({
                    'text': clean_text(chunk_text),
                    'label': assigned_label
                })

    df = pd.DataFrame(processed_data)

    print("\n--- DEBUG STATS ---")
    print(f"Total Risky Clauses Found in JSON: {match_counts}")
    print(f"Total Chunks Created: {len(df)}")
    print(f"Label Counts in Dataframe:\n{df['label'].value_counts()}")

    # Step 3: Balance
    df_risky = df[df['label'] != 0]
    
    if len(df_risky) == 0:
        print("Error: Logic failed to map indices to chunks.")
        return

    # Keep 3x Safe chunks
    safe_target = len(df_risky) * 3
    df_safe = df[df['label'] == 0].sample(n=min(safe_target, len(df[df['label']==0])), random_state=42)
    
    df_final = pd.concat([df_risky, df_safe]).sample(frac=1, random_state=42)
    df_final.to_csv("train_data.csv", index=False)
    print(f"Success! Saved 'train_data.csv' with {len(df_final)} rows.")

if __name__ == "__main__":
    prepare_data()