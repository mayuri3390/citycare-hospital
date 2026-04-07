"""Appointment routes."""
from flask import Blueprint, request
from config.db import get_db
from utils.helpers import success, error, token_required

appointments_bp = Blueprint('appointments', __name__)


def _notify(cursor, conn, user_id: int, message: str):
    cursor.execute(
        "INSERT INTO notifications (user_id, message) VALUES (%s, %s)",
        (user_id, message)
    )


@appointments_bp.route('', methods=['POST'])
@token_required
def book_appointment(current_user):
    data = request.get_json(silent=True) or {}
    doctor_id = data.get('doctor_id')
    date = data.get('date')
    time = data.get('time')

    if not all([doctor_id, date, time]):
        return error('doctor_id, date and time are required')

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get doctor
        cursor.execute("SELECT * FROM doctors WHERE id = %s", (doctor_id,))
        doctor = cursor.fetchone()
        if not doctor:
            return error('Doctor not found', 404)

        cursor.execute(
            """INSERT INTO appointments (patient_id, doctor_id, date, time)
               VALUES (%s, %s, %s, %s)""",
            (current_user['id'], doctor_id, date, time)
        )
        appt_id = cursor.lastrowid

        # Notify patient
        _notify(cursor, conn, current_user['id'],
                f"Your appointment with {doctor['name']} on {date} at {time} has been booked.")
        # Notify doctor (via user_id linked to doctor)
        if doctor.get('user_id'):
            _notify(cursor, conn, doctor['user_id'],
                    f"New appointment from {current_user['name']} on {date} at {time}.")

        conn.commit()
        return success({'appointment_id': appt_id}, 'Appointment booked successfully', 201)
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@appointments_bp.route('/user/<int:user_id>', methods=['GET'])
@token_required
def get_patient_appointments(user_id, current_user):
    # patients can only see their own; receptionist/doctor can see all
    if current_user['role'] == 'patient' and current_user['id'] != user_id:
        return error('Forbidden', 403)

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Filters
        status_filter = request.args.get('status', '')
        date_filter = request.args.get('date', '')
        doctor_filter = request.args.get('doctor_id', '')

        query = """
            SELECT a.*, u.name AS patient_name, d.name AS doctor_name, d.specialization
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.patient_id = %s
        """
        params = [user_id]

        if status_filter:
            query += " AND a.status = %s"
            params.append(status_filter)
        if date_filter:
            query += " AND a.date = %s"
            params.append(date_filter)
        if doctor_filter:
            query += " AND a.doctor_id = %s"
            params.append(doctor_filter)

        query += " ORDER BY a.date DESC, a.time DESC"
        cursor.execute(query, params)
        appts = cursor.fetchall()
        # Serialize dates
        for a in appts:
            if a.get('date'):
                a['date'] = str(a['date'])
            if a.get('time'):
                a['time'] = str(a['time'])
            if a.get('created_at'):
                a['created_at'] = str(a['created_at'])
        return success(appts)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@appointments_bp.route('/doctor/<int:doctor_id>', methods=['GET'])
@token_required
def get_doctor_appointments(doctor_id, current_user):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        date_filter = request.args.get('date', '')
        query = """
            SELECT a.*, u.name AS patient_name, d.name AS doctor_name
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE a.doctor_id = %s
        """
        params = [doctor_id]
        if date_filter:
            query += " AND a.date = %s"
            params.append(date_filter)
        query += " ORDER BY a.date DESC, a.time ASC"
        cursor.execute(query, params)
        appts = cursor.fetchall()
        for a in appts:
            if a.get('date'):
                a['date'] = str(a['date'])
            if a.get('time'):
                a['time'] = str(a['time'])
            if a.get('created_at'):
                a['created_at'] = str(a['created_at'])
        return success(appts)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@appointments_bp.route('/all', methods=['GET'])
@token_required
def get_all_appointments(current_user):
    """Receptionist: get all appointments with optional filters."""
    if current_user['role'] not in ('receptionist', 'doctor'):
        return error('Forbidden', 403)

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        status_filter = request.args.get('status', '')
        date_filter = request.args.get('date', '')
        doctor_filter = request.args.get('doctor_id', '')

        query = """
            SELECT a.*, u.name AS patient_name, d.name AS doctor_name, d.specialization
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            JOIN doctors d ON a.doctor_id = d.id
            WHERE 1=1
        """
        params = []
        if status_filter:
            query += " AND a.status = %s"
            params.append(status_filter)
        if date_filter:
            query += " AND a.date = %s"
            params.append(date_filter)
        if doctor_filter:
            query += " AND a.doctor_id = %s"
            params.append(doctor_filter)

        query += " ORDER BY a.date DESC, a.time ASC"
        cursor.execute(query, params)
        appts = cursor.fetchall()
        for a in appts:
            if a.get('date'):
                a['date'] = str(a['date'])
            if a.get('time'):
                a['time'] = str(a['time'])
            if a.get('created_at'):
                a['created_at'] = str(a['created_at'])
        return success(appts)
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@appointments_bp.route('/<int:appt_id>', methods=['PUT'])
@token_required
def update_appointment(appt_id, current_user):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM appointments WHERE id = %s", (appt_id,))
        appt = cursor.fetchone()
        if not appt:
            return error('Appointment not found', 404)

        # Authorization
        if current_user['role'] == 'patient' and appt['patient_id'] != current_user['id']:
            return error('Forbidden', 403)

        updates = []
        params = []
        allowed_status = ('pending', 'confirmed', 'completed', 'cancelled')

        if 'status' in data and data['status'] in allowed_status:
            updates.append("status = %s")
            params.append(data['status'])
        if 'date' in data:
            updates.append("date = %s")
            params.append(data['date'])
        if 'time' in data:
            updates.append("time = %s")
            params.append(data['time'])

        if not updates:
            return error('Nothing to update')

        params.append(appt_id)
        cursor.execute(f"UPDATE appointments SET {', '.join(updates)} WHERE id = %s", params)

        # Notify patient on status change
        if 'status' in data:
            _notify(cursor, conn, appt['patient_id'],
                    f"Your appointment on {appt['date']} has been {data['status']}.")

        conn.commit()
        return success(message='Appointment updated')
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@appointments_bp.route('/<int:appt_id>', methods=['DELETE'])
@token_required
def cancel_appointment(appt_id, current_user):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM appointments WHERE id = %s", (appt_id,))
        appt = cursor.fetchone()
        if not appt:
            return error('Appointment not found', 404)

        if current_user['role'] == 'patient' and appt['patient_id'] != current_user['id']:
            return error('Forbidden', 403)

        cursor.execute("UPDATE appointments SET status = 'cancelled' WHERE id = %s", (appt_id,))
        _notify(cursor, conn, appt['patient_id'], f"Your appointment on {appt['date']} has been cancelled.")
        conn.commit()
        return success(message='Appointment cancelled')
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
