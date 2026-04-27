import mysql.connector
from mysql.connector import pooling
from config.config import Config
import os

_pool = None

def get_pool():
    """Return (or lazily create) MySQL connection pool."""
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="citycare_pool",
            pool_size=5,
            host=Config.MYSQL_HOST,
            port=Config.MYSQL_PORT,
            user=Config.MYSQL_USER,
            password=Config.MYSQL_PASSWORD,
            database=Config.MYSQL_DB,
            charset='utf8mb4',
            collation='utf8mb4_unicode_ci',
            autocommit=False
        )
    return _pool


def get_db():
    """Get a connection from the pool."""
    return get_pool().get_connection()


def init_db(app):
    """Initialize database: create tables and seed default data."""
    schema_path = os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'schema.sql')

    # Use a direct connection (not pool) for init
    conn = mysql.connector.connect(
        host=Config.MYSQL_HOST,
        port=Config.MYSQL_PORT,
        user=Config.MYSQL_USER,
        password=Config.MYSQL_PASSWORD,
        charset='utf8mb4'
    )
    cursor = conn.cursor()

    try:
        cursor.execute("CREATE DATABASE IF NOT EXISTS citycare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        cursor.execute("USE citycare_db")

        with open(schema_path, 'r', encoding='utf-8') as f:
            sql = f.read()

        # Execute each statement
        for statement in sql.split(';'):
            statement = statement.strip()
            if statement and not statement.startswith('--'):
                try:
                    cursor.execute(statement)
                    # Consume any results to avoid "Unread result found"
                    while True:
                        if cursor.with_rows:
                            cursor.fetchall()
                        if not cursor.nextset():
                            break
                except mysql.connector.Error:
                    pass  # ignore "already exists" errors etc.

        conn.commit()
        _seed_default_data(cursor, conn)
        app.logger.info("✅ Database initialized successfully.")
    except Exception as e:
        app.logger.error(f"❌ DB Init Error: {e}")
    finally:
        cursor.close()
        conn.close()


def _seed_default_data(cursor, conn):
    """Seed default users and doctors if not present."""
    import bcrypt

    default_password = bcrypt.hashpw(b'CityPass@123', bcrypt.gensalt()).decode('utf-8')

    defaults = [
        ('Admin Receptionist', 'admin@citycare.com', default_password, 'receptionist'),
        ('Dr. Sarah Smith', 'drsmith@citycare.com', default_password, 'doctor'),
        ('Dr. John Doe', 'drjohn@citycare.com', default_password, 'doctor'),
        ('Dr. Emily Chen', 'dremily@citycare.com', default_password, 'doctor'),
        ('Dr. Michael Brown', 'drmichael@citycare.com', default_password, 'doctor'),
        ('Dr. Jessica White', 'drjessica@citycare.com', default_password, 'doctor'),
        ('Test Patient', 'patient@citycare.com', default_password, 'patient'),
    ]

    for name, email, pw, role in defaults:
        cursor.execute("""
            INSERT IGNORE INTO users (name, email, password, role)
            VALUES (%s, %s, %s, %s)
        """, (name, email, pw, role))
    conn.commit()

    # Seed doctors table using user IDs
    doctor_specs = {
        'drsmith@citycare.com': ('Cardiologist', 'Mon-Fri 9AM-5PM', '10 Yrs', 800.00),
        'drjohn@citycare.com': ('Dermatologist', 'Mon-Wed 10AM-4PM', '5 Yrs', 600.00),
        'dremily@citycare.com': ('Pediatrician', 'Tue-Sat 9AM-3PM', '8 Yrs', 700.00),
        'drmichael@citycare.com': ('Neurologist', 'Mon-Thu 11AM-6PM', '12 Yrs', 1000.00),
        'drjessica@citycare.com': ('Orthopedist', 'Wed-Sun 9AM-5PM', '6 Yrs', 750.00),
    }

    for email, (spec, avail, exp, fee) in doctor_specs.items():
        cursor.execute("SELECT id, name FROM users WHERE email = %s", (email,))
        row = cursor.fetchone()
        if row:
            uid, uname = row
            cursor.execute("""
                INSERT IGNORE INTO doctors (user_id, name, specialization, availability, experience, fee)
                SELECT %s, %s, %s, %s, %s, %s
                WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE user_id = %s)
            """, (uid, uname, spec, avail, exp, fee, uid))
    conn.commit()
