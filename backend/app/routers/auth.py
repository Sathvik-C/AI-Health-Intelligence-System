from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import timedelta
import httpx
import secrets

from app.database import get_db
from app.models.models import User
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True


class GoogleAuthRequest(BaseModel):
    credential: str  # ID token returned by Google Identity Services
    remember_me: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    email: str
    full_name: str
    remember_me: bool = True


@router.post("/register", response_model=TokenResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    clean_email = (data.email or "").strip().lower()
    if db.query(User).filter(func.lower(User.email) == clean_email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=clean_email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip() if data.full_name else "",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Registration always remembers (30 days) so the user is not immediately logged out
    token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(days=30))
    return TokenResponse(access_token=token, token_type="bearer", user_id=user.id, email=user.email, full_name=user.full_name, remember_me=True)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """
    JSON login endpoint that supports remember_me.
    remember_me=True  → 30-day token stored in localStorage (survives browser close)
    remember_me=False → 24-hour token stored in sessionStorage (cleared on tab close)
    """
    clean_email = (data.email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == clean_email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    expires = timedelta(days=30) if data.remember_me else timedelta(hours=24)
    token = create_access_token({"sub": str(user.id)}, expires_delta=expires)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name or "",
        remember_me=data.remember_me,
    )


# Keep the OAuth2 form-based endpoint for Swagger UI / docs compatibility
@router.post("/login/form", response_model=TokenResponse, include_in_schema=False)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    clean_username = (form.username or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == clean_username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(days=30))
    return TokenResponse(access_token=token, token_type="bearer", user_id=user.id, email=user.email, full_name=user.full_name or "", remember_me=True)


@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not data.credential:
        raise HTTPException(status_code=400, detail="Missing Google credential")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": data.credential},
                timeout=10.0,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid or expired Google token")
            payload = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google authentication failed: {str(e)}")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    clean_email = email.strip().lower()
    full_name = payload.get("name") or payload.get("given_name") or ""

    user = db.query(User).filter(func.lower(User.email) == clean_email).first()
    if not user:
        # Create a new user with secure random password for OAuth sign-in
        random_pwd = secrets.token_urlsafe(32)
        user = User(
            email=clean_email,
            hashed_password=hash_password(random_pwd),
            full_name=full_name,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.full_name and full_name:
        user.full_name = full_name
        db.commit()
        db.refresh(user)

    expires = timedelta(days=30) if data.remember_me else timedelta(hours=24)
    token = create_access_token({"sub": str(user.id)}, expires_delta=expires)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        full_name=user.full_name or "",
        remember_me=data.remember_me,
    )


@router.get("/validate")
def validate_token(current_user: User = Depends(get_current_user)):
    """Validate if the current token is still valid"""
    return {"valid": True, "user_id": current_user.id}
