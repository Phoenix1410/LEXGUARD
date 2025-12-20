from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    print("⚠️ WARNING: MONGODB_URI is not set in environment variables.")

# Create a global client instance
client = AsyncIOMotorClient(MONGO_URI)
db = client.lexguard_db  # Database name
