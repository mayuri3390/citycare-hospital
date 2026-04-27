"""Patient search and patient history routes."""
from flask import Blueprint, request
from config.db import get_db
from utils.helpers import success, error, token_required, role_required

patients_bp = Blueprint('patients', __name__)


@patients_bp.route('', methods=['GET'])
@token_required
@role_required('doctor', 'receptionist')
def search_patients(current_user):
    """GET /api/patients?search=<name_or_id>
    Returns patients matching the search query by name or ID.
    """
    search = (request.args.get('search') or '').strip()

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        if current_user['role'] == 'doctor':
            query = """
                SELECT DISTINCT u.id, u.name, u.email
                FROM users u
                JOIN appointments a ON u.id = a.patient_id
                JOIN doctors d ON a.doctor_id = d.id
                WHERE u.role = 'patient' AND d.user_id = %s
            """
            params = [current_user['id']]
        else:
            query = """
                SELECT id, name, email
                FROM users u
                WHERE role = 'patient'
            """
            params = []

        if search:
            if search.isdigit():
                query += " AND (u.name LIKE %s OR u.id = %s)"
                params.extend([f'%{search}%', int(search)])
            else:
                query += " AND u.name LIKE %s"
                params.append(f'%{search}%')
                
        query += " ORDER BY u.name LIMIT 50"
        cursor.execute(query, params)
        patients = cursor.fetchall()
        return success(patients)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@patients_bp.route('/<int:patient_id>/history', methods=['GET'])
@token_required
@role_required('doctor', 'receptionist')
def get_patient_history(patient_id, current_user):
    """GET /api/patients/<id>/history
    Returns full history: completed appointments + medical records.
    """
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Patient info
        cursor.execute("SELECT id, name, email FROM users WHERE id = %s AND role = 'patient'", (patient_id,))
        patient = cursor.fetchone()
        if not patient:
            return error('Patient not found', 404)

        # Completed appointments
        cursor.execute("""
            SELECT a.id, a.date, a.time, a.status, a.notes,
                   d.name AS doctor_name, d.specialization
            FROM appointments a
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.patient_id = %s AND a.status = 'completed'
            ORDER BY a.date DESC, a.time DESC
        """, (patient_id,))
        appointments = cursor.fetchall()
        for a in appointments:
            if a.get('date'):
                a['date'] = str(a['date'])
            if a.get('time'):
                a['time'] = str(a['time'])

        # Medical records
        cursor.execute("""
            SELECT mr.id, mr.diagnosis, mr.prescription, mr.notes, mr.created_at,
                   d.name AS doctor_name, d.specialization
            FROM medical_records mr
            JOIN doctors d ON mr.doctor_id = d.id
            WHERE mr.patient_id = %s
            ORDER BY mr.created_at DESC
        """, (patient_id,))
        records = cursor.fetchall()
        for r in records:
            if r.get('created_at'):
                r['created_at'] = str(r['created_at'])

        return success({
            'patient': patient,
            'appointments': appointments,
            'records': records
        })
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
