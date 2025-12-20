# 1. Use Python 3.9 Slim
FROM python:3.9-slim

# 2. Create a user (Hugging Face requirement)
# We cannot run as root. We must create a user with ID 1000.
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

# 3. Set work directory
WORKDIR /app

# 4. Install Dependencies
# Copy requirements first to leverage Docker cache
COPY --chown=user ./requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# 5. Copy the Application Code
# Note: This will copy your model folder too, if it's in the directory
COPY --chown=user . .

# 6. Run the Application
# CRITICAL: Hugging Face expects Port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]