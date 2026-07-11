"""Supabase JWT validation for per-user KB scoping."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from fastapi import Header, HTTPException
from supabase import Client, create_client

from resume_kb_server.settings import Settings

TEST_USER_ID = "test-user-id"


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str


@lru_cache
def get_supabase_client(url: str, anon_key: str) -> Client:
    return create_client(url, anon_key)


def make_get_current_user(settings: Settings):
    def get_current_user(
        authorization: str | None = Header(default=None),
    ) -> AuthUser:
        if settings.auth_disabled:
            return AuthUser(id=TEST_USER_ID, email="test@example.com")

        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

        jwt = authorization[7:].strip()
        if not jwt:
            raise HTTPException(status_code=401, detail="Missing bearer token")

        if not settings.supabase_url or not settings.supabase_anon_key:
            raise HTTPException(status_code=503, detail="Supabase auth is not configured")

        client = get_supabase_client(settings.supabase_url, settings.supabase_anon_key)
        try:
            response = client.auth.get_user(jwt)
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

        user = response.user
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        return AuthUser(id=user.id, email=user.email or "")

    return get_current_user
