"""Stats routes."""
from flask import Blueprint
from config.db import get_db
from utils.helpers import success, error, token_required, role_required

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('', methods=['GET'])
@token_required
@role_required('receptionist')
def get_stats(current_user):
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        # Total Patients
        cursor.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'patient'")
        total_patients = cursor.fetchone()['count']
        
        # Total Doctors
        cursor.execute("SELECT COUNT(*) AS count FROM doctors")
        total_doctors = cursor.fetchone()['count']
        
        # Total Appointments
        cursor.execute("SELECT COUNT(*) AS count FROM appointments")
        total_appts = cursor.fetchone()['count']
        
        # Pending Appointments
        cursor.execute("SELECT COUNT(*) AS count FROM appointments WHERE status = 'pending'")
        pending_appts = cursor.fetchone()['count']
        
        return success({
            'totalPatients': total_patients,
            'totalDoctors': total_doctors,
            'totalAppts': total_appts,
            'pendingAppts': pending_appts
        })
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
