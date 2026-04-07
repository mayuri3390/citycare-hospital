import os
from datetime import timedelta

class Config:
    """Base configuration class."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'citycare-hospital-secret-key-2025')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'citycare-jwt-secret-key-2025')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)

    # MySQL Configuration
    MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
    MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
    MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
    MYSQL_DB = os.environ.get('MYSQL_DB', 'citycare_db')

    CORS_ORIGINS = ['http://localhost:5500', 'http://127.0.0.1:5500',
                    'http://localhost:3000', 'null', '*']


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
