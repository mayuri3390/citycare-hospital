"""Main Flask application entry point."""
import sys
import os

# Make backend the base for imports
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify
from flask_cors import CORS

from config.config import config as app_config
from config.db import init_db

# Import route blueprints
from routes.auth_routes import auth_bp
from routes.doctor_routes import doctors_bp
from routes.appointment_routes import appointments_bp
from routes.record_routes import records_bp
from routes.notification_routes import notifications_bp
from routes.doctor_request_routes import dr_requests_bp


def create_app(config_name: str = 'development') -> Flask:
    app = Flask(__name__)
    app.config.from_object(app_config[config_name])

    # CORS – allow frontend origins
    CORS(app, resources={r"/api/*": {"origins": app_config[config_name].CORS_ORIGINS}},
         supports_credentials=True)

    # Register blueprints under /api prefix
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(doctors_bp, url_prefix='/api/doctors')
    app.register_blueprint(appointments_bp, url_prefix='/api/appointments')
    app.register_blueprint(records_bp, url_prefix='/api/records')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    app.register_blueprint(dr_requests_bp, url_prefix='/api/doctor-request')

    # Health check
    @app.route('/api/health')
    def health():
        return jsonify({'status': 'ok', 'app': 'CityCare Hospital API'}), 200

    # Initialize DB on first run
    with app.app_context():
        try:
            init_db(app)
        except Exception as exc:
            app.logger.warning(f"DB initialization skipped: {exc}")

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=True)
