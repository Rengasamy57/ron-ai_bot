from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.schemas.auth import (
    UserRegisterRequest,
    RegisterResponse,
    UserLoginRequest,
    TokenResponse,
    UserResponse
)
from backend.app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token
)
from backend.app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user"
)
def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    # Check if user with normalized email exists
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists."
        )

    # Hash the password securely
    hashed_pwd = get_password_hash(payload.password)

    # Create new user
    new_user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hashed_pwd
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating user account."
        )

    return RegisterResponse(
        message="Account created successfully",
        user=new_user
    )

@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and return JWT access token"
)
def login_user(
    payload: UserLoginRequest,
    db: Session = Depends(get_db)
):
    # 1. Lookup user by normalized email
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Generic authentication failure message
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # 2. Verify password with bcrypt
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # 3. Generate JWT access token
    access_token = create_access_token(subject=user.id)

    # 4. Return safe authenticated user information
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user
    )

@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current authenticated user info"
)
def get_me(
    current_user: User = Depends(get_current_user)
):
    return current_user
