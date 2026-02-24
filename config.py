import json
import os
import string
import random

CONFIG_FILE = "hub_config.json"

class ConfigManager:
    @staticmethod
    def generate_uid(length=18):
        chars = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(random.choice(chars) for _ in range(length))

    @staticmethod
    def generate_room_code():
        return ''.join(random.choices(string.digits, k=10))

    @staticmethod
    def load_config():
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    config = ConfigManager.get_default()
                    config.update(data)
                    return config
            except: pass
        
        default_config = ConfigManager.get_default()
        ConfigManager.save_config(default_config)
        return default_config

    @staticmethod
    def get_default():
        return {
            "uid": ConfigManager.generate_uid(),
            "nickname": "NewUser",
            "bio": "Hey there! I am using Unified Hub.",
            "dp_path": "",
            "saved_channels": []
        }

    @staticmethod
    def save_config(config):
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=4)