"""Doctor routes: GET /doctors, GET /doctors/<id>"""
from flask import Blueprint, request
from config.db import get_db
from utils.helpers import success, error, token_required, role_required

doctors_bp = Blueprint('doctors', __name__)


@doctors_bp.route('', methods=['GET'])
@token_required
def get_doctors(current_user):
    spec = request.args.get('specialization', '').strip()
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        if spec:
            cursor.execute(
                "SELECT * FROM doctors WHERE LOWER(specialization) LIKE LOWER(%s) ORDER BY name",
                (f'%{spec}%',)
            )
        else:
            cursor.execute("SELECT * FROM doctors ORDER BY name")
        doctors = cursor.fetchall()
        return success(doctors)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@doctors_bp.route('/<int:doctor_id>', methods=['GET'])
@token_required
def get_doctor(doctor_id, current_user):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM doctors WHERE id = %s", (doctor_id,))
        doc = cursor.fetchone()
        if not doc:
            return error('Doctor not found', 404)
        return success(doc)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@doctors_bp.route('/specializations', methods=['GET'])
@token_required
def get_specializations(current_user):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT specialization FROM doctors ORDER BY specialization")
        specs = [row[0] for row in cursor.fetchall()]
        return success(specs)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()

@doctors_bp.route('/pending', methods=['GET'])
@token_required
@role_required('receptionist')
def get_pending_doctors(current_user):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT d.*, u.email, u.is_approved FROM doctors d JOIN users u ON d.user_id = u.id WHERE u.is_approved = FALSE"
        )
        docs = cursor.fetchall()
        return success(docs)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()

@doctors_bp.route('/<int:user_id>/approve', methods=['PUT'])
@token_required
@role_required('receptionist')
def approve_doctor(user_id, current_user):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET is_approved = TRUE WHERE id = %s AND role = 'doctor'", (user_id,))
        if cursor.rowcount == 0:
            return error('Doctor not found or already approved', 404)
        conn.commit()
        return success(message='Doctor approved successfully')
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()

@doctors_bp.route('/<int:doctor_id>/availability', methods=['PUT'])
@token_required
@role_required('receptionist', 'doctor')
def update_doctor_availability(doctor_id, current_user):
    data = request.get_json(silent=True) or {}
    date = data.get('date')
    status = data.get('status')

    if not date or status not in ['available', 'unavailable']:
        return error('Valid date and status (available/unavailable) are required')

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Update or insert availability
        cursor.execute(
            """INSERT INTO doctor_availability (doctor_id, date, status) 
               VALUES (%s, %s, %s)
               ON DUPLICATE KEY UPDATE status = %s""",
            (doctor_id, date, status, status)
        )

        # If marking unavailable, find all appointments on that date and mark them 'cancelled' or add note
        if status == 'unavailable':
            cursor.execute(
                "SELECT id, patient_id FROM appointments WHERE doctor_id = %s AND date = %s AND status IN ('pending', 'confirmed')",
                (doctor_id, date)
            )
            affected_appts = cursor.fetchall()
            
            for appt in affected_appts:
                cursor.execute(
                    "UPDATE appointments SET status = 'cancelled', notes = 'Doctor emergency leave. Reschedule required.' WHERE id = %s",
                    (appt['id'],)
                )
                from routes.appointment_routes import _notify
                _notify(cursor, conn, appt['patient_id'], f"Your appointment on {date} was cancelled due to doctor emergency leave. Please reschedule.")

        conn.commit()
        return success(message=f"Doctor marked as {status} on {date}")
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
