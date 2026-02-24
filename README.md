🚀 Unified Hub (Discord-Alternative-NoRealIp)

Imagine connecting with your friends, sharing screens at blazing-fast speeds, and chatting in high-quality voice—all without a centralized server harvesting your data or needing a static public IP.

Unified Hub is a completely Peer-to-Peer (P2P) voice, text, and screen-sharing application. It features a beautiful, modern Web UI powered by an ultra-fast Python UDP backend.

Whether you are on a local Wi-Fi network, or using a free Virtual LAN (like ZeroTier or Radmin VPN), Unified Hub gives you full control of your communication.

✨ Features

🖥️ Beautiful Native Web UI: A sleek, dark-themed, Discord-style interface running locally via Eel.

⚡ Blazing Fast P2P UDP: Direct connections mean zero server lag, zero voice delays, and maximum privacy.

🎬 Screen & Window Sharing: Stream your whole monitor or specific application windows (like games or VSCode) with adjustable Resolutions and FPS!

📁 Rich Media Chat: Share files, images, and videos with instant in-chat previews and persistent chat logs.

🔄 Host Migration: If the room creator leaves, the server doesn't die! A secondary host can seamlessly take over.

🎧 Advanced Audio Control: Discord-style dropdowns to switch your Microphone and Speaker devices instantly mid-call.

🛡️ No Real IP Required: Works flawlessly over standard LAN or free Virtual LAN networks.

🛠️ Prerequisites

Before you install, you need two things:

Python 3.10+: Download from Python.org.

⚠️ CRITICAL: During the Python installation, you MUST check the box at the bottom that says "Add Python.exe to PATH".

(Optional) A Virtual LAN: If you are playing with friends over the internet (not in the same house), download a free VPN like Radmin VPN or ZeroTier so you can connect as if you were on the same Wi-Fi!

🚀 Installation & Setup

We have made the installation completely automated.

Download the App: Click the green Code button at the top of this repository and select Download ZIP.

Extract: Right-click the .zip file and select "Extract All...".

Run the Setup: Open the extracted folder and double-click the run.bat file.

Wait: A black terminal window will open. It will automatically download all the necessary background engines (pyaudio, opencv, eel, etc.).

Launch: Once the terminal finishes, your browser will automatically pop open with the Unified Hub application!

(Note: You only have to wait for the downloads the very first time you run it. After that, it launches instantly!)

🎮 How to Play with Friends

Step 1: The Host Creates the Room

Open Unified Hub (run.bat).

Set up your Profile (Avatar, Nickname).

On the Dashboard, go to the HOST card.

Name your room.

In the HOST IP / BIND ADDRESS box, leave it as 0.0.0.0 (This tells the app to accept connections from anyone).

Click INITIATE HOST.

Step 2: Friends Join the Room

Your friends open their Unified Hub (run.bat).

On the Dashboard, they go to the JOIN card.

HOST IP: They type in your IP address.

If on the same Wi-Fi: Give them your local IPv4 address (e.g., 192.168.1.x).

If using Radmin/ZeroTier: Give them the IP address the VPN software assigned to you.

PORT: They enter the exact port you hosted on (Default is 25565).

PASSWORD: Enter the password if the host set one.

Click REQUEST ACCESS. Welcome to the room!

⚙️ App Navigation & Tips

Change PFP Mid-Call: Click the ⚙️ icon in the top right of the Voice Channel to instantly change your Display Name or Profile Picture. It will sync to everyone in real-time!

Player Cards: Hover over any user's profile picture in the chat to see their unchangeable HashID (to prevent impersonation). Click the avatar to pin the card open and adjust their personal volume!

Audio Devices: Right-click (or click the tiny arrow on) the Mic/Deafen buttons to open a sleek menu where you can swap your input/output hardware.

Stream Fullscreen: Double-click the video player to go full-screen while watching a friend's stream!

Saved Channels: The app remembers every room you join or host. Next time you open the app, just click "Launch" on the Dashboard to restore the room and all its chat history!

🛑 Troubleshooting pip Errors

If run.bat fails to install the dependencies and crashes, it is usually an issue with PyAudio.

Fixing PyAudio Errors:
PyAudio requires C++ build tools which most computers don't have. To fix this, open your Command Prompt (CMD) and run these two commands:

python -m pip install pipwin
python -m pipwin install pyaudio


Once that succeeds, simply double-click run.bat again and it will work perfectly!

💻 Tech Stack

Frontend: HTML5, CSS3 (Custom Xbox-Futuristic UI), Vanilla JavaScript.

Bridge: Eel (Python to JS bridge).

Backend Engine: Python 3.

Networking: Pure UDP Socket programming.

Media Handling: PyAudio (Audio streams), OpenCV & mss (Screen capturing and compression).

Created by [MEmio3]
