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
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', logger=False, ping_timeout=60, ping_interval=25)

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
# Dùng để kiểm tra và fix lỗi
PI_100_DIGITS = [
    3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4, 6, 2, 6, 4, 3, 3, 8, 3, 2, 7, 9, 5, 0, 2, 8, 8, 4, 1, 9, 7, 1, 6, 9, 3, 9, 9, 3, 7, 5, 1, 0, 5, 8, 2, 0, 9, 7, 4, 9, 4, 4, 5, 9, 2, 3, 0, 7, 8, 1, 6, 4, 0, 6, 2, 8, 6, 2, 0, 8, 9, 9, 8, 6, 2, 8, 0, 3, 4, 8, 2, 5, 3, 4, 2, 1, 1, 7, 0, 6, 7
]

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
        print(f"⚠️ Lỗi check lock: {e}")
    return False

def background_task():
    """Task chạy ngầm kiểm tra lock hết hạn"""
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
    """Trang chủ"""
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Phục vụ file static"""
    return send_from_directory('public', path)

@app.route('/admin')
def admin():
    """Trang admin"""
    return render_template('admin.html')

@app.route('/api/status')
def get_status():
    """Lấy trạng thái hiện tại"""
    try:
        check_lock_expired()
        record = PiDigits.query.first()
        if not record:
            return jsonify({'success': False, 'error': 'Không tìm thấy record'}), 404
            
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
        print(f"❌ Lỗi /api/status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/acquire-lock', methods=['POST'])
def acquire_lock():
    """Xin khóa để tính"""
    try:
        data = request.get_json()
        client_id = data.get('client_id')
        
        if not client_id:
            return jsonify({'success': False, 'error': 'Thiếu client_id'}), 400
        
        check_lock_expired()
        record = PiDigits.query.first()
        
        if record.is_calculating:
            return jsonify({
                'success': False, 
                'error': 'Đang có người khác tính',
                'current_calculator': record.current_calculator_id
            }), 409
        
        # Cấp khóa 30 giây
        record.is_calculating = True
        record.current_calculator_id = client_id
        record.lock_expires = datetime.utcnow() + timedelta(seconds=30)
        db.session.commit()
        
        print(f"🔒 Lock acquired by {client_id} cho vị trí {record.next_position}")
        
        # Thông báo cho các client khác
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
        print(f"❌ Lỗi acquire_lock: {e}")
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
            print(f"🔓 Lock released by {client_id}")
            socketio.emit('lock_released', {
                'position': record.next_position
            })
        
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"❌ Lỗi release_lock: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/contribute', methods=['POST'])
def contribute():
    """
    Gửi kết quả tính toán - ĐÃ FIX LỖI CỘNG DỒN
    QUAN TRỌNG: Chỉ thêm đúng 1 chữ số vào cuối chuỗi, không thêm dấu chấm hay số 3
    """
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
            return jsonify({'success': False, 'error': 'Sai định dạng số'}), 400
        
        # Kiểm tra digit hợp lệ
        if digit < 0 or digit > 9:
            return jsonify({'success': False, 'error': 'Chữ số phải từ 0-9'}), 400
        
        record = PiDigits.query.first()
        
        # KIỂM TRA VỊ TRÍ - QUAN TRỌNG NHẤT
        if position != record.next_position:
            return jsonify({
                'success': False,
                'error': f'Sai vị trí! Cần tính vị trí {record.next_position}'
            }), 409
        
        # KIỂM TRA KHÓA
        if not record.is_calculating or record.current_calculator_id != client_id:
            return jsonify({
                'success': False,
                'error': 'Bạn không có quyền tính tại thời điểm này'
            }), 403
        
        # CẬP NHẬT PI - CÁCH CHUẨN 100%
        if record.next_position == 1:
            # Lần đầu: "3." + digit
            record.pi_string = f"3.{digit}"
            print(f"📊 Lần đầu: 3.{digit}")
        else:
            # Các lần sau: thêm vào cuối - KHÔNG thêm dấu chấm hay số 3
            old_pi = record.pi_string
            record.pi_string += str(digit)
            print(f"📊 {old_pi} + {digit} = {record.pi_string}")
        
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
        
        print(f"✅ Đã thêm chữ số {digit} vào vị trí {position}")
        print(f"📊 Pi hiện tại: {record.pi_string}")
        
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
            'message': f'✅ Đã thêm chữ số {digit} vào vị trí {position}'
        })
        
    except Exception as e:
        print(f"❌ Lỗi contribute: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/history')
def get_history():
    """Lấy lịch sử đóng góp"""
    try:
        limit = request.args.get('limit', 30, type=int)
        contributions = Contribution.query.order_by(Contribution.timestamp.desc()).limit(limit).all()
        
        return jsonify([{
            'position': c.position,
            'digit': c.digit,
            'contributor': c.contributor_id[:8] + '...' if c.contributor_id else 'anonymous',
            'ip': c.contributor_ip,
            'time': c.timestamp.isoformat()
        } for c in contributions])
        
    except Exception as e:
        print(f"❌ Lỗi get_history: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/reset', methods=['POST'])
def reset_pi():
    """
    RESET KHẨN CẤP - Khi Pi bị sai (3.55, 3.78, 3.25140...)
    Dùng API này để reset về 3.
    """
    try:
        # Xóa hết lịch sử
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
        
        # Thông báo cho các client
        socketio.emit('reset', {
            'pi_string': "3.",
            'next_position': 1,
            'message': '⚠️ Hệ thống đã reset về 3.'
        })
        
        return jsonify({'success': True, 'message': 'Đã reset Pi về 3.'})
        
    except Exception as e:
        print(f"❌ Lỗi reset: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/fix', methods=['POST'])
def fix_pi():
    """
    Fix Pi về đúng 100 chữ số đầu (dùng khi cần khôi phục)
    """
    try:
        # Xóa lịch sử cũ
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
        
        # Thêm vào lịch sử (optional)
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
            'message': '✅ Đã fix về Pi chuẩn 100 số'
        })
        
        return jsonify({'success': True, 'message': f'Đã fix về Pi: {pi_correct[:30]}...'})
        
    except Exception as e:
        print(f"❌ Lỗi fix: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/debug', methods=['GET'])
def debug():
    """API debug - xem trạng thái chi tiết"""
    try:
        record = PiDigits.query.first()
        contributions = Contribution.query.count()
        
        return jsonify({
            'pi_string': record.pi_string,
            'next_position': record.next_position,
            'total_contributors': record.total_contributors,
            'contributions_count': contributions,
            'is_calculating': record.is_calculating,
            'current_calculator': record.current_calculator_id,
            'lock_expires': record.lock_expires.isoformat() if record.lock_expires else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== WEBSOCKET EVENTS ====================

@socketio.on('connect')
def handle_connect():
    """Xử lý khi client kết nối"""
    print(f'🔌 Client connected: {request.sid}')
    emit('connected', {'message': 'Connected to Pi Calculator server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Xử lý khi client ngắt kết nối"""
    print(f'🔌 Client disconnected: {request.sid}')

@socketio.on('request_status')
def handle_status_request():
    """Client yêu cầu trạng thái"""
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
        print(f"❌ Lỗi handle_status_request: {e}")

# ==================== MAIN ====================

if __name__ == '__main__':
    print("=" * 70)
    print("🚀 PI CALCULATOR - ĐÃ FIX LỖI CỘNG DỒN 3.78")
    print("=" * 70)
    print(f"📁 Database: {app.config['SQLALCHEMY_DATABASE_URI']}")
    print(f"🔐 Secret key: {app.config['SECRET_KEY'][:10]}...")
    print(f"📡 WebSocket: enabled (threading mode)")
    print("=" * 70)
    print("✅ Các API có sẵn:")
    print("   - GET  /api/status        : Lấy trạng thái")
    print("   - POST /api/acquire-lock  : Xin khóa")
    print("   - POST /api/release-lock  : Trả khóa")
    print("   - POST /api/contribute    : Gửi kết quả")
    print("   - GET  /api/history       : Lịch sử")
    print("   - POST /api/reset         : RESET KHẨN (về 3.)")
    print("   - POST /api/fix            : Fix về Pi chuẩn")
    print("   - GET  /api/debug          : Debug info")
    print("=" * 70)
    
    # Khởi động background task
    bg_thread = threading.Thread(target=background_task, daemon=True)
    bg_thread.start()
    print("✅ Background task started")
    
    # Chạy app
    port = int(os.environ.get('PORT', 5001))
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)
