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

# CORS - cho phép mọi domain
CORS(app)

# SocketIO - dùng threading cho ổn định
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', logger=False)

# Database
db = SQLAlchemy(app)

# ==================== DATABASE MODELS ====================

class PiDigits(db.Model):
    __tablename__ = 'pi_digits'
    id = db.Column(db.Integer, primary_key=True)
    pi_string = db.Column(db.String(100000), default="3.")  # Chuỗi Pi
    next_position = db.Column(db.Integer, default=1)        # Vị trí cần tính tiếp theo (1 = sau dấu phẩy)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)
    total_contributors = db.Column(db.Integer, default=0)
    is_calculating = db.Column(db.Boolean, default=False)   # Đang có ai tính không?
    current_calculator_id = db.Column(db.String(100), nullable=True)
    lock_expires = db.Column(db.DateTime, nullable=True)

class Contribution(db.Model):
    __tablename__ = 'contributions'
    id = db.Column(db.Integer, primary_key=True)
    contributor_ip = db.Column(db.String(50))
    contributor_id = db.Column(db.String(100))
    position = db.Column(db.Integer)          # Vị trí đã đóng góp
    digit = db.Column(db.Integer)              # Chữ số đã đóng góp
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
        print(f"✅ Database hiện tại: {record.pi_string} ({record.next_position-1} chữ số)")

# ==================== 100 CHỮ SỐ PI CHUẨN ====================
# Dùng để kiểm tra và reset nếu cần
PI_100_DIGITS = [
    3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3, 2, 7, 9, 5, 0, 2, 8, 8, 4, 1, 9, 7, 1, 6, 9, 3, 9, 9, 3, 7, 5, 1, 0, 5, 8, 2, 0, 9, 7, 4, 9, 4, 4, 5, 9, 2, 3, 0, 7, 8, 1, 6, 4, 0, 6, 2, 8, 6, 2, 0, 8, 9, 9, 8, 6, 2, 8, 0, 3, 4, 8, 2, 5, 3, 4, 2, 1, 1, 7, 0, 6, 7
]

# ==================== UTILITY FUNCTIONS ====================

def check_lock_expired():
    """Kiểm tra lock hết hạn"""
    try:
        record = PiDigits.query.first()
        if record and record.lock_expires and record.lock_expires < datetime.utcnow():
            record.is_calculating = False
            record.current_calculator_id = None
            record.lock_expires = None
            db.session.commit()
            print(f"🔓 Lock hết hạn")
            socketio.emit('lock_released', {'reason': 'expired'})
            return True
    except Exception as e:
        print(f"⚠️ Lỗi check lock: {e}")
    return False

def background_task():
    """Task chạy ngầm"""
    while True:
        time.sleep(5)
        try:
            with app.app_context():
                check_lock_expired()
        except Exception as e:
            print(f"⚠️ Lỗi background: {e}")

# ==================== ROUTES ====================

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('public', path)

@app.route('/admin')
def admin():
    return render_template('admin.html')

@app.route('/api/status')
def get_status():
    """Lấy trạng thái hiện tại"""
    try:
        check_lock_expired()
        record = PiDigits.query.first()
        if not record:
            return jsonify({'error': 'No record'}), 404
            
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
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/acquire-lock', methods=['POST'])
def acquire_lock():
    """Xin khóa để tính"""
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
                'error': 'Đang có người tính',
                'current_calculator': record.current_calculator_id
            }), 409
        
        # Cấp khóa 30 giây
        record.is_calculating = True
        record.current_calculator_id = client_id
        record.lock_expires = datetime.utcnow() + timedelta(seconds=30)
        db.session.commit()
        
        print(f"🔒 Lock cho {client_id}")
        
        socketio.emit('lock_acquired', {
            'calculator_id': client_id,
            'position': record.next_position
        })
        
        return jsonify({
            'success': True,
            'position': record.next_position,
            'current_pi': record.pi_string,
            'expires': record.lock_expires.isoformat()
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/release-lock', methods=['POST'])
def release_lock():
    """Trả khóa"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        record = PiDigits.query.first()
        
        if record.current_calculator_id == client_id:
            record.is_calculating = False
            record.current_calculator_id = None
            record.lock_expires = None
            db.session.commit()
            print(f"🔓 Trả lock {client_id}")
            socketio.emit('lock_released', {})
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contribute', methods=['POST'])
def contribute():
    """Gửi kết quả tính toán - ĐÃ FIX LỖI CỘNG DỒN"""
    try:
        data = request.get_json()
        digit = data.get('digit')
        position = data.get('position')
        client_id = data.get('client_id')
        session_id = data.get('session_id', 'unknown')
        
        # Validate
        if digit is None or not position or not client_id:
            return jsonify({'success': False, 'error': 'Thiếu thông tin'}), 400
        
        # Ép kiểu
        try:
            digit = int(digit)
            position = int(position)
        except:
            return jsonify({'success': False, 'error': 'Sai định dạng'}), 400
        
        record = PiDigits.query.first()
        
        # KIỂM TRA VỊ TRÍ - QUAN TRỌNG NHẤT
        if position != record.next_position:
            return jsonify({
                'success': False,
                'error': f'Sai vị trí! Cần vị trí {record.next_position}'
            }), 409
        
        # KIỂM TRA DIGIT (không bắt buộc, chỉ cảnh báo)
        if position <= 100:  # 100 chữ số đầu
            expected = PI_100_DIGITS[position]  # PI_100_DIGITS[1] = 4, [2] = 1, v.v.
            if digit != expected:
                print(f"⚠️ Cảnh báo: Vị trí {position} ra {digit}, đúng phải là {expected}")
        
        # CẬP NHẬT PI - CÁCH CHUẨN 100%
        if record.next_position == 1:
            # Lần đầu: "3." + digit
            record.pi_string = f"3.{digit}"
        else:
            # Các lần sau: thêm vào cuối
            # QUAN TRỌNG: Không được thêm dấu chấm hay số 3 nữa!
            record.pi_string += str(digit)
        
        # Log để debug
        print(f"📊 Pi: {record.pi_string} (thêm {digit} vào vị trí {position})")
        
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
        
        # Broadcast real-time
        socketio.emit('new_digit', {
            'digit': digit,
            'position': position,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'total_contributors': record.total_contributors,
            'contributor_id': client_id[:8] + '...' if client_id else 'anon'
        })
        
        return jsonify({
            'success': True,
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'message': f'✅ Đã thêm {digit} vào vị trí {position}'
        })
        
    except Exception as e:
        print(f"❌ Lỗi contribute: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/history')
def get_history():
    """Lấy lịch sử"""
    try:
        limit = request.args.get('limit', 30, type=int)
        contributions = Contribution.query.order_by(Contribution.timestamp.desc()).limit(limit).all()
        
        return jsonify([{
            'position': c.position,
            'digit': c.digit,
            'contributor': c.contributor_id[:8] + '...' if c.contributor_id else 'anon',
            'time': c.timestamp.isoformat()
        } for c in contributions])
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reset', methods=['POST'])
def reset_pi():
    """RESET KHẨN CẤP - Khi Pi bị sai"""
    try:
        # Xóa hết contributions
        Contribution.query.delete()
        
        # Reset Pi
        record = PiDigits.query.first()
        record.pi_string = "3."
        record.next_position = 1
        record.total_contributors = 0
        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None
        db.session.commit()
        
        print("🚨 ĐÃ RESET PI VỀ 3.")
        
        # Thông báo
        socketio.emit('reset', {
            'pi_string': "3.",
            'next_position': 1,
            'message': '⚠️ Reset về 3.'
        })
        
        return jsonify({'success': True, 'message': 'Đã reset về 3.'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/fix', methods=['POST'])
def fix_pi():
    """Fix Pi về đúng 100 chữ số đầu (dùng khi cần)"""
    try:
        # Xóa hết contributions cũ
        Contribution.query.delete()
        
        # Tạo Pi đúng 100 chữ số
        pi_correct = "3."
        for i in range(1, 101):  # 100 chữ số sau dấu phẩy
            pi_correct += str(PI_100_DIGITS[i])
        
        record = PiDigits.query.first()
        record.pi_string = pi_correct
        record.next_position = 101  # Vị trí tiếp theo là 101
        record.total_contributors = 100
        record.is_calculating = False
        record.current_calculator_id = None
        record.lock_expires = None
        db.session.commit()
        
        # Thêm vào lịch sử (tùy chọn)
        for i in range(1, 101):
            contrib = Contribution(
                contributor_ip="system",
                contributor_id="system",
                position=i,
                digit=PI_100_DIGITS[i],
                session_id="fix"
            )
            db.session.add(contrib)
        
        db.session.commit()
        
        print(f"✅ ĐÃ FIX PI VỀ: {pi_correct[:50]}...")
        
        socketio.emit('reset', {
            'pi_string': pi_correct,
            'next_position': 101,
            'message': '✅ Đã fix về Pi chuẩn'
        })
        
        return jsonify({'success': True, 'pi_string': pi_correct[:50] + '...'})
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== WEBSOCKET ====================

@socketio.on('connect')
def handle_connect():
    print(f'🔌 Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'🔌 Client disconnected: {request.sid}')

# ==================== MAIN ====================

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 PI CALCULATOR - ĐÃ FIX LỖI CỘNG DỒN")
    print("=" * 60)
    
    # Khởi động background task
    bg_thread = threading.Thread(target=background_task, daemon=True)
    bg_thread.start()
    
    # Chạy app
    port = int(os.environ.get('PORT', 5001))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
