import socket
import threading
import queue
import time
import os
from config import ConfigManager
from chat_logger import ChatLogger

UDP_MAX_SIZE = 60000
HEARTBEAT_INTERVAL = 2.0
TIMEOUT_LIMIT = 12.0

class NetworkNode:
    def __init__(self, app_callback, config):
        self.app = app_callback
        self.config = config
        self.uid = config["uid"]
        self.nickname = config["nickname"]
        self.bio = config.get("bio", "")
        
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(('0.0.0.0', 0)) 
        
        self.is_host = False
        self.running = False
        
        self.room_code = ""
        self.room_name = ""
        self.room_password = ""
        
        self.connected_peers = {} 
        self.dp_cache = {} 
        self.banned_uids = set() 
        self.file_size_limit_mb = 10 
        
        self.sec_host_uid = None 
        self.host_timeout_counter = 0 
        
        self.current_target = None
        self.audio_queue = queue.Queue()
        self.video_buffer = {} 
        self.chat_logger = None

    def load_my_dp_b64(self):
        # FIXED: Just strictly return the Base64 cache from the JSON to avoid File errors!
        dp = self.config.get("dp_dataurl", "")
        if dp.startswith("data:image"):
            return dp.split(",", 1)[1] 
        return dp
        
    def start_host(self, port, room_name, password):
        self.is_host = True
        self.room_name = room_name
        self.room_password = password
        self.room_code = ConfigManager.generate_room_code()
        
        self.sock.close() 
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(('0.0.0.0', port))
        self.host_port = port
        
        self.running = True
        self.connected_peers[self.uid] = {"addr": ('127.0.0.1', port), "nick": self.nickname, "last_seen": time.time(), "is_live": False, "bio": self.bio, "is_host": True}
        self.dp_cache[self.uid] = self.load_my_dp_b64()
        
        self.start_threads()
        
    def start_client(self, primary_ip, port, password):
        self.is_host = False
        self.current_target = (primary_ip, port)
        self.room_password = password
        self.host_port = port
        self.running = True
        self.start_threads()
        
        dp_b64 = self.load_my_dp_b64()
        self.send_packet(f"JOIN|{self.uid}|{self.nickname}|{self.room_password}|{dp_b64}|{self.bio}".encode())

    def start_threads(self):
        threading.Thread(target=self.network_listener, daemon=True).start()
        threading.Thread(target=self.heartbeat_monitor, daemon=True).start()

    def send_packet(self, data, target=None):
        try:
            if target: self.sock.sendto(data, target)
            elif not self.is_host and self.current_target: self.sock.sendto(data, self.current_target)
        except: pass

    def broadcast(self, data, exclude_uid=None):
        if not self.is_host: return
        for uid, peer in self.connected_peers.items():
            if uid != exclude_uid and uid != self.uid:
                self.send_packet(data, peer["addr"])

    def ban_user(self, uid_to_ban):
        if not self.is_host or uid_to_ban not in self.connected_peers: return
        addr = self.connected_peers[uid_to_ban]["addr"]
        nick = self.connected_peers[uid_to_ban]["nick"]
        self.banned_uids.add(uid_to_ban)
        del self.connected_peers[uid_to_ban]
        self.send_packet(b"REJECT|Host|You have been BANNED by the Admin.", addr)
        self.update_user_list()
        self.app.on_chat_received("SYSTEM", "System", f"🛡️ Admin banned {nick}.")

    def unban_user(self, uid_to_unban):
        if not self.is_host or uid_to_unban not in self.banned_uids: return
        self.banned_uids.remove(uid_to_unban)
        self.app.on_chat_received("SYSTEM", "System", f"🛡️ Admin unbanned UID: {uid_to_unban[:8]}...")

    def heartbeat_monitor(self):
        while self.running:
            time.sleep(HEARTBEAT_INTERVAL)
            if self.is_host:
                current_time = time.time()
                dead_uids = []
                for uid, peer in self.connected_peers.items():
                    if uid != self.uid and (current_time - peer["last_seen"] > TIMEOUT_LIMIT):
                        dead_uids.append(uid)
                for uid in dead_uids:
                    nick = self.connected_peers[uid]["nick"]
                    del self.connected_peers[uid]
                    self.update_user_list()
                    self.app.on_chat_received("SYSTEM", "System", f"{nick} timed out and left.")
            else:
                self.send_packet(f"BEAT|{self.uid}".encode())
                
                self.host_timeout_counter += HEARTBEAT_INTERVAL
                if self.host_timeout_counter > TIMEOUT_LIMIT + 2.0: 
                    if self.sec_host_uid and self.sec_host_uid == self.uid:
                        self.app.on_chat_received("SYSTEM", "System", "⚠️ Host timed out! You are taking over as Host.")
                        self.is_host = True
                        self.host_timeout_counter = 0
                        self.app.after(0, self.app.rebuild_controls_as_host)
                    elif self.sec_host_uid:
                        self.app.on_chat_received("SYSTEM", "System", "⚠️ Host timed out! Migrating to Secondary Host...")
                        if self.sec_host_uid in self.connected_peers:
                            self.current_target = self.connected_peers[self.sec_host_uid]["addr"]
                        self.host_timeout_counter = 0
                        dp = self.load_my_dp_b64()
                        self.send_packet(f"JOIN|{self.uid}|{self.nickname}|{self.room_password}|{dp}|{self.bio}".encode())

    def send_profile_update(self):
        self.nickname = self.config["nickname"]
        self.bio = self.config.get("bio", "")
        dp_b64 = self.load_my_dp_b64()
        data = f"PROFILE|{self.uid}|{self.nickname}|{dp_b64}|{self.bio}".encode()
        if self.is_host:
            self.connected_peers[self.uid]["nick"] = self.nickname
            self.connected_peers[self.uid]["bio"] = self.bio
            self.dp_cache[self.uid] = dp_b64
            self.broadcast(data)
            self.update_user_list()
            self.app.update_all_chat_dps()
        else:
            self.send_packet(data)

    def network_listener(self):
        while self.running:
            try:
                data, addr = self.sock.recvfrom(65535)
                parts = data.split(b'|', maxsplit=2)
                if len(parts) < 2: continue
                
                p_type = parts[0].decode(errors='ignore')
                sender_uid = parts[1].decode(errors='ignore')
                payload = parts[2] if len(parts) > 2 else b''

                if not self.is_host and addr == self.current_target:
                    self.host_timeout_counter = 0

                if self.is_host and sender_uid in self.connected_peers:
                    self.connected_peers[sender_uid]["last_seen"] = time.time()
                    self.connected_peers[sender_uid]["addr"] = addr 

                if p_type == "BEAT": continue 

                elif p_type == "JOIN":
                    if self.is_host:
                        if sender_uid in self.banned_uids:
                            self.send_packet(f"REJECT|Host|You are BANNED from this room.".encode(), addr)
                            continue
                            
                        join_parts = payload.split(b'|', maxsplit=4)
                        if len(join_parts) < 1: continue
                        nick = join_parts[0].decode(errors='ignore')
                        pwd = join_parts[1].decode(errors='ignore') if len(join_parts) > 1 else ""
                        dp_b64 = join_parts[2].decode(errors='ignore') if len(join_parts) > 2 else ""
                        bio = join_parts[3].decode(errors='ignore') if len(join_parts) > 3 else ""
                        
                        if self.room_password and pwd != self.room_password:
                            self.send_packet(f"REJECT|Host|Invalid Password.".encode(), addr)
                            continue
                        
                        is_new = sender_uid not in self.connected_peers
                        self.connected_peers[sender_uid] = {"addr": addr, "nick": nick, "last_seen": time.time(), "is_live": False, "bio": bio, "is_host": False}
                        self.dp_cache[sender_uid] = dp_b64
                        
                        self.send_packet(f"ACCEPT|Host|{self.room_code}|{self.room_name}|{self.file_size_limit_mb}".encode(), addr)
                        if self.chat_logger:
                            for msg in self.chat_logger.history:
                                hist_pkt = f"HISTORY|{msg['uid']}|{msg['nick']}|{msg['msg']}".encode()
                                self.send_packet(hist_pkt, addr)
                            
                        self.update_user_list() 
                        if is_new: self.app.on_chat_received("SYSTEM", "System", f"{nick} joined.")

                elif p_type == "LEAVE":
                    if self.is_host and sender_uid in self.connected_peers:
                        nick = self.connected_peers[sender_uid]["nick"]
                        del self.connected_peers[sender_uid]
                        self.update_user_list()
                        self.app.on_chat_received("SYSTEM", "System", f"{nick} left the room.")
                    elif not self.is_host:
                        self.app.on_chat_received("SYSTEM", "System", "Host closed the room.")
                        self.app.after(1500, self.app.disconnect)
                        
                elif p_type == "LIMIT":
                    if not self.is_host:
                        self.file_size_limit_mb = int(sender_uid)
                        self.app.on_chat_received("SYSTEM", "System", f"Host changed file limit to {self.file_size_limit_mb}MB.")

                elif p_type == "REQ_SEC":
                    if not self.is_host:
                        self.app.show_secondary_host_prompt()
                        
                elif p_type == "SEC_ACCEPT":
                    if self.is_host:
                        self.sec_host_uid = sender_uid
                        self.broadcast(b"NEW_SEC_HOST|" + sender_uid.encode())
                        nick = self.connected_peers.get(sender_uid, {}).get("nick", "Someone")
                        self.app.on_chat_received("SYSTEM", "System", f"🛡️ {nick} is now the Secondary Host.")

                elif p_type == "NEW_SEC_HOST":
                    if not self.is_host:
                        self.sec_host_uid = payload.decode(errors='ignore')

                elif p_type == "MIGRATE":
                    mig_uid = payload.decode(errors='ignore')
                    if not self.is_host:
                        if self.uid == mig_uid:
                            self.is_host = True
                            self.app.on_chat_received("SYSTEM", "System", "👑 You have been promoted to Host! Room migrated.")
                            self.app.rebuild_controls_as_host()
                        else:
                            if mig_uid in self.connected_peers:
                                self.current_target = self.connected_peers[mig_uid]["addr"]
                                self.app.on_chat_received("SYSTEM", "System", "Host left. Migrating to Secondary Host...")
                                dp_b64 = self.load_my_dp_b64()
                                self.send_packet(f"JOIN|{self.uid}|{self.nickname}|{self.room_password}|{dp_b64}|{self.bio}".encode())

                elif p_type == "HISTORY":
                    hist_parts = payload.split(b'|', maxsplit=1)
                    if len(hist_parts) == 2:
                        h_nick = hist_parts[0].decode(errors='ignore')
                        h_msg = hist_parts[1].decode(errors='ignore')
                        self.app.on_chat_received(sender_uid, h_nick, h_msg)

                elif p_type == "PROFILE":
                    profile_parts = payload.split(b'|', maxsplit=2)
                    if len(profile_parts) >= 2:
                        nick = profile_parts[0].decode(errors='ignore')
                        dp_b64 = profile_parts[1].decode(errors='ignore')
                        bio = profile_parts[2].decode(errors='ignore') if len(profile_parts) > 2 else ""
                        if self.is_host:
                            if sender_uid in self.connected_peers:
                                self.connected_peers[sender_uid]["nick"] = nick
                                self.connected_peers[sender_uid]["bio"] = bio
                                self.dp_cache[sender_uid] = dp_b64
                                self.broadcast(data, exclude_uid=sender_uid)
                                self.update_user_list()
                        else:
                            self.dp_cache[sender_uid] = dp_b64
                            if sender_uid in self.connected_peers: self.connected_peers[sender_uid]["bio"] = bio
                        self.app.update_all_chat_dps()

                elif p_type == "ACCEPT":
                    acc_parts = payload.split(b'|', maxsplit=2)
                    if len(acc_parts) >= 2:
                        room_code = acc_parts[0].decode(errors='ignore')
                        room_name = acc_parts[1].decode(errors='ignore')
                        if len(acc_parts) == 3:
                            self.file_size_limit_mb = int(acc_parts[2].decode())
                        self.app.on_room_accepted(room_code, room_name)

                elif p_type == "REJECT":
                    reason = payload.decode(errors='ignore')
                    self.app.on_chat_received("SYSTEM", "System", f"Connection rejected: {reason}")

                elif p_type == "STREAM_START" or p_type == "STREAM_STOP":
                    if self.is_host and sender_uid in self.connected_peers:
                        self.connected_peers[sender_uid]["is_live"] = (p_type == "STREAM_START")
                        self.update_user_list()

                elif p_type == "LIST":
                    users_data = payload.decode(errors='ignore').split(',')
                    parsed_users = []
                    for u in users_data:
                        if not u: continue
                        u_parts = u.split(':', 4)
                        if len(u_parts) >= 4:
                            self.dp_cache[u_parts[0]] = u_parts[3]
                            if len(u_parts) == 5 and u_parts[0] in self.connected_peers:
                                self.connected_peers[u_parts[0]]["bio"] = u_parts[4]
                            parsed_users.append(u_parts)
                    self.app.update_user_list_ui(parsed_users)
                    self.app.update_all_chat_dps()

                elif p_type == "T":
                    t_parts = payload.split(b'|', maxsplit=1)
                    if len(t_parts) == 2:
                        nick = t_parts[0].decode(errors='ignore')
                        msg = t_parts[1].decode(errors='ignore')
                        if self.is_host: 
                            if self.chat_logger: self.chat_logger.add_message(sender_uid, nick, msg)
                            self.broadcast(data, exclude_uid=sender_uid)
                        self.app.on_chat_received(sender_uid, nick, msg)

                elif p_type == "FILE":
                    if self.is_host: self.broadcast(data, exclude_uid=sender_uid)
                    f_parts = payload.split(b'|', maxsplit=2)
                    if len(f_parts) == 3:
                        filename = f_parts[0].decode(errors='ignore')
                        chunk_id = int(f_parts[1])
                        f_data = f_parts[2]
                        self.handle_file_chunk(sender_uid, filename, chunk_id, f_data)

                elif p_type == "A":
                    if self.is_host: self.broadcast(data, exclude_uid=sender_uid)
                    self.audio_queue.put((payload, sender_uid))
                    self.app.set_user_speaking(sender_uid)

                elif p_type == "V":
                    if self.is_host: self.broadcast(data, exclude_uid=sender_uid)
                    if watching_uid == sender_uid:
                        self.handle_video_chunk(payload)

            except OSError:
                break
                
    def send_file(self, filepath):
        filename = os.path.basename(filepath)
        try:
            with open(filepath, 'rb') as f:
                file_bytes = f.read()
        except: return
        
        ext = filename.lower().split('.')[-1]
        
        if self.is_host and self.chat_logger:
            if ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp']:
                self.chat_logger.add_message(self.uid, self.nickname, f"[IMAGE_PREVIEW]|{filepath}")
            elif ext in ['mp4', 'mkv', 'avi', 'mov']:
                os.makedirs("thumbnails", exist_ok=True)
                thumb = os.path.join("thumbnails", f"temp_thumb_{int(time.time())}.jpg")
                self.chat_logger.add_message(self.uid, self.nickname, f"[VIDEO_PREVIEW]|{filepath}|{thumb}")
            else:
                self.chat_logger.add_message(self.uid, self.nickname, f"📎 Shared a file: '{filename}'")
            
        chunks = [file_bytes[i:i + UDP_MAX_SIZE] for i in range(0, len(file_bytes), UDP_MAX_SIZE)]
        total_chunks = len(chunks)
        
        for i, chunk in enumerate(chunks):
            if i == total_chunks - 1: chunk += b"<-EOF->" 
            data = f"FILE|{self.uid}|{filename}|{i}|".encode() + chunk
            if self.is_host: self.broadcast(data)
            else: self.send_packet(data)
            time.sleep(0.01) 

    def handle_file_chunk(self, sender_uid, filename, chunk_id, data):
        is_eof = False
        if data.endswith(b"<-EOF->"):
            is_eof = True
            data = data[:-7]
            
        file_key = f"{sender_uid}_{filename}"
        if file_key not in self.video_buffer:
            self.video_buffer[file_key] = {}
            
        self.video_buffer[file_key][chunk_id] = data
        
        if is_eof:
            save_dir = "hub_downloads"
            os.makedirs(save_dir, exist_ok=True)
            save_path = os.path.join(save_dir, filename)
            
            try:
                with open(save_path, 'wb') as f:
                    for i in range(len(self.video_buffer[file_key])):
                        f.write(self.video_buffer[file_key][i])
                        
                nick = self.connected_peers.get(sender_uid, {}).get("nick", "Someone")
                if sender_uid == self.uid: nick = self.nickname
                    
                ext = filename.lower().split('.')[-1]
                if ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp']:
                    msg = f"[IMAGE_PREVIEW]|{save_path}"
                elif ext in ['mp4', 'mkv', 'avi', 'mov']:
                    thumb_img = self.app.media.extract_video_frame(save_path)
                    thumb_path = ""
                    if thumb_img:
                        os.makedirs("thumbnails", exist_ok=True)
                        thumb_path = os.path.join("thumbnails", f"temp_thumb_recv_{int(time.time())}.jpg")
                        thumb_img.save(thumb_path)
                    msg = f"[VIDEO_PREVIEW]|{save_path}|{thumb_path}"
                else:
                    msg = f"📎 Shared a file: '{filename}' (Saved to {save_dir}/)"
                    
                self.app.on_chat_received(sender_uid, nick, msg)
                if self.is_host and self.chat_logger: self.chat_logger.add_message(sender_uid, nick, msg)
            except: pass
            del self.video_buffer[file_key]

    def handle_video_chunk(self, payload):
        parts = payload.split(b'|', maxsplit=3)
        if len(parts) < 4: return
        try:
            frame_id, total_chunks, chunk_id = int(parts[0]), int(parts[1]), int(parts[2])
            chunk_data = parts[3]
        except ValueError: return

        if frame_id not in self.video_buffer:
            old_keys = [k for k in self.video_buffer.keys() if isinstance(k, int) and k < frame_id - 5]
            for k in old_keys: del self.video_buffer[k]
            self.video_buffer[frame_id] = {'total': total_chunks, 'chunks': {}, 'time': time.time()}

        self.video_buffer[frame_id]['chunks'][chunk_id] = chunk_data

        if len(self.video_buffer[frame_id]['chunks']) == total_chunks:
            full_jpg = b''.join([self.video_buffer[frame_id]['chunks'][i] for i in range(total_chunks)])
            self.app.render_video_frame(full_jpg)
            del self.video_buffer[frame_id]

    def update_user_list(self):
        if self.is_host:
            user_data = []
            for uid, peer in self.connected_peers.items():
                live_str = "1" if peer["is_live"] else "0"
                dp_str = self.dp_cache.get(uid, "")
                bio = peer.get('bio', '')
                user_data.append(f"{uid}:{peer['nick']}:{live_str}:{dp_str}:{bio}")
            
            payload = ",".join(user_data)
            self.broadcast(f"LIST|Host|{payload}".encode())
            
            parsed = [u.split(':', 4) for u in user_data]
            self.app.update_user_list_ui(parsed)

    def send_text(self, text):
        data = f"T|{self.uid}|{self.nickname}|{text}".encode()
        if self.is_host: 
            if self.chat_logger: self.chat_logger.add_message(self.uid, self.nickname, text)
            self.broadcast(data)
        else: 
            self.send_packet(data)

    def send_audio(self, audio_bytes):
        data = f"A|{self.uid}|".encode() + audio_bytes
        if self.is_host: self.broadcast(data)
        else: self.send_packet(data)

    def send_video_frame(self, frame_id, jpeg_bytes):
        chunks = [jpeg_bytes[i:i + UDP_MAX_SIZE] for i in range(0, len(jpeg_bytes), UDP_MAX_SIZE)]
        for i, chunk in enumerate(chunks):
            data = f"V|{self.uid}|{frame_id}|{len(chunks)}|{i}|".encode() + chunk
            if self.is_host: self.broadcast(data)
            else: self.send_packet(data)

    def shutdown(self):
        self.running = False
        leave_pkt = f"LEAVE|{self.uid}".encode()
        if self.is_host:
            self.broadcast(leave_pkt)
        elif self.current_target:
            self.send_packet(leave_pkt, self.current_target)
        try: self.sock.close()
        except: pass