"""Medical record routes."""
from flask import Blueprint, request
from config.db import get_db
from utils.helpers import success, error, token_required, role_required

records_bp = Blueprint('records', __name__)


@records_bp.route('', methods=['POST'])
@token_required
@role_required('doctor', 'receptionist')
def create_record(current_user):
    data = request.get_json(silent=True) or {}
    patient_id = data.get('patient_id')
    doctor_id = data.get('doctor_id')
    diagnosis = (data.get('diagnosis') or '').strip()
    prescription = (data.get('prescription') or '').strip()
    notes = (data.get('notes') or '').strip()
    appointment_id = data.get('appointment_id')

    if not all([patient_id, doctor_id, diagnosis]):
        return error('patient_id, doctor_id and diagnosis are required')

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """INSERT INTO medical_records
               (patient_id, doctor_id, appointment_id, diagnosis, prescription, notes)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (patient_id, doctor_id, appointment_id, diagnosis, prescription, notes)
        )
        record_id = cursor.lastrowid

        # Mark appointment completed
        if appointment_id:
            cursor.execute(
                "UPDATE appointments SET status='completed' WHERE id=%s",
                (appointment_id,)
            )

        # Notify patient
        cursor.execute(
            "INSERT INTO notifications (user_id, message) VALUES (%s,%s)",
            (patient_id, "Your medical record has been updated by the doctor.")
        )
        conn.commit()
        return success({'record_id': record_id}, 'Record created', 201)
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@records_bp.route('/<int:patient_id>', methods=['GET'])
@token_required
def get_records(patient_id, current_user):
    if current_user['role'] == 'patient' and current_user['id'] != patient_id:
        return error('Forbidden', 403)

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT mr.*, u.name AS patient_name, d.name AS doctor_name
            FROM medical_records mr
            JOIN users u ON mr.patient_id = u.id
            JOIN doctors d ON mr.doctor_id = d.id
            WHERE mr.patient_id = %s
            ORDER BY mr.created_at DESC
        """, (patient_id,))
        records = cursor.fetchall()
        for r in records:
            if r.get('created_at'):
                r['created_at'] = str(r['created_at'])
        return success(records)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
