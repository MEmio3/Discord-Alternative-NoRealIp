import eel
import threading
import time
import queue
import numpy as np
import tkinter as tk
from tkinter import filedialog
import os
import base64

from config import ConfigManager
from media import MediaManager
from network import NetworkNode
try:
    from chat_logger import ChatLogger
except ImportError:
    ChatLogger = None

try:
    import pygetwindow as gw
except ImportError:
    gw = None

# Initialize Eel to serve files from the 'web' folder
eel.init('web', allowed_extensions=['.js', '.html', '.css'])

# Global State
config = ConfigManager.load_config()
media = MediaManager()
net = None
connected = False
video_sending = False
watching_uid = None

# Hidden Tkinter root so we can trigger native file pickers from the Web UI!
tk_root = tk.Tk()
tk_root.withdraw()
tk_root.attributes("-topmost", True)

class WebBridge:
    """Translates Python NetworkNode callbacks safely into Javascript UI functions"""
    def after(self, ms, func, *args):
        t = threading.Timer(ms / 1000.0, lambda: func(*args))
        t.start()

    def show_secondary_host_prompt(self):
        eel.js_show_secondary_prompt()()

    def rebuild_controls_as_host(self):
        eel.js_rebuild_controls_as_host()()

    def update_all_chat_dps(self):
        pass # Fixed: Prevents the AttributeError crash! UI handles this natively.

    def on_chat_received(self, sender_uid, sender_nick, message):
        b64_img = ""
        
        if message.startswith("[IMAGE_PREVIEW]|"):
            path = message.split("|", 1)[1]
            try:
                with open(path, "rb") as f:
                    b64_img = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
            except: pass
        elif message.startswith("[VIDEO_PREVIEW]|"):
            parts = message.split("|")
            thumb_path = parts[2] if len(parts)>2 else ""
            try:
                if os.path.exists(thumb_path):
                    with open(thumb_path, "rb") as f:
                        b64_img = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
            except: pass
            
        dp_b64 = ""
        if net and sender_uid in net.dp_cache: dp_b64 = net.dp_cache[sender_uid]
        elif sender_uid == config["uid"]: dp_b64 = config.get("dp_dataurl", "")

        eel.js_on_chat_received(sender_uid, sender_nick, message, dp_b64, b64_img)()

    def update_user_list_ui(self, parsed_users):
        users = []
        for u in parsed_users:
            if len(u) < 4: continue
            users.append({
                "uid": u[0],
                "nick": u[1],
                "isLive": u[2] == "1",
                "dp": u[3],
                "bio": u[4] if len(u)>4 else "Hey there!",
                "isHost": net.connected_peers.get(u[0], {}).get("is_host", False) if net else False
            })
        eel.js_update_user_list(users)()

    def set_user_speaking(self, uid):
        eel.js_set_user_speaking(uid)()

    def render_video_frame(self, jpeg_bytes):
        b64 = base64.b64encode(jpeg_bytes).decode()
        eel.js_render_video(b64)()
        
    def on_room_accepted(self, code, name):
        eel.js_on_room_accepted(code, name)()

bridge = WebBridge()

# --- EEL PYTHON ENDPOINTS EXPOSED TO JAVASCRIPT ---

@eel.expose
def py_play_tone(tone_type):
    def _play():
        try:
            import winsound
            if tone_type == "join":
                winsound.Beep(440, 100)
                winsound.Beep(660, 150)
            elif tone_type == "leave":
                winsound.Beep(660, 100)
                winsound.Beep(440, 150)
            elif tone_type == "mute":
                winsound.Beep(300, 100)
                winsound.Beep(250, 100)
            elif tone_type == "unmute":
                winsound.Beep(400, 100)
                winsound.Beep(500, 100)
            elif tone_type == "deafen":
                winsound.Beep(200, 150)
            elif tone_type == "undeafen":
                winsound.Beep(600, 150)
        except: pass
    threading.Thread(target=_play, daemon=True).start()

@eel.expose
def py_get_config():
    return config

@eel.expose
def py_save_config(new_config):
    global config
    if "dp_path" in config and "dp_path" not in new_config:
        new_config["dp_path"] = config["dp_path"]
        
    config.update(new_config)
    ConfigManager.save_config(config)
    
    if net:
        net.nickname = config["nickname"]
        net.bio = config.get("bio", "")
        net.send_profile_update()

@eel.expose
def py_change_avatar():
    path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png;*.jpg;*.jpeg")])
    if path:
        try:
            from PIL import Image
            import io
            img = Image.open(path).convert("RGB")
            img.thumbnail((150, 150), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            b64 = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
            
            config["dp_dataurl"] = b64
            config["dp_path"] = path 
            ConfigManager.save_config(config)
            
            if net: net.send_profile_update()
            return b64
        except: pass
    return None

@eel.expose
def py_start_host(room_name, port, pwd, previous_code=None, channel_uid=None):
    global net, connected, media
    if net: net.shutdown()
    media.start_audio()
    net = NetworkNode(bridge, config)
    
    if previous_code:
        net.room_code = previous_code
        
    log_id = channel_uid if channel_uid else (previous_code if previous_code else net.room_code)
    
    if ChatLogger:
        net.chat_logger = ChatLogger(log_id)
            
    net.start_host(int(port), room_name, pwd)
    
    if net.chat_logger:
        for msg in net.chat_logger.history:
            bridge.on_chat_received(msg["uid"], msg["nick"], msg["msg"])
            
    connected = True
    start_threads()
    return net.room_code

@eel.expose
def py_start_client(ip, port, pwd):
    global net, connected, media
    if net: net.shutdown()
    media.start_audio()
    net = NetworkNode(bridge, config)
    net.start_client(ip, int(port), pwd)
    connected = True
    start_threads()

@eel.expose
def py_disconnect(shutdown=True):
    global connected, net, video_sending, watching_uid
    connected = False
    video_sending = False
    watching_uid = None
    if net:
        if not net.is_host or shutdown:
            net.shutdown()
            net = None
        else:
            msg = f"T|{config['uid']}|{config['nickname']}|Host has minimized to Lobby. Server is still running."
            net.broadcast(msg.encode())
    media.stop_audio()

@eel.expose
def py_migrate_server():
    if net and getattr(net, 'sec_host_uid', None):
        net.broadcast(b"MIGRATE|" + net.sec_host_uid.encode())
        time.sleep(0.3)
        py_disconnect(shutdown=True)
        return True
    return False

@eel.expose
def py_request_secondary(uid):
    if net and net.is_host:
        if uid in net.connected_peers:
            net.send_packet(b"REQ_SEC|" + net.uid.encode(), net.connected_peers[uid]["addr"])
            nick = net.connected_peers[uid]["nick"]
            bridge.on_chat_received("SYSTEM", "System", f"Requested {nick} to act as Secondary Host.")

@eel.expose
def py_accept_secondary():
    if net:
        net.send_packet(b"SEC_ACCEPT|" + config["uid"].encode())
        bridge.on_chat_received("SYSTEM", "System", "✅ You accepted Secondary Host duties.")

@eel.expose
def py_reenter_vc():
    global connected
    if not net: return None
    connected = True
    media.start_audio()
    start_threads()
    net.update_user_list()
    return {"name": net.room_name, "code": net.room_code}

@eel.expose
def py_send_chat(text):
    if net:
        net.send_text(text)
        bridge.on_chat_received(config["uid"], config["nickname"], text)

@eel.expose
def py_open_file(path):
    try:
        import platform
        if platform.system() == "Windows":
            os.startfile(path)
    except: pass

@eel.expose
def py_attach_file():
    if not net: return
    path = filedialog.askopenfilename()
    if path:
        size_mb = os.path.getsize(path) / (1024*1024)
        limit = getattr(net, 'file_size_limit_mb', 10)
        if size_mb > limit:
            bridge.on_chat_received("SYSTEM", "System", f"File too large! Limit is {limit}MB.")
            return
        
        filename = os.path.basename(path)
        eel.js_upload_status(True, filename)()
        
        def upload_task():
            ext = filename.lower().split('.')[-1]
            thumb_path = ""
            
            if ext in ['mp4', 'mkv', 'avi', 'mov']:
                thumb_img = media.extract_video_frame(path)
                if thumb_img:
                    os.makedirs("thumbnails", exist_ok=True)
                    safe_id = str(int(time.time()))
                    thumb_path = os.path.join("thumbnails", f"temp_thumb_{safe_id}.jpg")
                    thumb_img.save(thumb_path)
            
            net.send_file(path)
            time.sleep(0.5)
            eel.js_upload_status(False, filename)()
            
            if ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp']: msg = f"[IMAGE_PREVIEW]|{path}"
            elif ext in ['mp4', 'mkv', 'avi', 'mov']: msg = f"[VIDEO_PREVIEW]|{path}|{thumb_path}" 
            else: msg = f"📎 Shared a file: '{filename}'"
            
            bridge.on_chat_received(config["uid"], config["nickname"], msg)
            
        threading.Thread(target=upload_task, daemon=True).start()

@eel.expose
def py_toggle_mic():
    media.is_mic_muted = not media.is_mic_muted
    if media.is_mic_muted: py_play_tone("mute")
    else: py_play_tone("unmute")
    return media.is_mic_muted

@eel.expose
def py_toggle_deafen():
    media.is_deafened = not getattr(media, 'is_deafened', False)
    if media.is_deafened:
        media.is_mic_muted = True
        py_play_tone("deafen")
    else:
        py_play_tone("undeafen")
    return media.is_deafened

@eel.expose
def py_get_video_sources():
    sources = []
    try:
        import mss
        with mss.mss() as sct:
            for i in range(1, len(sct.monitors)):
                sources.append({"id": f"monitor:{i}", "name": f"Screen {i}"})
    except Exception:
        sources.append({"id": "monitor:1", "name": "Primary Screen"})

    if gw:
        try:
            for w in gw.getAllWindows():
                if w.title and w.width > 10 and w.height > 10 and w.visible:
                    sources.append({"id": f"window:{w.title}", "name": f"Window: {w.title[:45]}"})
        except Exception: pass
    return sources

@eel.expose
def py_toggle_stream(res_type, fps_val, source_id="monitor:1"):
    global video_sending, net
    if video_sending:
        video_sending = False
        if net:
            net.connected_peers[net.uid]["is_live"] = False
            net.broadcast(f"STREAM_STOP|{net.uid}".encode())
            net.update_user_list()
        return False
    
    target_width = 1280
    if "1080" in res_type: target_width = 1920
    elif "480" in res_type: target_width = 854
    
    fps = int(fps_val) if str(fps_val).isdigit() else int(str(fps_val).split()[0])
    
    src_type = "monitor"
    src_val = "1"
    if ":" in source_id:
        src_type, src_val = source_id.split(":", 1)
    
    video_sending = True
    if net:
        net.connected_peers[net.uid]["is_live"] = True
        net.broadcast(f"STREAM_START|{net.uid}".encode())
        net.update_user_list()
        
    threading.Thread(target=video_sender_thread, args=(target_width, fps, src_type, src_val), daemon=True).start()
    return True

@eel.expose
def py_watch_stream(uid):
    global watching_uid
    watching_uid = uid

@eel.expose
def py_stop_watching():
    global watching_uid
    watching_uid = None

# --- BACKGROUND THREADS ---
def start_threads():
    threading.Thread(target=audio_sender_thread, daemon=True).start()
    threading.Thread(target=audio_player_thread, daemon=True).start()
    threading.Thread(target=glow_ring_loop, daemon=True).start()

def audio_sender_thread():
    while connected:
        if net:
            chunk = media.get_audio_chunk()
            if chunk:
                try: net.send_audio(chunk)
                except AttributeError: pass
        time.sleep(0.01)

def audio_player_thread():
    while connected:
        if not net:
            time.sleep(0.1)
            continue
        try:
            chunk, sender_uid = net.audio_queue.get(timeout=1)
            if not getattr(media, 'is_deafened', False):
                media.play_audio_chunk(chunk)
        except queue.Empty: continue
        except AttributeError: pass

def glow_ring_loop():
    while connected:
        if net and not media.is_mic_muted:
            chunk = media.get_audio_chunk()
            if chunk and max(np.frombuffer(chunk, dtype=np.int16)) > 500:
                bridge.set_user_speaking(net.uid)
        time.sleep(0.1)

def video_sender_thread(target_width, fps, source_type, source_val):
    global video_sending
    frame_id = 0
    sleep_time = 1.0 / fps
    while connected and video_sending:
        if not net: break
        start_time = time.time()
        
        region = None
        monitor_idx = 1
        
        if source_type == "monitor":
            try: monitor_idx = int(source_val)
            except: monitor_idx = 1
        elif source_type == "window" and gw:
            try:
                windows = gw.getWindowsWithTitle(source_val)
                if not windows:
                    video_sending = False
                    bridge.on_chat_received("SYSTEM", "System", "Stream ended: Window was closed.")
                    if net:
                        net.connected_peers[net.uid]["is_live"] = False
                        net.broadcast(f"STREAM_STOP|{net.uid}".encode())
                        net.update_user_list()
                    break
                w = windows[0]
                if w.width > 0 and w.height > 0:
                    region = {"top": w.top, "left": w.left, "width": w.width, "height": w.height}
            except: pass
                
        if source_type == "window" and not region:
            time.sleep(sleep_time)
            continue

        jpeg_bytes = media.capture_screen_jpeg(max_width=target_width, region=region, monitor_idx=monitor_idx)
        if jpeg_bytes:
            try: net.send_video_frame(frame_id, jpeg_bytes)
            except Exception: break
            if watching_uid == net.uid: bridge.render_video_frame(jpeg_bytes)
            frame_id = (frame_id + 1) % 10000 
        elapsed = time.time() - start_time
        if elapsed < sleep_time: time.sleep(sleep_time - elapsed)

if __name__ == "__main__":
    try:
        eel.start('index.html', mode='chrome', size=(1200, 800), port=8080)
    except Exception as e:
        print("Chrome not found. Using default browser...")
        eel.start('index.html', mode='default', size=(1200, 800), port=8080)