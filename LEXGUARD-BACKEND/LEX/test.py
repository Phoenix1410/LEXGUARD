from transformers import pipeline

# 1. Load your trained model from the folder
model_path = "./juridix_model"

print("Loading model...")
try:
    # We use the pipeline API for easy testing
    classifier = pipeline("text-classification", model=model_path, tokenizer=model_path)
except Exception as e:
    print(f"Error loading model: {e}")
    exit()

# 2. Define the Mapping (Inverse of train.py)
label_map = {
    "LABEL_0": "✅ Safe / Background",
    "LABEL_1": "⚠️ Risk: Termination",
    "LABEL_2": "🛑 Risk: Non-Compete"
}

# 3. Test Cases
test_cases = [
    # Case A: Safe
    "This Agreement shall be governed by the laws of the State of New York.",
    
    # Case B: Termination (Should be Label 1)
    "The Client may terminate this Agreement at any time, for any reason, by giving written notice.",
    
    # Case C: Non-Compete (Should be Label 2)
    "Employee agrees not to work for any competitor of the Company for a period of two years after leaving."
]

print("\n--- DIAGNOSTICS ---\n")

for text in test_cases:
    # Run Prediction
    result = classifier(text)[0]
    
    human_label = label_map.get(result['label'], "Unknown")
    confidence = round(result['score'] * 100, 2)
    
    print(f"Input: '{text[:50]}...'")
    print(f"Prediction: {human_label}")
    print(f"Confidence: {confidence}%")
    print("-" * 30)