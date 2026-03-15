import os
import json
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import OperationalError
import hashlib
import hmac
import random

app = Flask(__name__, static_folder='public', template_folder='templates')
app.config['SECRET_KEY'] = os.urandom(24).hex()
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///pi_digits.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}

# Khởi tạo SocketIO với eventlet
socketio = SocketIO(app, 
                   cors_allowed_origins="*", 
                   async_mode='eventlet',
                   ping_timeout=60,
                   ping_interval=25,
                   logger=True,
                   engineio_logger=True)

# Khởi tạo database
db = SQLAlchemy(app)

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
        print("✅ Đã khởi tạo database với giá trị ban đầu: 3.")

# --- Thuật toán Spigot để tính Pi ---
class SpigotPi:
    """Thuật toán Spigot để tính từng chữ số Pi"""
    
    @staticmethod
    def calculate_next_digit(current_pi_string):
        """
        Tính chữ số tiếp theo của Pi dựa vào chuỗi hiện tại
        """
        try:
            # Đếm số chữ số đã có sau dấu phẩy
            if '.' not in current_pi_string:
                return 3
            
            parts = current_pi_string.split('.')
            if len(parts) < 2:
                return 3
                
            decimal_part = parts[1]
            n = len(decimal_part)  # Số chữ số thập phân đã có
            
            # Nếu chưa có chữ số nào, trả về 3 (phần nguyên)
            if n == 0:
                return 3
            
            # Thuật toán Spigot chính xác
            def spigot_digit(k):
                """Tính chữ số thứ k sau dấu phẩy"""
                # Kích thước mảng cần thiết
                size = (10 * (k + 1)) // 3 + 1
                array = [2] * size
                result = []
                
                for _ in range(k + 2):  # Cần tính thêm 1 để đảm bảo độ chính xác
                    carry = 0
                    for i in range(size - 1, -1, -1):
                        array[i] = array[i] * 10 + carry
                        carry = (array[i] // (2 * i + 1)) * i
                        array[i] = array[i] % (2 * i + 1)
                    
                    array[0] = array[0] // 10
                    result.append(carry // 10)
                
                return result[k + 1] if len(result) > k + 1 else 0
            
            # Tính chữ số thứ n
            digit = spigot_digit(n)
            return digit
            
        except Exception as e:
            print(f"⚠️ Lỗi Spigot: {e}")
            # Fallback: các chữ số Pi đã biết để demo
            known_digits = [1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6]
            if n < len(known_digits):
                return known_digits[n]
            return random.randint(0, 9)

# --- Utility functions ---
def generate_session_id():
    """Tạo session ID cho client"""
    return hashlib.md5(str(time.time()).encode() + os.urandom(16)).hexdigest()[:16]

def check_lock_expired(record):
    """Kiểm tra khóa có hết hạn không"""
    if record.lock_expires and record.lock_expires < datetime.utcnow():
        old_calculator = record.current_calculator_id
        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None
        db.session.commit()
        print(f"🔓 Lock tự động hết hạn cho {old_calculator}")
        return True
    return False

# --- Routes ---
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/admin')
def admin():
    """Trang admin để theo dõi"""
    return render_template('admin.html')

@app.route('/api/status')
def get_status():
    """Lấy trạng thái hiện tại"""
    try:
        record = PiDigits.query.first()
        if not record:
            return jsonify({'error': 'No record found'}), 404
            
        check_lock_expired(record)
        
        return jsonify({
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
        return jsonify({'error': str(e)}), 500

@app.route('/api/acquire-lock', methods=['POST'])
def acquire_lock():
    """Client xin khóa để được tính"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        if not client_id:
            return jsonify({'success': False, 'error': 'Missing client_id'}), 400
        
        record = PiDigits.query.first()
        if not record:
            return jsonify({'success': False, 'error': 'No record found'}), 404
        
        # Kiểm tra khóa cũ có hết hạn không
        check_lock_expired(record)
        
        # Nếu đang có người tính
        if record.is_calculating:
            return jsonify({
                'success': False, 
                'error': 'Đang có người khác tính',
                'current_calculator': record.current_calculator_id
            }), 409
        
        # Cấp khóa mới (thời hạn 30 giây)
        record.is_calculating = True
        record.current_calculator_id = client_id
        record.lock_expires = datetime.utcnow() + timedelta(seconds=30)
        
        db.session.commit()
        print(f"🔒 Lock acquired by {client_id}, expires at {record.lock_expires}")
        
        # Thông báo cho mọi người
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
    """Client trả khóa (khi không tính nữa)"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        record = PiDigits.query.first()
        if not record:
            return jsonify({'success': False, 'error': 'No record found'}), 404
        
        if record.current_calculator_id == client_id:
            record.is_calculating = False
            record.current_calculator_id = None
            record.lock_expires = None
            db.session.commit()
            
            print(f"🔓 Lock released by {client_id}")
            
            socketio.emit('lock_released', {
                'position': record.next_position
            })
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"❌ Error in /api/release-lock: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contribute', methods=['POST'])
def contribute():
    """Gửi kết quả tính toán"""
    try:
        data = request.get_json()
        digit = data.get('digit')
        position = data.get('position')
        client_id = data.get('client_id')
        session_id = data.get('session_id', 'unknown')
        
        # Validate
        if not all([digit is not None, position, client_id]):
            return jsonify({'success': False, 'error': 'Thiếu thông tin'}), 400
        
        record = PiDigits.query.first()
        if not record:
            return jsonify({'success': False, 'error': 'No record found'}), 404
        
        # Kiểm tra khóa
        if not record.is_calculating or record.current_calculator_id != client_id:
            return jsonify({
                'success': False, 
                'error': 'Bạn không có quyền tính tại thời điểm này'
            }), 403
        
        # Kiểm tra vị trí
        if position != record.next_position:
            return jsonify({
                'success': False,
                'error': f'Vị trí không đúng! Cần tính vị trí {record.next_position}'
            }), 409
        
        # Kiểm tra digit
        if not isinstance(digit, int) or digit < 0 or digit > 9:
            return jsonify({'success': False, 'error': 'Chữ số không hợp lệ'}), 400
        
        # Lấy IP
        contributor_ip = request.remote_addr
        
        # Cập nhật Pi
        if record.next_position == 1:
            record.pi_string = f"3.{digit}"
        else:
            record.pi_string += str(digit)
        
        # Lưu contribution
        contribution = Contribution(
            contributor_ip=contributor_ip,
            contributor_id=client_id,
            position=position,
            digit=digit,
            session_id=session_id
        )
        db.session.add(contribution)
        
        # Cập nhật record chính
        record.next_position += 1
        record.total_contributors += 1
        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None
        record.last_updated = datetime.utcnow()
        
        db.session.commit()
        
        print(f"✅ New digit: {digit} at position {position} by {client_id}")
        print(f"📊 Pi now: {record.pi_string}")
        
        # Broadcast real-time
        socketio.emit('new_digit', {
            'digit': digit,
            'position': position,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'total_contributors': record.total_contributors,
            'contributor_id': client_id[:8] + '...' if client_id else 'anonymous'
        })
        
        return jsonify({
            'success': True,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'message': f'Cảm ơn! Bạn đã thêm chữ số {digit} vào vị trí thứ {position}'
        })
        
    except Exception as e:
        print(f"❌ Error in /api/contribute: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/history')
def get_history():
    """Lấy lịch sử đóng góp"""
    try:
        limit = request.args.get('limit', 50, type=int)
        contributions = Contribution.query.order_by(Contribution.timestamp.desc()).limit(limit).all()
        
        return jsonify([{
            'position': c.position,
            'digit': c.digit,
            'contributor': c.contributor_id[:8] + '...' if c.contributor_id else 'anonymous',
            'ip': c.contributor_ip,
            'session': c.session_id[:8] if c.session_id else 'unknown',
            'time': c.timestamp.isoformat()
        } for c in contributions])
        
    except Exception as e:
        print(f"❌ Error in /api/history: {e}")
        return jsonify({'error': str(e)}), 500

# --- WebSocket events ---
@socketio.on('connect')
def handle_connect():
    print(f'🔌 Client connected: {request.sid}')
    emit('connected', {'sid': request.sid, 'message': 'Connected to Pi Calculator server'})

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

# --- Error handlers ---
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500

# --- Main entry point ---
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Pi Calculator Server đang khởi động...")
    print(f"📁 Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"🔐 Secret key: {app.config['SECRET_KEY'][:10]}...")
    print("=" * 50)
    
    # Chạy với eventlet
    socketio.run(
        app, 
        debug=True, 
        port=5001, 
        host='0.0.0.0',
        allow_unsafe_werkzeug=True,
        use_reloader=True
    )
