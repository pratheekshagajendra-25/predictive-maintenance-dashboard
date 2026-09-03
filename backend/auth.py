import jwt
import datetime
from functools import wraps
from flask import request, jsonify
from werkzeug.security import check_password_hash
from config import Config
from database import get_db_connection

def create_jwt_token(user):
    payload = {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "full_name": user["full_name"],
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7),
        "iat": datetime.datetime.now(datetime.timezone.utc)
    }
    return jwt.encode(payload, Config.AUTH_SECRET, algorithm="HS256")

def decode_jwt_token(token):
    try:
        payload = jwt.decode(token, Config.AUTH_SECRET, algorithms=["HS256"])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({"error": "Authorization header is missing", "success": False}), 401
        
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"error": "Invalid Authorization header format. Expected 'Bearer <token>'", "success": False}), 401

        token = parts[1]
        payload = decode_jwt_token(token)
        if not payload:
            return jsonify({"error": "Token is invalid or has expired", "success": False}), 401

        request.current_user = payload
        return f(*args, **kwargs)
    return decorated

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({"error": "Authorization header missing", "success": False}), 401

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({"error": "Invalid token header", "success": False}), 401

        payload = decode_jwt_token(parts[1])
        if not payload or payload.get("role") != "admin":
            return jsonify({"error": "Forbidden. Administrator privileges required.", "success": False}), 403

        request.current_user = payload
        return f(*args, **kwargs)
    return decorated

def operator_name():
    """Open-access operator identity. JWT is optional; the main app has no login."""
    user = getattr(request, "current_user", None)
    if isinstance(user, dict) and user.get("username"):
        return user["username"]
    auth_header = request.headers.get("Authorization") or ""
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        payload = decode_jwt_token(parts[1])
        if payload and payload.get("username"):
            return payload["username"]
    return "OPERATOR"
