import json
import os

class ChatLogger:
    """Saves and Loads chat history based on the unique Room Code."""
    def __init__(self, room_code):
        self.room_code = room_code
        # Auto-create the logs folder
        os.makedirs("logs", exist_ok=True)
        self.filepath = os.path.join("logs", f"chat_log_{room_code}.json")
        self.history = []
        self.load()

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r') as f:
                    self.history = json.load(f)
            except:
                pass

    def save(self):
        with open(self.filepath, 'w') as f:
            json.dump(self.history[-100:], f, indent=4) # Keep the last 100 messages

    def add_message(self, uid, nick, msg):
        self.history.append({"uid": uid, "nick": nick, "msg": msg})
        self.save()