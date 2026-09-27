import logging
from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.db.database import get_db
from backend.app.db.models import User, Conversation, Message
from backend.app.core.dependencies import get_current_user
from backend.app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    MessageResponse
)
from backend.app.services.openrouter import (
    openrouter_service,
    OpenRouterAuthError,
    OpenRouterRateLimitError,
    OpenRouterServerError,
    OpenRouterTimeoutError,
    OpenRouterInvalidResponseError,
    OpenRouterError
)

logger = logging.getLogger("ron_ai.chat")

router = APIRouter()

RECENT_HISTORY_LIMIT = 20

@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def send_chat_message(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send a message to Ron AI and receive a real response via OpenRouter Auto Router.
    Enforces JWT authentication, conversation ownership, persistence, and history limit.
    """
    message_clean = payload.message.strip()
    if not message_clean:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content cannot be empty"
        )

    # 1. Resolve or create Conversation
    if payload.conversation_id is not None:
        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.id == payload.conversation_id,
                Conversation.user_id == current_user.id
            )
            .first()
        )
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found"
            )
    else:
        conversation = Conversation(
            user_id=current_user.id,
            title="New Chat"
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # 2. Persist the new user message to PostgreSQL first
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=message_clean
    )
    db.add(user_msg)

    # Auto-generate title if currently default
    if conversation.title == "New Chat" or not conversation.title:
        first_line = message_clean.split("\n")[0].strip()
        if len(first_line) > 36:
            new_title = first_line[:35].rstrip() + "..."
        else:
            new_title = first_line
        if new_title:
            conversation.title = new_title

    conversation.updated_at = func.now()
    db.commit()
    db.refresh(user_msg)
    db.refresh(conversation)

    # 3. Retrieve recent message history including the newly committed current message
    recent_msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(RECENT_HISTORY_LIMIT)
        .all()
    )
    # Reverse so they are in chronological order (oldest to newest)
    history_messages: List[Dict[str, str]] = [
        {"role": msg.role, "content": msg.content}
        for msg in reversed(recent_msgs)
    ]

    # 4. Build OpenRouter messages payload (current message included exactly once)
    openrouter_messages = openrouter_service.build_messages_from_history(
        messages_history=history_messages
    )

    # 5. Call OpenRouter Auto Router
    try:
        assistant_content, routed_model = await openrouter_service.generate_chat_completion(
            messages=openrouter_messages
        )
    except OpenRouterAuthError as exc:
        logger.error("OpenRouter auth failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Ron couldn't connect to AI services right now. Please try again."
        )
    except OpenRouterRateLimitError as exc:
        logger.warning("OpenRouter rate limit: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Ron is currently experiencing high demand. Please try again in a moment."
        )
    except OpenRouterTimeoutError as exc:
        logger.warning("OpenRouter timeout: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Ron took too long to respond. Please try again."
        )
    except (OpenRouterServerError, OpenRouterInvalidResponseError, OpenRouterError) as exc:
        logger.error("OpenRouter service error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Ron couldn't respond right now. Please try again."
        )
    except Exception as exc:
        logger.exception("Unexpected error while communicating with OpenRouter: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Ron couldn't respond right now. Please try again."
        )

    # 6. Persist real assistant message to PostgreSQL
    asst_msg = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=assistant_content
    )
    db.add(asst_msg)
    conversation.updated_at = func.now()
    db.commit()
    db.refresh(asst_msg)

    return ChatResponse(
        conversation_id=conversation.id,
        user_message=MessageResponse.model_validate(user_msg),
        assistant_message=MessageResponse.model_validate(asst_msg)
    )
