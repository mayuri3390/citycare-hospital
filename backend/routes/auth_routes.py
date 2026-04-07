"""Auth routes: /register, /login"""
from flask import Blueprint, request
import bcrypt
from config.db import get_db
from utils.helpers import create_token, success, error

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()
    role = (data.get('role') or 'patient').strip()

    if not all([name, email, password]):
        return error('Name, email and password are required')
    if role not in ('patient', 'doctor', 'receptionist'):
        return error('Invalid role')

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return error('Email already registered', 409)

        cursor.execute(
            "INSERT INTO users (name, email, password, role) VALUES (%s,%s,%s,%s)",
            (name, email, hashed, role)
        )
        user_id = cursor.lastrowid

        # If doctor, create doctors row
        if role == 'doctor':
            spec = (data.get('specialization') or 'General').strip()
            cursor.execute(
                "INSERT INTO doctors (user_id, name, specialization) VALUES (%s,%s,%s)",
                (user_id, name, spec)
            )

        conn.commit()
        return success(message='Registration successful! Please login.', status=201)
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return error('Email and password are required')

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        if not user or not bcrypt.checkpw(password.encode(), user['password'].encode()):
            return error('Invalid email or password', 401)

        token = create_token({
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        })

        # Fetch doctor_id if role is doctor
        doctor_id = None
        if user['role'] == 'doctor':
            cursor.execute("SELECT id FROM doctors WHERE user_id = %s", (user['id'],))
            doc = cursor.fetchone()
            if doc:
                doctor_id = doc['id']

        return success({
            'token': token,
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email'],
                'role': user['role'],
                'doctor_id': doctor_id
            }
        }, 'Login successful')
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
