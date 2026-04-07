"""Utility helpers for the Flask backend."""
from functools import wraps
from flask import request, jsonify
import jwt
from config.config import Config


# ── JWT helpers ──────────────────────────────────────────────────────────────

def create_token(payload: dict) -> str:
    import datetime
    payload['exp'] = datetime.datetime.utcnow() + Config.JWT_ACCESS_TOKEN_EXPIRES
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm='HS256')


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ── Auth decorators ───────────────────────────────────────────────────────────

def token_required(f):
    """Decorator that validates Bearer JWT and injects current_user into kwargs."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'error': 'Token missing'}), 401

        user = decode_token(token)
        if not user:
            return jsonify({'error': 'Token invalid or expired'}), 401

        return f(*args, current_user=user, **kwargs)
    return decorated


def role_required(*roles):
    """Decorator that enforces role-based access on top of token_required."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            current_user = kwargs.get('current_user')
            if current_user is None:
                return jsonify({'error': 'Authentication required'}), 401
            if current_user.get('role') not in roles:
                return jsonify({'error': 'Forbidden: insufficient permissions'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


# ── Response helpers ──────────────────────────────────────────────────────────

def success(data=None, message='OK', status=200):
    return jsonify({'success': True, 'message': message, 'data': data}), status


def error(message='Error', status=400):
    return jsonify({'success': False, 'error': message}), status
