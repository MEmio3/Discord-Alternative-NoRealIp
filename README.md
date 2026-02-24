<div align="center">
  
# 🚀 Unified Hub
**The Ultimate P2P Discord Alternative**

[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![UI: Eel](https://img.shields.io/badge/UI-Eel-lightgrey.svg)](https://github.com/python-eel/Eel)
[![Networking: UDP](https://img.shields.io/badge/Networking-UDP%20Sockets-success.svg)](#)

*Imagine connecting with your friends, sharing screens at blazing-fast speeds, and chatting in high-quality voice—all without a centralized server harvesting your data or needing a static public IP.*

[//]: # (Replace the link below with an actual screenshot of your app once uploaded to your repo)
![Unified Hub Screenshot](https://via.placeholder.com/800x400?text=Insert+Screenshot+of+Unified+Hub+Web+UI+Here)

</div>

---

## 📖 About Unified Hub

Unified Hub is a completely **Peer-to-Peer (P2P)** voice, text, and screen-sharing application. It features a beautiful, modern Web UI powered by an ultra-fast Python UDP backend. 

Whether you are on a local Wi-Fi network or using a free Virtual LAN (like ZeroTier or Radmin VPN), Unified Hub gives you full control of your communication.

---

## ✨ Features

* 🖥️ **Beautiful Native Web UI:** A sleek, dark-themed, Discord-style interface running locally via Eel.
* ⚡ **Blazing Fast P2P UDP:** Direct connections mean zero server lag, zero voice delays, and maximum privacy.
* 🎬 **Screen & Window Sharing:** Stream your whole monitor or specific application windows (like games or VSCode) with adjustable Resolutions and FPS!
* 📁 **Rich Media Chat:** Share files, images, and videos with instant in-chat previews and persistent chat logs.
* 🔄 **Host Migration:** If the room creator leaves, the server doesn't die! A secondary host can seamlessly take over.
* 🎧 **Advanced Audio Control:** Discord-style dropdowns to switch your Microphone and Speaker devices instantly mid-call.
* 🛡️ **No Real IP Required:** Works flawlessly over standard LAN or free Virtual LAN networks.

---

## 🛠️ Prerequisites

Before you install, you need two things:

1.  **Python 3.10+**: Download from [Python.org](https://www.python.org/downloads/).
    > ⚠️ **CRITICAL:** During the Python installation, you MUST check the box at the bottom that says **"Add Python.exe to PATH"**.
2.  **(Optional) A Virtual LAN**: If you are playing with friends over the internet (not in the same house), download a free VPN like **Radmin VPN** or **ZeroTier** so you can connect as if you were on the same Wi-Fi.

---

## 🚀 Installation & Setup

We have made the installation completely automated.

1.  **Download the App:** Click the green `<> Code` button at the top of this repository and select **Download ZIP**.
2.  **Extract:** Right-click the `.zip` file and select "Extract All...".
3.  **Run the Setup:** Open the extracted folder and double-click the `run.bat` file.
4.  **Wait:** A black terminal window will open. It will automatically download all the necessary background engines (`pyaudio`, `opencv`, `eel`, etc.).
5.  **Launch:** Once the terminal finishes, your browser will automatically pop open with the Unified Hub application!

*(Note: You only have to wait for the downloads the very first time you run it. After that, it launches instantly!)*

---

## 🎮 How to Play with Friends

### Step 1: The Host Creates the Room
1. Open Unified Hub via `run.bat`.
2. Set up your **Profile** (Avatar, Nickname).
3. On the Dashboard, go to the **HOST** card.
4. Name your room.
5. In the **HOST IP / BIND ADDRESS** box, leave it as `0.0.0.0` *(This tells the app to accept connections from anyone)*.
6. Click **INITIATE HOST**.

### Step 2: Friends Join the Room
1. Your friends open their Unified Hub via `run.bat`.
2. On the Dashboard, they go to the **JOIN** card.
3. **HOST IP:** They type in your IP address.
   * *If on the same Wi-Fi:* Give them your local IPv4 address (e.g., `192.168.1.x`).
   * *If using Radmin/ZeroTier:* Give them the IP address the VPN software assigned to you.
4. **PORT:** They enter the exact port you hosted on *(Default is 25565)*.
5. **PASSWORD:** Enter the password if the host set one.
6. Click **REQUEST ACCESS**. Welcome to the room!

---

## ⚙️ App Navigation & Tips

* **Change PFP Mid-Call:** Click the ⚙️ icon in the top right of the Voice Channel to instantly change your Display Name or Profile Picture. It will sync to everyone in real-time!
* **Player Cards:** Hover over any user's profile picture in the chat to see their unchangeable `HashID` (to prevent impersonation). Click the avatar to pin the card open and adjust their personal volume!
* **Audio Devices:** Right-click (or click the tiny arrow on) the Mic/Deafen buttons to open a sleek menu where you can swap your input/output hardware.
* **Stream Fullscreen:** Double-click the video player to go full-screen while watching a friend's stream!
* **Saved Channels:** The app remembers every room you join or host. Next time you open the app, just click "Launch" on the Dashboard to restore the room and all its chat history!

---

## 🛑 Troubleshooting

If `run.bat` fails to install the dependencies and crashes, it is usually an issue with PyAudio.

**Fixing PyAudio Errors:**
PyAudio requires C++ build tools which most computers don't have. To fix this, open your Command Prompt (CMD) and run these two commands:

```bash
python -m pip install pipwin
python -m pipwin install pyaudio
