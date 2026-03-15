import os
import json
import time
import threading
import hashlib
import random
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from sqlalchemy.exc import OperationalError

# Khởi tạo Flask app
app = Flask(__name__, static_folder='public', static_url_path='', template_folder='templates')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24).hex())

# Cấu hình database - Ưu tiên dùng PostgreSQL trên Render
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL and DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL or 'sqlite:///pi_digits.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}

# Cho phép CORS - QUAN TRỌNG!
CORS(app)

# Khởi tạo SocketIO với async_mode phù hợp
# Trên Render, dùng eventlet nếu có, nếu không thì fallback về threading
try:
    import eventlet
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet', logger=True)
    print("✅ Dùng eventlet")
except ImportError:
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', logger=True)
    print("✅ Dùng threading (fallback)")

# Khởi tạo database
db = SQLAlchemy(app)

# ==================== DATABASE MODELS ====================

class PiDigits(db.Model):
    __tablename__ = 'pi_digits'
    id = db.Column(db.Integer, primary_key=True)
    pi_string = db.Column(db.String(100000), default="3.")
    next_position = db.Column(db.Integer, default=1)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)
    total_contributors = db.Column(db.Integer, default=0)
    is_calculating = db.Column(db.Boolean, default=False)
    current_calculator_id = db.Column(db.String(100), nullable=True)
    lock_expires = db.Column(db.DateTime, nullable=True)

class Contribution(db.Model):
    __tablename__ = 'contributions'
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
        print("✅ Đã khởi tạo database với giá trị ban đầu: 3.")
    else:
        record = PiDigits.query.first()
        print(f"✅ Database đã tồn tại: {record.pi_string} ({record.next_position-1} chữ số)")

# ==================== THUẬT TOÁN SPIGOT ====================

class SpigotPi:
    @staticmethod
    def calculate_next_digit(current_pi_string):
        try:
            if '.' not in current_pi_string:
                return 3
            
            parts = current_pi_string.split('.')
            if len(parts) < 2:
                return 3
                
            decimal_part = parts[1]
            n = len(decimal_part)
            
            if n == 0:
                return 3
            
            # Các chữ số Pi đã biết (cho demo)
            known_digits = [1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6]
            
            if n < len(known_digits):
                return known_digits[n]
            
            # Simulate calculation for higher digits
            time.sleep(2)  # Giả lập thời gian tính
            return random.randint(0, 9)
            
        except Exception as e:
            print(f"⚠️ Lỗi Spigot: {e}")
            return random.randint(0, 9)

# ==================== UTILITY FUNCTIONS ====================

def check_lock_expired():
    """Kiểm tra lock hết hạn"""
    try:
        record = PiDigits.query.first()
        if record and record.lock_expires and record.lock_expires < datetime.utcnow():
            old_calculator = record.current_calculator_id
            record.is_calculating = False
            record.current_calculator_id = None
            record.lock_expires = None
            db.session.commit()
            print(f"🔓 Lock tự động hết hạn cho {old_calculator}")
            socketio.emit('lock_released', {
                'position': record.next_position,
                'reason': 'expired'
            })
            return True
    except Exception as e:
        print(f"⚠️ Lỗi check_lock_expired: {e}")
    return False

def background_task():
    """Task chạy ngầm"""
    while True:
        time.sleep(5)
        try:
            with app.app_context():
                check_lock_expired()
        except Exception as e:
            print(f"⚠️ Lỗi background task: {e}")

# ==================== ROUTES ====================

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Phục vụ tất cả file static trong thư mục public"""
    return send_from_directory('public', path)

@app.route('/admin')
def admin():
    return render_template('admin.html')

@app.route('/api/status')
def get_status():
    try:
        check_lock_expired()
        record = PiDigits.query.first()
        if not record:
            return jsonify({'error': 'No record found'}), 404
            
        return jsonify({
            'success': True,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'total_contributors': record.total_contributors,
            'length': len(record.pi_string) - 2,
            'is_calculating': record.is_calculating,
            'current_calculator': record.current_calculator_id,
            'lock_expires': record.lock_expires.isoformat() if record.lock_expires else None
        })
    except Exception as e:
        print(f"❌ Error in /api/status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/acquire-lock', methods=['POST'])
def acquire_lock():
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        if not client_id:
            return jsonify({'success': False, 'error': 'Missing client_id'}), 400
        
        check_lock_expired()
        record = PiDigits.query.first()
        
        if record.is_calculating:
            return jsonify({
                'success': False, 
                'error': 'Đang có người khác tính',
                'current_calculator': record.current_calculator_id
            }), 409
        
        # Cấp khóa mới (30 giây)
        record.is_calculating = True
        record.current_calculator_id = client_id
        record.lock_expires = datetime.utcnow() + timedelta(seconds=30)
        db.session.commit()
        
        print(f"🔒 Lock acquired by {client_id}")
        
        socketio.emit('lock_acquired', {
            'calculator_id': client_id,
            'position': record.next_position,
            'expires': record.lock_expires.isoformat()
        })
        
        return jsonify({
            'success': True,
            'position': record.next_position,
            'current_pi': record.pi_string,
            'expires': record.lock_expires.isoformat()
        })
        
    except Exception as e:
        print(f"❌ Error in /api/acquire-lock: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/release-lock', methods=['POST'])
def release_lock():
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        record = PiDigits.query.first()
        
        if record.current_calculator_id == client_id:
            record.is_calculating = False
            record.current_calculator_id = None
            record.lock_expires = None
            db.session.commit()
            print(f"🔓 Lock released by {client_id}")
            socketio.emit('lock_released', {'position': record.next_position})
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"❌ Error in /api/release-lock: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contribute', methods=['POST'])
def contribute():
    try:
        data = request.get_json()
        digit = data.get('digit')
        position = data.get('position')
        client_id = data.get('client_id')
        session_id = data.get('session_id', 'unknown')
        
        if not all([digit is not None, position, client_id]):
            return jsonify({'success': False, 'error': 'Thiếu thông tin'}), 400
        
        record = PiDigits.query.first()
        
        # Kiểm tra khóa
        if not record.is_calculating or record.current_calculator_id != client_id:
            return jsonify({'success': False, 'error': 'Bạn không có quyền tính'}), 403
        
        # Kiểm tra vị trí
        if position != record.next_position:
            return jsonify({
                'success': False,
                'error': f'Vị trí không đúng! Cần tính vị trí {record.next_position}'
            }), 409
        
        # Cập nhật Pi
        if record.next_position == 1:
            record.pi_string = f"3.{digit}"
        else:
            record.pi_string += str(digit)
        
        # Lưu contribution
        contribution = Contribution(
            contributor_ip=request.remote_addr,
            contributor_id=client_id,
            position=position,
            digit=digit,
            session_id=session_id
        )
        db.session.add(contribution)
        
        # Cập nhật record
        record.next_position += 1
        record.total_contributors += 1
        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None
        record.last_updated = datetime.utcnow()
        
        db.session.commit()
        
        print(f"✅ New digit: {digit} at position {position}")
        print(f"📊 Pi now: {record.pi_string}")
        
        # Broadcast real-time
        socketio.emit('new_digit', {
            'digit': digit,
            'position': position,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'total_contributors': record.total_contributors,
            'contributor_id': client_id[:8] + '...'
        })
        
        return jsonify({
            'success': True,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'message': f'Cảm ơn! Bạn đã thêm chữ số {digit} vào vị trí thứ {position}'
        })
        
    except Exception as e:
        print(f"❌ Error in /api/contribute: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/history')
def get_history():
    try:
        limit = request.args.get('limit', 50, type=int)
        contributions = Contribution.query.order_by(Contribution.timestamp.desc()).limit(limit).all()
        
        return jsonify([{
            'position': c.position,
            'digit': c.digit,
            'contributor': c.contributor_id[:8] + '...' if c.contributor_id else 'anonymous',
            'time': c.timestamp.isoformat()
        } for c in contributions])
        
    except Exception as e:
        print(f"❌ Error in /api/history: {e}")
        return jsonify({'error': str(e)}), 500

# ==================== WEBSOCKET EVENTS ====================

@socketio.on('connect')
def handle_connect():
    print(f'🔌 Client connected: {request.sid}')
    emit('connected', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f'🔌 Client disconnected: {request.sid}')

@socketio.on('request_status')
def handle_status_request():
    try:
        record = PiDigits.query.first()
        if record:
            emit('status_update', {
                'pi_string': record.pi_string,
                'next_position': record.next_position,
                'total_contributors': record.total_contributors,
                'is_calculating': record.is_calculating
            })
    except Exception as e:
        print(f"❌ Error in handle_status_request: {e}")

# ==================== MAIN ====================

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 PI CALCULATOR SERVER")
    print("=" * 60)
    print(f"📁 Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"🔐 Secret key: {app.config['SECRET_KEY'][:10]}...")
    print(f"📡 WebSocket: enabled")
    print("=" * 60)
    
    # Khởi động background task
    bg_thread = threading.Thread(target=background_task, daemon=True)
    bg_thread.start()
    print("✅ Background task started")
    
    # Chạy app
    port = int(os.environ.get('PORT', 5001))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
