from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class UserSync(BaseModel):
    clerk_id: str
    email: str
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)

# --- Map-Reduce Testimony Comparison Models ---

class TimelineEvent(BaseModel):
    """Represents an extracted chronological event from a testimony."""
    timeframe: str = Field(description="Timestamp, time, or relative sequence of the event.")
    event_description: str = Field(description="Summary of what occurred.")
    source_quote: str = Field(description="Direct or near-direct quote from the transcript supporting this event.")

class Timeline(BaseModel):
    """Container for a party's complete extracted timeline."""
    party: str = Field(description="The party providing the testimony (e.g., 'Client' or 'Accused').")
    events: list[TimelineEvent] = Field(description="List of chronological events.")

class Discrepancy(BaseModel):
    """Represents a detected discrepancy between the Client and Accused testimonies."""
    type: str = Field(description="Type of discrepancy: Must be either 'Direct Conflict' or 'Omission'.")
    timeframe: str = Field(description="When the discrepancy occurred.")
    client_version: Optional[str] = Field(description="The client's version of events, if available.")
    accused_version: Optional[str] = Field(description="The accused's version of events, if available.")
    analysis: str = Field(description="Detailed legal audit reasoning explaining why this is a discrepancy.")
    severity: str = Field(description="Severity of the discrepancy: 'High', 'Medium', or 'Low'.")

class ComparativeAnalysisResult(BaseModel):
    """Final result container for the testimony comparison."""
    client_timeline: Timeline
    accused_timeline: Timeline
    discrepancies: list[Discrepancy]
