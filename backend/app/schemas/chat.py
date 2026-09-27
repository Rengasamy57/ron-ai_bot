from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default="New Chat", max_length=255)

class MessageCreate(BaseModel):
    role: str = Field(default="user", pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, description="Message content must not be empty")

class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ConversationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ConversationDetailResponse(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

    model_config = ConfigDict(from_attributes=True)

class ChatRequest(BaseModel):
    conversation_id: Optional[int] = Field(default=None, description="Target conversation ID. If omitted or null, a new conversation will be created.")
    message: str = Field(..., min_length=1, max_length=4000, description="User message content")

class ChatResponse(BaseModel):
    conversation_id: int
    user_message: MessageResponse
    assistant_message: MessageResponse

    model_config = ConfigDict(from_attributes=True)
