"""Notification routes."""
from flask import Blueprint, request
from config.db import get_db
from utils.helpers import success, error, token_required

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('/<int:user_id>', methods=['GET'])
@token_required
def get_notifications(user_id, current_user):
    if current_user['id'] != user_id and current_user['role'] not in ('receptionist',):
        return error('Forbidden', 403)

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC LIMIT 50",
            (user_id,)
        )
        notifs = cursor.fetchall()
        for n in notifs:
            if n.get('created_at'):
                n['created_at'] = str(n['created_at'])
        unread = sum(1 for n in notifs if not n['is_read'])
        return success({'notifications': notifs, 'unread_count': unread})
    except Exception as e:
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()


@notifications_bp.route('/read', methods=['PUT'])
@token_required
def mark_read(current_user):
    data = request.get_json(silent=True) or {}
    notif_ids = data.get('ids')  # list of ids or None = mark all

    conn = get_db()
    cursor = conn.cursor()
    try:
        if notif_ids:
            fmt = ','.join(['%s'] * len(notif_ids))
            cursor.execute(
                f"UPDATE notifications SET is_read=TRUE WHERE id IN ({fmt}) AND user_id=%s",
                (*notif_ids, current_user['id'])
            )
        else:
            cursor.execute(
                "UPDATE notifications SET is_read=TRUE WHERE user_id=%s",
                (current_user['id'],)
            )
        conn.commit()
        return success(message='Notifications marked as read')
    except Exception as e:
        conn.rollback()
        return error(str(e), 500)
    finally:
        cursor.close()
        conn.close()
