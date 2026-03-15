import os
import json
import threading
import time
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import OperationalError
from datetime import datetime
import hashlib
import hmac

app = Flask(__name__, static_folder='public', template_folder='templates')
app.config['SECRET_KEY'] = os.urandom(24).hex()
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///pi_digits.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}

# Khởi tạo extensions
db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- Model Database ---
class PiDigits(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    pi_string = db.Column(db.String(100000), default="3.")  # Chuỗi Pi
    next_position = db.Column(db.Integer, default=1)        # Vị trí cần tính tiếp theo
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)
    total_contributors = db.Column(db.Integer, default=0)
    is_calculating = db.Column(db.Boolean, default=False)   # Khóa: đang có ai tính không?
    current_calculator_id = db.Column(db.String(100), nullable=True)  # ID người đang tính
    lock_expires = db.Column(db.DateTime, nullable=True)     # Thời gian hết hạn khóa

class Contribution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    contributor_ip = db.Column(db.String(50))
    contributor_id = db.Column(db.String(100))
    position = db.Column(db.Integer)
    digit = db.Column(db.Integer)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    session_id = db.Column(db.String(100))

# Tạo bảng
with app.app_context():
    db.create_all()
    if PiDigits.query.count() == 0:
        initial = PiDigits(
            pi_string="3.", 
            next_position=1, 
            total_contributors=0,
            is_calculating=False
        )
        db.session.add(initial)
        db.session.commit()

# --- Thuật toán Spigot thật để tính Pi ---
class SpigotPi:
    """Thuật toán Spigot để tính từng chữ
