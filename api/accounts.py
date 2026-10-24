"""Request-local FastAPI Users password checks; Maincloud owns accounts/sessions."""
import asyncio
from dataclasses import dataclass, replace
import secrets
from typing import Annotated, Literal

from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import BaseUserManager
from fastapi_users.db import BaseUserDatabase
from fastapi_users.schemas import BaseUserCreate
from pydantic import Field, SecretStr

from .models import Model


class CredentialSnapshot(Model):
    id: str
    username: str
    passwordHash: SecretStr


class CredentialsRequest(Model):
    action: Literal["register", "login"]
    username: Annotated[str, Field(pattern=r"^[a-z0-9_]{3,24}$")]
    password: SecretStr = Field(min_length=8, max_length=128)
    account: CredentialSnapshot | None = None


class CredentialsResponse(Model):
    authenticated: bool
    passwordHash: str | None = None
    principalHex: str | None = None


@dataclass
class User:
    id: str
    email: str  # Framework login key; this application uses a username, not email.
    hashed_password: str
    is_active: bool = True
    is_superuser: bool = False
    is_verified: bool = False


class UsernameCreate(BaseUserCreate):
    email: str  # No fabricated email addresses or email delivery.


class SnapshotStore(BaseUserDatabase[User, str]):
    def __init__(self, snapshot: CredentialSnapshot | None):
        self.user = User(snapshot.id, snapshot.username, snapshot.passwordHash.get_secret_value()) if snapshot else None

    async def get_by_email(self, email: str):
        return self.user if self.user and self.user.email == email else None

    async def get(self, id: str):
        return self.user if self.user and self.user.id == id else None

    async def create(self, create_dict):
        self.user = User("pending", create_dict["email"], create_dict["hashed_password"])
        return self.user

    async def update(self, user, update_dict):
        self.user = replace(user, **update_dict)
        return self.user


async def _check(body: CredentialsRequest):
    store = SnapshotStore(body.account)
    manager = BaseUserManager(store)
    if body.action == "register":
        if body.account is not None:
            return CredentialsResponse(authenticated=False)
        user = await manager.create(UsernameCreate(email=body.username, password=body.password.get_secret_value()), safe=True)
        return CredentialsResponse(authenticated=True, passwordHash=user.hashed_password,
                                   principalHex=secrets.token_hex(32))
    try:
        user = await manager.authenticate(OAuth2PasswordRequestForm(username=body.username,
                                          password=body.password.get_secret_value()))
    except (ValueError, TypeError):
        return CredentialsResponse(authenticated=False)
    return CredentialsResponse(authenticated=bool(user), passwordHash=store.user.hashed_password if user else None)


async def credentials(body: CredentialsRequest):
    # Argon2 is CPU/memory work; a request-local manager is never shared by users.
    return await asyncio.to_thread(lambda: asyncio.run(_check(body)))
