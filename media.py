import cv2
import numpy as np
import mss
import pyaudio
from PIL import Image

AUDIO_FORMAT = pyaudio.paInt16
AUDIO_CHANNELS = 1
AUDIO_CHUNK = 1024

class MediaManager:
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.audio_in_stream = None
        self.audio_out_stream = None
        self.is_mic_muted = False
        self.is_deafened = False
        
    def start_audio(self):
        rates_to_try = [44100, 48000]
        for rate in rates_to_try:
            mic_ok = False
            speaker_ok = False
            
            if self.audio_in_stream is None:
                try:
                    self.audio_in_stream = self.p.open(format=AUDIO_FORMAT, channels=AUDIO_CHANNELS, rate=rate, input=True, frames_per_buffer=AUDIO_CHUNK)
                    mic_ok = True
                except: pass
                    
            if self.audio_out_stream is None:
                try:
                    self.audio_out_stream = self.p.open(format=AUDIO_FORMAT, channels=AUDIO_CHANNELS, rate=rate, output=True, frames_per_buffer=AUDIO_CHUNK)
                    speaker_ok = True
                except: pass
            
            if mic_ok or speaker_ok:
                print(f"Audio initialized at {rate} Hz (Mic: {mic_ok}, Speaker: {speaker_ok}).")
                break
                
    def stop_audio(self):
        try:
            if self.audio_in_stream: self.audio_in_stream.stop_stream(); self.audio_in_stream.close()
            if self.audio_out_stream: self.audio_out_stream.stop_stream(); self.audio_out_stream.close()
            self.p.terminate()
        except: pass

    def get_audio_chunk(self):
        if self.audio_in_stream and not self.is_mic_muted:
            try: return self.audio_in_stream.read(AUDIO_CHUNK, exception_on_overflow=False)
            except: pass
        return None

    def play_audio_chunk(self, chunk):
        if self.audio_out_stream and not getattr(self, 'is_deafened', False):
            try: self.audio_out_stream.write(chunk)
            except: pass

    def extract_video_frame(self, path):
        try:
            cap = cv2.VideoCapture(path)
            ret, frame = cap.read()
            cap.release()
            if ret:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                return Image.fromarray(frame)
        except: pass
        return None

    def capture_screen_jpeg(self, max_width=1280, region=None, monitor_idx=1):
        try:
            with mss.mss() as sct:
                if region: sct_img = sct.grab(region)
                else:
                    if monitor_idx >= len(sct.monitors): monitor_idx = 1
                    sct_img = sct.grab(sct.monitors[monitor_idx])
            img = np.array(sct_img)
            height, width = img.shape[:2]
            if width > max_width:
                scale = max_width / width
                img = cv2.resize(img, (int(width * scale), int(height * scale)))
            img_bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 40] 
            result, encimg = cv2.imencode('.jpg', img_bgr, encode_param)
            if result: return encimg.tobytes()
        except Exception: pass
        return None