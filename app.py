import os
import time
import threading
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

# =============================
# APP INIT
# =============================

app = Flask(
    __name__,
    static_folder="public",
    static_url_path="",
    template_folder="templates"
)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", os.urandom(24).hex())

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL or "sqlite:///pi_digits.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

CORS(app)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=60,
    ping_interval=25
)

db = SQLAlchemy(app)

# =============================
# DATABASE MODELS
# =============================

class PiDigits(db.Model):
    __tablename__ = "pi_digits"

    id = db.Column(db.Integer, primary_key=True)

    pi_string = db.Column(db.String(100000), default="3.")
    next_position = db.Column(db.Integer, default=1)

    total_contributors = db.Column(db.Integer, default=0)

    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    is_calculating = db.Column(db.Boolean, default=False)
    current_calculator_id = db.Column(db.String(100))
    lock_expires = db.Column(db.DateTime)


class Contribution(db.Model):
    __tablename__ = "contributions"

    id = db.Column(db.Integer, primary_key=True)

    contributor_ip = db.Column(db.String(50))
    contributor_id = db.Column(db.String(100))

    position = db.Column(db.Integer)
    digit = db.Column(db.Integer)

    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    session_id = db.Column(db.String(100))


# =============================
# INIT DATABASE
# =============================

with app.app_context():

    db.create_all()

    if PiDigits.query.count() == 0:

        record = PiDigits(
            pi_string="3.",
            next_position=1,
            total_contributors=0,
            is_calculating=False
        )

        db.session.add(record)
        db.session.commit()

        print("✅ Database initialized with 3.")

# =============================
# UTILITY
# =============================

def sync_pi_state():
    """
    Đồng bộ next_position theo độ dài chuỗi pi
    """

    record = PiDigits.query.first()

    if not record:
        return

    real_length = len(record.pi_string) - 2
    expected_next = real_length + 1

    if record.next_position != expected_next:

        print(
            f"⚠️ Sync position {record.next_position} -> {expected_next}"
        )

        record.next_position = expected_next
        db.session.commit()


def check_lock_expired():

    record = PiDigits.query.first()

    if not record:
        return

    if record.lock_expires and record.lock_expires < datetime.utcnow():

        print("🔓 Lock expired")

        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None

        db.session.commit()

        socketio.emit("lock_released", {
            "position": record.next_position
        })


def background_task():

    while True:

        socketio.sleep(5)

        with app.app_context():
            check_lock_expired()


# =============================
# ROUTES
# =============================

@app.route("/")
def index():
    return send_from_directory("public", "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("public", path)


@app.route("/admin")
def admin():
    return render_template("admin.html")


# =============================
# STATUS
# =============================

@app.route("/api/status")
def status():

    sync_pi_state()
    check_lock_expired()

    record = PiDigits.query.first()

    return jsonify({
        "success": True,
        "pi_string": record.pi_string,
        "next_position": record.next_position,
        "length": len(record.pi_string) - 2,
        "total_contributors": record.total_contributors,
        "is_calculating": record.is_calculating,
        "lock_expires": record.lock_expires.isoformat() if record.lock_expires else None
    })


# =============================
# ACQUIRE LOCK
# =============================

@app.route("/api/acquire-lock", methods=["POST"])
def acquire_lock():

    data = request.get_json()
    client_id = data.get("client_id")

    if not client_id:
        return jsonify({"success": False})

    sync_pi_state()
    check_lock_expired()

    record = PiDigits.query.with_for_update().first()

    if record.is_calculating:

        return jsonify({
            "success": False,
            "error": "busy"
        })

    record.is_calculating = True
    record.current_calculator_id = client_id
    record.lock_expires = datetime.utcnow() + timedelta(seconds=30)

    db.session.commit()

    socketio.emit("lock_acquired", {
        "position": record.next_position
    })

    return jsonify({
        "success": True,
        "position": record.next_position,
        "pi": record.pi_string
    })


# =============================
# RELEASE LOCK
# =============================

@app.route("/api/release-lock", methods=["POST"])
def release_lock():

    data = request.get_json()
    client_id = data.get("client_id")

    record = PiDigits.query.with_for_update().first()

    if record.current_calculator_id == client_id:

        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None

        db.session.commit()

        socketio.emit("lock_released", {
            "position": record.next_position
        })

    return jsonify({"success": True})


# =============================
# CONTRIBUTE DIGIT
# =============================

@app.route("/api/contribute", methods=["POST"])
def contribute():

    data = request.get_json()

    digit = int(data.get("digit"))
    position = int(data.get("position"))
    client_id = data.get("client_id")
    session_id = data.get("session_id", "unknown")

    if digit < 0 or digit > 9:
        return jsonify({"success": False})

    sync_pi_state()

    record = PiDigits.query.with_for_update().first()

    if position != record.next_position:

        return jsonify({
            "success": False,
            "error": "wrong position"
        })

    if record.current_calculator_id != client_id:

        return jsonify({
            "success": False,
            "error": "not lock owner"
        })

    # ADD DIGIT
    record.pi_string += str(digit)

    # SAVE CONTRIBUTION
    contribution = Contribution(
        contributor_ip=request.remote_addr,
        contributor_id=client_id,
        position=position,
        digit=digit,
        session_id=session_id
    )

    db.session.add(contribution)

    # UPDATE STATE
    record.next_position += 1
    record.is_calculating = False
    record.current_calculator_id = None
    record.lock_expires = None
    record.last_updated = datetime.utcnow()

    # UNIQUE CONTRIBUTORS
    unique_users = db.session.query(
        Contribution.contributor_id
    ).distinct().count()

    record.total_contributors = unique_users

    db.session.commit()

    socketio.emit("new_digit", {
        "digit": digit,
        "position": position,
        "pi_string": record.pi_string,
        "next_position": record.next_position
    })

    return jsonify({
        "success": True,
        "pi": record.pi_string
    })


# =============================
# RESET
# =============================

@app.route("/api/reset", methods=["POST"])
def reset():

    Contribution.query.delete()

    record = PiDigits.query.first()

    record.pi_string = "3."
    record.next_position = 1
    record.total_contributors = 0

    record.is_calculating = False
    record.current_calculator_id = None
    record.lock_expires = None

    db.session.commit()

    socketio.emit("reset", {
        "pi_string": "3."
    })

    return jsonify({"success": True})


# =============================
# HISTORY
# =============================

@app.route("/api/history")
def history():

    contributions = Contribution.query.order_by(
        Contribution.timestamp.desc()
    ).limit(30)

    result = []

    for c in contributions:

        result.append({
            "position": c.position,
            "digit": c.digit,
            "contributor": c.contributor_id,
            "time": c.timestamp.isoformat()
        })

    return jsonify(result)


# =============================
# WEBSOCKET
# =============================

@socketio.on("connect")
def connect():

    print("Client connected")

    emit("connected", {
        "message": "connected"
    })


@socketio.on("disconnect")
def disconnect():

    print("Client disconnected")


# =============================
# MAIN
# =============================

if __name__ == "__main__":

    print("🚀 Pi Distributed Calculator Server")

    thread = threading.Thread(
        target=background_task,
        daemon=True
    )

    thread.start()

    port = int(os.environ.get("PORT", 5000))

    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        allow_unsafe_werkzeug=True
    )
