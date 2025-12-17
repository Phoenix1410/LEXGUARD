import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from datasets import Dataset
from transformers import (
    AutoTokenizer, 
    AutoModelForSequenceClassification, 
    TrainingArguments, 
    Trainer,
    DataCollatorWithPadding
)
import torch

# --- CONFIGURATION ---
MODEL_NAME = "distilroberta-base"
BATCH_SIZE = 16  # Optimized for RTX 4060
EPOCHS = 4       # Enough to learn, not enough to overfit
LEARNING_RATE = 2e-5

def run_training():
    # 1. Load Data
    print("Loading data from CSV...")
    df = pd.read_csv("train_data.csv")
    
    # --- LABEL REMAPPING LOGIC ---
    # Your CSV has: 0 (Safe), 2 (Termination), 3 (Non-Compete)
    # The Model needs: 0, 1, 2
    
    label_map = {
        0: 0,  # Safe stays 0
        2: 1,  # Termination becomes 1
        3: 2   # Non-Compete becomes 2
    }
    
    print(f"Original Label Counts:\n{df['label'].value_counts()}")
    
    # Filter: Only keep rows where label is in our map (Safety check)
    df = df[df['label'].isin(label_map.keys())]
    
    # Map: Apply the transformation
    df['label'] = df['label'].map(label_map)
    
    print(f"Mapped Label Counts (Training on this):\n{df['label'].value_counts()}")
    # Expected: 0, 1, 2

    # 2. Split Train/Test (80/20)
    train_df, val_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df['label'])
    
    # Convert to Hugging Face Dataset
    train_dataset = Dataset.from_pandas(train_df)
    val_dataset = Dataset.from_pandas(val_df)

    # 3. Tokenizer
    print(f"Loading Tokenizer: {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    def tokenize_function(examples):
        # Truncation=True cuts long text to 512 tokens
        return tokenizer(examples["text"], truncation=True, padding=False, max_length=512)

    tokenized_train = train_dataset.map(tokenize_function, batched=True)
    tokenized_val = val_dataset.map(tokenize_function, batched=True)

    # 4. Model Setup
    print("Downloading Model...")
    # num_labels=3 corresponds to our mapped classes (0, 1, 2)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=3)

    # 5. Training Arguments
    training_args = TrainingArguments(
        output_dir="./results",
        eval_strategy="epoch",       # Check accuracy every epoch
        save_strategy="epoch",       # Save checkpoint every epoch
        learning_rate=LEARNING_RATE,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        num_train_epochs=EPOCHS,
        weight_decay=0.01,
        fp16=True,                   # <--- GPU Acceleration
        logging_dir='./logs',
        logging_steps=50,
        load_best_model_at_end=True, # Saves the best version, not just the last
        report_to="none"             # Disable WandB for simplicity
    )

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_train,
        eval_dataset=tokenized_val,
        processing_class=tokenizer,
        data_collator=data_collator,
    )

    # 6. Train!
    print("Starting Training on RTX 4060...")
    trainer.train()

    # 7. Save Final Model
    print("Saving model to ./lexguard_model...")
    model.save_pretrained("./lexguard_model")
    tokenizer.save_pretrained("./lexguard_model")
    print("Done! You can now use this folder for inference.")

if __name__ == "__main__":
    if torch.cuda.is_available():
        print(f"Using GPU: {torch.cuda.get_device_name(0)}")
        run_training()
    else:
        print("ERROR: GPU not detected. Please check your CUDA install.")