# LexGuard - AI Contract Analysis

LexGuard is an intelligent legal contract analysis platform that uses advanced Natural Language Processing (NLP) to detect risky clauses in legal documents. It combines the speed of local models (DistilRoBERTa) with the reasoning power of Large Language Models (LLaMA3 via Groq) to provide instant, explained risk assessments.

## Features

-   **AI-Powered Scan**: Instantly detects and classifies clauses like *Termination*, *Non-Compete*, and *Indemnification*.
-   **Hybrid Intelligence**:
    -   **"The Sniper"**: A custom-trained local model for millisecond-speed detection.
    -   **"The Analyst"**: A cloud LLM (Groq) that explains *why* a clause is risky and suggests edits.
-   **Glassmorphic UI**: A modern, beautiful dashboard built with Tailwind CSS and Next.js.
-   **User Rules**: Users can define custom constraints (e.g., "Flag non-competes longer than 2 years").

## Tech Stack

### Frontend
-   **Framework**: Next.js 15 (App Router)
-   **Styling**: Tailwind CSS v4, Framer Motion (Animations), Lucide React (Icons)
-   **UI Library**: Shadcn/UI (Radix Primitives)

### Backend
-   **Framework**: FastAPI (Python)
-   **ML Models**: Hugging Face Transformers (Local), LangChain + Groq (Cloud LLM)
-   **PDF Processing**: PyMuPDF

## Getting Started

### Prerequisites
-   Node.js 18+
-   Python 3.10+
-   Groq API Key (for "The Analyst" features)

### 1. Backend Setup (FASTAPI)

```bash
cd LEXGUARD-BACKEND/LEX
# Install dependencies (ensure you have a virtual environment)
pip install -r requirements.txt

# Create .env file
echo "GROQ_API_KEY=your_api_key_here" > .env

# Run the API
uvicorn main:app --reload
```

*The backend will run on `http://localhost:8000`*

### 2. Frontend Setup (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Run the Mock UI
npm run dev
```

*The frontend will run on `http://localhost:3000`*

> [!NOTE]
> **Database Status**: The current version uses **Mock Data** for Authentication and History to demonstrate the UI flow without requiring a local MongoDB instance.

## Usage

1.  **Register/Login**: Use any credentials to sign in (Mock Auth).
2.  **Dashboard**: Navigate to "New Analysis".
3.  **Analyze**: Upload a legal contract PDF. You can also add a custom rule.
4.  **View Results**: See risky clauses highlighted with AI explanations.
5.  **History**: Check the "History" tab to see past (mock) analyses.
