"""Doctor request routes (leave / reschedule)."""
from flask import Blueprint, request
from config.db import get_db
from utils.helpers import success, error, token_required

dr_requests_bp = Blueprint('doctor_requests', __name__)


@dr_requests_bp.route('', methods=['POST'])
@token_required
def create_request(current_user):
    if current_user['role'] != 'doctor':
        return error('Only doctors can submit requests', 403)

    data = request.get_json(silent=True) or {}
    req_type = data.get('type')
    date = data.get('date')
    reason = data.get('reason', '')

    if not req_type or not date:
        return error('type and date are required')
    if req_type not in ('leave', 'reschedule'):
        return error('type must be leave or reschedule')

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get doctor_id from user
        cursor.execute("SELECT id FROM doctors WHERE user_id = %s", (current_user['id'],))
        doc = cursor.fetchone()
        if not doc:
            return error('Doctor profile not found', 404)

        cursor.execute(
            "INSERT INTO doctor_requests (doctor_id, type, date, reason) VALUES (%s,%s,%s,%s)",
            (doc['id'], req_type, date, reason)
        )
        conn.commit()
        return success(message='Request submitted', status=201)
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@dr_requests_bp.route('', methods=['GET'])
@token_required
def get_requests(current_user):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        if current_user['role'] == 'doctor':
            cursor.execute("SELECT id FROM doctors WHERE user_id = %s", (current_user['id'],))
            doc = cursor.fetchone()
            if not doc:
                return success([])
            cursor.execute(
                "SELECT dr.*, d.name AS doctor_name FROM doctor_requests dr JOIN doctors d ON dr.doctor_id=d.id WHERE dr.doctor_id=%s ORDER BY dr.created_at DESC",
                (doc['id'],)
            )
        else:
            cursor.execute(
                "SELECT dr.*, d.name AS doctor_name FROM doctor_requests dr JOIN doctors d ON dr.doctor_id=d.id ORDER BY dr.created_at DESC"
            )
        requests_ = cursor.fetchall()
        for r in requests_:
            if r.get('date'):
                r['date'] = str(r['date'])
            if r.get('created_at'):
                r['created_at'] = str(r['created_at'])
        return success(requests_)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@dr_requests_bp.route('/<int:req_id>', methods=['PUT'])
@token_required
def update_request(req_id, current_user):
    if current_user['role'] != 'receptionist':
        return error('Forbidden', 403)

    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if status not in ('approved', 'rejected', 'pending'):
        return error('Invalid status')

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE doctor_requests SET status=%s WHERE id=%s", (status, req_id))
        conn.commit()
        return success(message=f'Request {status}')
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
